-- Matching reads the payment memo (Solana Pay reference) as the reference when the operator has not recorded one.
-- Same function as 20261009170000_matching.sql with one change in how v_ref is derived.
create or replace function public.run_matching(p_org uuid, p_movement uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org public.organizations%rowtype;
  v_m record; v_inv record;
  v_amount numeric(28,8); v_ref text; v_cp text; v_other text;
  v_signals text[]; v_diff numeric(28,8); v_candidates int; v_days int;
  v_partial boolean; v_nearest_diff numeric(28,8); v_nearest_ref text; v_nearest_greater boolean; v_larger_ref text; v_larger_amount numeric(28,8);
begin
  select * into v_org from public.organizations where id = p_org;
  for v_m in
    select m.*, r.reference as ctx_reference, r.counterparty_name as ctx_counterparty, r.category as ctx_category
    from public.movements m
    left join public.movement_context_revisions r on r.movement_id = m.id and r.version = m.context_version
    where m.org_id = p_org and (p_movement is null or m.id = p_movement)
      and m.reconciliation_status in ('unmatched', 'proposed')
  loop
    -- supersede previous open proposals for this movement
    update public.match_proposals set status = 'superseded' where movement_id = v_m.id and status = 'proposed';
    -- categories that are not reconcilable against invoices
    if v_m.ctx_category in ('internal_transfer', 'fee', 'treasury') then
      update public.movements set reconciliation_status = 'not_applicable' where id = v_m.id;
      update public.exceptions set status = 'resolved', resolution = 'Category does not require an invoice', resolved_at = now()
        where movement_id = v_m.id and kind in ('no_invoice','ambiguous_match','unsupported_partial') and status <> 'resolved';
      continue;
    end if;

    v_amount := v_m.amount_raw / power(10::numeric, v_m.token_decimals);
    -- Reference: what the operator recorded, else the payment memo carried by the transaction (Solana Pay convention).
    v_ref := coalesce(nullif(trim(v_m.ctx_reference), ''), nullif(trim(v_m.raw->>'memo'), ''));
    v_cp := nullif(trim(v_m.ctx_counterparty), '');
    v_other := case when v_m.direction = 'in' then v_m.from_address else v_m.to_address end;
    v_candidates := 0; v_partial := false; v_nearest_diff := null; v_nearest_ref := null; v_nearest_greater := null; v_larger_ref := null; v_larger_amount := null;

    for v_inv in
      select i.* from public.invoices i
      where i.org_id = p_org and i.entity_id = v_m.entity_id and i.status = 'open' and i.linked_movement_id is null
        and i.token_mint = v_m.token_mint
        and i.kind = case when v_m.direction = 'in' then 'receivable' else 'payable' end
    loop
      v_signals := '{}';
      v_diff := abs(v_inv.amount - v_amount);
      if v_ref is not null and lower(v_inv.external_ref) = lower(v_ref) then v_signals := array_append(v_signals, 'reference_exact'); end if;
      if (v_cp is not null and lower(v_inv.counterparty_name) = lower(v_cp))
         or exists (select 1 from public.counterparty_addresses ca where ca.org_id = p_org and ca.chain = 'solana' and ca.address = v_other and lower(ca.counterparty_name) = lower(v_inv.counterparty_name))
      then v_signals := array_append(v_signals, 'counterparty_known'); end if;
      if v_diff <= v_org.matching_tolerance then v_signals := array_append(v_signals, 'amount_compatible'); end if;
      v_days := (v_m.block_time::date - coalesce(v_inv.due_at, v_inv.issued_at));
      if v_m.block_time::date >= v_inv.issued_at and v_days <= v_org.matching_date_window_days then v_signals := array_append(v_signals, 'date_window'); end if;

      if 'amount_compatible' = any(v_signals) or 'reference_exact' = any(v_signals) then
        v_candidates := v_candidates + 1;
        insert into public.match_proposals (org_id, movement_id, invoice_id, signals, differences, rule_version, status)
        values (p_org, v_m.id, v_inv.id, v_signals,
                jsonb_build_object('amount_diff', v_diff::text, 'invoice_amount', v_inv.amount::text, 'movement_amount', v_amount::text, 'days_from_due', v_days, 'tolerance', v_org.matching_tolerance::text),
                'v1', 'proposed')
        on conflict (movement_id, invoice_id, rule_version) do update set signals = excluded.signals, differences = excluded.differences, status = 'proposed', created_at = now();
        insert into public.audit_events (org_id, actor_id, actor_kind, entity, entity_id, action, after)
        values (p_org, null, 'system', 'match', v_m.id, 'proposed', jsonb_build_object('invoice_id', v_inv.id, 'invoice', v_inv.external_ref, 'signals', v_signals, 'rule_version', 'v1', 'amount_diff', v_diff::text));
      elsif 'counterparty_known' = any(v_signals) then
        -- Same counterparty, amount outside tolerance: remember the closest invoice to explain the exception.
        if v_nearest_diff is null or v_diff < v_nearest_diff then
          v_nearest_diff := v_diff; v_nearest_ref := v_inv.external_ref; v_nearest_greater := v_inv.amount > v_amount;
        end if;
        if v_inv.amount > v_amount and (v_larger_amount is null or v_inv.amount < v_larger_amount) then
          v_larger_ref := v_inv.external_ref; v_larger_amount := v_inv.amount;   -- smallest invoice that is still larger than the movement
        end if;
      end if;
    end loop;

    if v_candidates = 1 then
      update public.movements set reconciliation_status = 'proposed' where id = v_m.id;
      update public.exceptions set status = 'resolved', resolution = 'A candidate was found', resolved_at = now()
        where movement_id = v_m.id and kind in ('no_invoice','ambiguous_match','unsupported_partial') and status <> 'resolved';
    elsif v_candidates > 1 then
      update public.movements set reconciliation_status = 'proposed' where id = v_m.id;
      update public.exceptions set status = 'resolved', resolution = 'Superseded by re-run', resolved_at = now()
        where movement_id = v_m.id and kind in ('no_invoice','unsupported_partial') and status <> 'resolved';
      perform public.open_exception(p_org, v_m.id, 'ambiguous_match', v_candidates || ' invoices are compatible. Choose one explicitly or reject.');
    else
      update public.movements set reconciliation_status = 'unmatched' where id = v_m.id;
      update public.exceptions set status = 'resolved', resolution = 'Superseded by re-run', resolved_at = now()
        where movement_id = v_m.id and kind = 'ambiguous_match' and status <> 'resolved';
      -- Closest same-counterparty invoice: larger and far → partial payment (unsupported); otherwise → amount mismatch to review.
      -- Small difference to the closest invoice → mismatch to review. Otherwise, if a larger invoice of the same counterparty exists → partial payment.
      v_partial := v_nearest_ref is not null and v_nearest_diff > greatest(v_org.matching_tolerance * 100, v_amount * 0.05) and v_larger_ref is not null;
      if v_partial then
        update public.exceptions set status = 'resolved', resolution = 'Superseded by re-run', resolved_at = now() where movement_id = v_m.id and kind = 'amount_mismatch' and status <> 'resolved';
        perform public.open_exception(p_org, v_m.id, 'unsupported_partial', 'Looks like a partial payment of invoice ' || v_larger_ref || ' (' || (v_larger_amount - v_amount)::text || ' short). Partial and grouped payments are not supported in this version.');
      elsif v_nearest_ref is not null then
        update public.exceptions set status = 'resolved', resolution = 'Superseded by re-run', resolved_at = now() where movement_id = v_m.id and kind = 'unsupported_partial' and status <> 'resolved';
        perform public.open_exception(p_org, v_m.id, 'amount_mismatch', 'Closest invoice ' || v_nearest_ref || ' from the same counterparty differs by ' || v_nearest_diff::text || ' (tolerance ' || v_org.matching_tolerance::text || '). Link it manually with a reason, or correct the invoice.');
      elsif v_m.identification_status = 'identified' then
        perform public.open_exception(p_org, v_m.id, 'no_invoice', 'No open invoice in the same token, entity and direction is compatible (tolerance ' || v_org.matching_tolerance::text || ').');
      end if;
    end if;
  end loop;
end $$;
