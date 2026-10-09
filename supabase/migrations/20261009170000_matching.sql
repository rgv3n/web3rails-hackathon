-- Front office · Fase 3 · facturas, propuestas y decisiones de match, excepciones, ajustes de conciliación

-- =====================================================================
-- 1. Ajustes por organización (decisiones de Rubén, 9-oct-2026)
-- =====================================================================
alter table public.organizations
  add column matching_tolerance numeric(18, 8) not null default 0.01,      -- absolute, in token units; shown in the UI
  add column matching_date_window_days int not null default 30,            -- block_time within [issued_at, due_at + N days]
  add column allow_self_approval boolean not null default false;           -- default: review by a different person

-- =====================================================================
-- 2. Facturas
-- =====================================================================
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid not null references public.legal_entities(id) on delete restrict,
  counterparty_name text not null,
  external_ref text not null,
  kind text not null check (kind in ('receivable', 'payable')),       -- receivable ↔ incoming movement, payable ↔ outgoing
  amount numeric(28, 8) not null check (amount > 0),
  currency text not null,                                              -- ISO fiat code or token symbol as written on the invoice
  token_mint text,                                                     -- set when the invoice is denominated in a known Solana stablecoin
  issued_at date not null,
  due_at date,
  document_ref text,
  status text not null default 'open' check (status in ('open', 'matched', 'void')),
  linked_movement_id uuid unique references public.movements(id) on delete set null,  -- 1:1 enforced here
  source text not null default 'import' check (source in ('import', 'manual', 'demo')),
  import_batch_id uuid references public.import_batches(id),
  version int not null default 1,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, external_ref)
);
create trigger invoices_updated_at before update on public.invoices for each row execute function public.set_updated_at();
create index invoices_org_status_idx on public.invoices(org_id, status);
alter table public.invoices add column amount_text text generated always as (amount::text) stored;

-- Known Solana stablecoin mints (symbol → mint). Extend by migration, never by UI.
create table public.known_tokens (
  chain text not null,
  symbol text not null,
  mint text not null,
  decimals int not null,
  primary key (chain, mint)
);
insert into public.known_tokens (chain, symbol, mint, decimals) values
  ('solana', 'USDC', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 6),
  ('solana', 'USDT', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 6),
  ('solana', 'EURC', 'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr', 6);

-- Addresses learned from confirmed decisions (spec loop B: only saved when the user confirms).
create table public.counterparty_addresses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  chain text not null,
  address text not null,
  counterparty_name text not null,
  learned_from uuid,                       -- match_decisions.id
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (org_id, chain, address, counterparty_name)
);

-- =====================================================================
-- 3. Propuestas y decisiones
-- =====================================================================
create table public.match_proposals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  movement_id uuid not null references public.movements(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  signals text[] not null,                 -- reference_exact, counterparty_known, amount_compatible, date_window
  differences jsonb not null default '{}', -- {"amount_diff": "0.00", "days_from_due": 3}
  rule_version text not null,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'rejected', 'superseded')),
  created_at timestamptz not null default now(),
  unique (movement_id, invoice_id, rule_version)
);
create index match_proposals_movement_idx on public.match_proposals(movement_id, status);

create table public.match_decisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  movement_id uuid not null references public.movements(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  proposal_id uuid references public.match_proposals(id) on delete set null,
  kind text not null check (kind in ('accept', 'manual_link', 'reject', 'unlink')),
  actor_id uuid references public.profiles(id),
  reason text,
  movement_version int not null,
  invoice_version int,
  decided_at timestamptz not null default now()
);
create index match_decisions_movement_idx on public.match_decisions(movement_id, decided_at desc);

alter table public.movements add column matched_invoice_id uuid references public.invoices(id) on delete set null;

-- more exception kinds
alter table public.exceptions drop constraint exceptions_kind_check;
alter table public.exceptions add constraint exceptions_kind_check check (kind in (
  'import_discrepancy', 'missing_context', 'no_invoice', 'amount_mismatch', 'ambiguous_match', 'unsupported_partial', 'currency_incompatible', 'other'));
alter table public.exceptions add column comments jsonb not null default '[]';

-- RLS
alter table public.invoices enable row level security;
alter table public.known_tokens enable row level security;
alter table public.counterparty_addresses enable row level security;
alter table public.match_proposals enable row level security;
alter table public.match_decisions enable row level security;
create policy "members read invoices" on public.invoices for select using (public.is_member(org_id));
create policy "anyone reads known tokens" on public.known_tokens for select using (true);
create policy "members read learned addresses" on public.counterparty_addresses for select using (public.is_member(org_id));
create policy "members read proposals" on public.match_proposals for select using (public.is_member(org_id));
create policy "members read decisions" on public.match_decisions for select using (public.is_member(org_id));

-- =====================================================================
-- 4. Importación de facturas (idempotente por external_ref)
-- rows: [{external_ref, counterparty_name, kind, amount, currency, issued_at, due_at, entity_name?, document_ref?}]
-- =====================================================================
create or replace function public.import_invoices(p_org uuid, p_filename text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid; v_row jsonb; v_i int := 0;
  v_ins int := 0; v_dup int := 0; v_disc int := 0; v_err int := 0; v_errors jsonb := '[]';
  v_entity uuid; v_amount numeric(28,8); v_mint text; v_existing record; v_kind text; v_issued date; v_due date; v_currency text; v_source text;
begin
  if not public.has_role(p_org, '{admin,operator}') then raise exception 'FORBIDDEN: import requires admin or operator'; end if;
  v_source := case when exists (select 1 from public.organizations where id = p_org and is_demo) then 'demo' else 'import' end;
  insert into public.import_batches (org_id, kind, source, filename, rows_total, created_by)
  values (p_org, 'invoices', v_source::public.movement_source, p_filename, jsonb_array_length(p_rows), auth.uid()) returning id into v_batch;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    begin
      if coalesce(trim(v_row->>'external_ref'),'') = '' then raise exception 'external_ref required'; end if;
      if coalesce(trim(v_row->>'counterparty_name'),'') = '' then raise exception 'counterparty_name required'; end if;
      v_kind := lower(coalesce(v_row->>'kind','receivable'));
      if v_kind not in ('receivable','payable') then raise exception 'kind must be receivable or payable'; end if;
      if coalesce(v_row->>'amount','') !~ '^[0-9]+(\.[0-9]{1,8})?$' then raise exception 'amount must be a positive decimal with up to 8 places'; end if;
      v_amount := (v_row->>'amount')::numeric(28,8);
      if v_amount <= 0 then raise exception 'amount must be > 0'; end if;
      v_currency := upper(trim(coalesce(v_row->>'currency','')));
      if v_currency = '' then raise exception 'currency required'; end if;
      select mint into v_mint from public.known_tokens where chain = 'solana' and (symbol = v_currency or mint = v_row->>'currency');
      begin v_issued := (v_row->>'issued_at')::date; exception when others then raise exception 'invalid issued_at'; end;
      if v_issued is null then raise exception 'issued_at required'; end if;
      begin v_due := nullif(v_row->>'due_at','')::date; exception when others then raise exception 'invalid due_at'; end;

      if coalesce(v_row->>'entity_name','') <> '' then
        select id into v_entity from public.legal_entities where org_id = p_org and name = v_row->>'entity_name';
        if v_entity is null then raise exception 'unknown entity_name'; end if;
      else
        select id into v_entity from public.legal_entities where org_id = p_org order by created_at limit 1;
      end if;

      select * into v_existing from public.invoices where org_id = p_org and external_ref = trim(v_row->>'external_ref');
      if found then
        if v_existing.amount = v_amount and v_existing.counterparty_name = trim(v_row->>'counterparty_name') and v_existing.currency = v_currency then
          v_dup := v_dup + 1;
        else
          v_disc := v_disc + 1;
          raise exception 'reference % already exists with different amount, counterparty or currency (stored values kept)', trim(v_row->>'external_ref');
        end if;
      else
        insert into public.invoices (org_id, entity_id, counterparty_name, external_ref, kind, amount, currency, token_mint, issued_at, due_at, document_ref, source, import_batch_id, created_by)
        values (p_org, v_entity, trim(v_row->>'counterparty_name'), trim(v_row->>'external_ref'), v_kind, v_amount, v_currency, v_mint, v_issued, v_due, nullif(v_row->>'document_ref',''), v_source, v_batch, auth.uid());
        v_ins := v_ins + 1;
      end if;
    exception when others then
      v_err := v_err + 1;
      v_errors := v_errors || jsonb_build_object('row', v_i, 'error', sqlerrm);
    end;
  end loop;

  update public.import_batches set rows_inserted = v_ins, rows_duplicate = v_dup, rows_discrepant = v_disc, rows_error = v_err, errors = v_errors where id = v_batch;
  insert into public.audit_events (org_id, actor_id, entity, entity_id, action, after)
  values (p_org, auth.uid(), 'import_batch', v_batch, 'imported', jsonb_build_object('kind', 'invoices', 'filename', p_filename, 'inserted', v_ins, 'duplicate', v_dup, 'discrepant', v_disc, 'errors', v_err));
  perform public.run_matching(p_org, null);
  return jsonb_build_object('batch_id', v_batch, 'inserted', v_ins, 'duplicate', v_dup, 'discrepant', v_disc, 'errors', v_errors);
end $$;

-- =====================================================================
-- 5. Matching determinista v1 (propone; nunca acepta)
-- Candidate = open invoice, same org + entity + token mint, direction compatible, not linked, and
--             (amount within tolerance OR reference exact). Signals are named, never scored.
-- =====================================================================
create or replace function public.open_exception(p_org uuid, p_movement uuid, p_kind text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if exists (select 1 from public.exceptions where movement_id = p_movement and kind = p_kind and status <> 'resolved') then return; end if;
  insert into public.exceptions (org_id, movement_id, kind, reason) values (p_org, p_movement, p_kind, p_reason) returning id into v_id;
  insert into public.audit_events (org_id, actor_id, actor_kind, entity, entity_id, action, after)
  values (p_org, null, 'system', 'exception', v_id, 'opened', jsonb_build_object('kind', p_kind, 'reason', p_reason, 'movement_id', p_movement));
end $$;

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
    v_ref := nullif(trim(v_m.ctx_reference), '');
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

-- Re-run matching after a context revision.
create or replace function public.after_context_saved()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.run_matching(new.org_id, new.id);
  return null;
end $$;
create trigger movements_context_changed after update of context_version on public.movements
  for each row execute function public.after_context_saved();

-- =====================================================================
-- 6. Decisiones (explícitas, con permiso, versionadas, auditadas)
-- =====================================================================
create or replace function public.decide_match(
  p_movement uuid, p_invoice uuid, p_kind text, p_expected_version int, p_reason text, p_learn_address boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_m public.movements%rowtype; v_inv public.invoices%rowtype; v_prop public.match_proposals%rowtype; v_dec uuid; v_other text;
begin
  select * into v_m from public.movements where id = p_movement for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.has_role(v_m.org_id, '{operator,reviewer}') then raise exception 'FORBIDDEN: deciding matches requires operator or reviewer'; end if;
  if v_m.context_version <> p_expected_version then
    raise exception 'CONFLICT: the record changed (version % now, you had %). Reload before deciding.', v_m.context_version, p_expected_version;
  end if;
  if p_kind not in ('accept','manual_link','reject','unlink') then raise exception 'INVALID: kind'; end if;

  if p_kind in ('accept','manual_link') then
    if v_m.reconciliation_status = 'matched' then raise exception 'CONFLICT: this movement is already matched. Unlink first.'; end if;
    select * into v_inv from public.invoices where id = p_invoice and org_id = v_m.org_id for update;   -- row lock prevents the double-link race
    if not found then raise exception 'NOT_FOUND: invoice'; end if;
    if v_inv.status <> 'open' or v_inv.linked_movement_id is not null then raise exception 'CONFLICT: invoice % is already linked to another movement', v_inv.external_ref; end if;
    if v_inv.entity_id <> v_m.entity_id then raise exception 'INVALID: invoice belongs to another legal entity'; end if;
    if v_inv.token_mint is distinct from v_m.token_mint then raise exception 'INVALID: invoice currency is not the movement token; no explicit conversion exists'; end if;
    select * into v_prop from public.match_proposals where movement_id = p_movement and invoice_id = p_invoice and status = 'proposed';
    if p_kind = 'accept' and v_prop.id is null then raise exception 'INVALID: no open proposal for this invoice; use a manual link'; end if;

    insert into public.match_decisions (org_id, movement_id, invoice_id, proposal_id, kind, actor_id, reason, movement_version, invoice_version)
    values (v_m.org_id, p_movement, p_invoice, v_prop.id, p_kind, auth.uid(), nullif(trim(p_reason),''), v_m.context_version, v_inv.version) returning id into v_dec;
    update public.invoices set status = 'matched', linked_movement_id = p_movement, version = version + 1 where id = p_invoice;
    update public.match_proposals set status = case when id = v_prop.id then 'accepted' else 'superseded' end where movement_id = p_movement and status = 'proposed';
    update public.movements set reconciliation_status = 'matched', matched_invoice_id = p_invoice,
      review_status = case when review_status = 'approved' then 'pending' else review_status end where id = p_movement;
    update public.exceptions set status = 'resolved', resolution = 'Matched to invoice ' || v_inv.external_ref, resolved_by = auth.uid(), resolved_at = now()
      where movement_id = p_movement and kind in ('no_invoice','ambiguous_match','unsupported_partial','amount_mismatch') and status <> 'resolved';
    if p_learn_address then
      v_other := case when v_m.direction = 'in' then v_m.from_address else v_m.to_address end;
      insert into public.counterparty_addresses (org_id, chain, address, counterparty_name, learned_from, created_by)
      values (v_m.org_id, 'solana', v_other, v_inv.counterparty_name, v_dec, auth.uid()) on conflict do nothing;
    end if;
    insert into public.audit_events (org_id, actor_id, entity, entity_id, action, after, reason)
    values (v_m.org_id, auth.uid(), 'match', p_movement, p_kind,
      jsonb_build_object('invoice', v_inv.external_ref, 'invoice_id', p_invoice, 'signals', v_prop.signals, 'differences', v_prop.differences, 'learned_address', p_learn_address), nullif(trim(p_reason),''));

  elsif p_kind = 'reject' then
    update public.match_proposals set status = 'rejected' where movement_id = p_movement and invoice_id = p_invoice and status = 'proposed';
    if not found then raise exception 'INVALID: no open proposal to reject'; end if;
    insert into public.match_decisions (org_id, movement_id, invoice_id, kind, actor_id, reason, movement_version)
    values (v_m.org_id, p_movement, p_invoice, 'reject', auth.uid(), nullif(trim(p_reason),''), v_m.context_version) returning id into v_dec;
    if not exists (select 1 from public.match_proposals where movement_id = p_movement and status = 'proposed') then
      update public.movements set reconciliation_status = 'unmatched' where id = p_movement;
      update public.exceptions set status = 'resolved', resolution = 'Candidates rejected', resolved_at = now(), resolved_by = auth.uid() where movement_id = p_movement and kind = 'ambiguous_match' and status <> 'resolved';
      perform public.open_exception(v_m.org_id, p_movement, 'no_invoice', 'All candidates were rejected by ' || coalesce((select full_name from public.profiles where id = auth.uid()), 'a user') || '.');
    end if;
    insert into public.audit_events (org_id, actor_id, entity, entity_id, action, after, reason)
    values (v_m.org_id, auth.uid(), 'match', p_movement, 'reject', jsonb_build_object('invoice_id', p_invoice), nullif(trim(p_reason),''));

  else -- unlink
    if v_m.matched_invoice_id is null then raise exception 'INVALID: nothing to unlink'; end if;
    if nullif(trim(p_reason),'') is null then raise exception 'INVALID: a reason is required to unlink'; end if;
    update public.invoices set status = 'open', linked_movement_id = null, version = version + 1 where id = v_m.matched_invoice_id;
    insert into public.match_decisions (org_id, movement_id, invoice_id, kind, actor_id, reason, movement_version)
    values (v_m.org_id, p_movement, v_m.matched_invoice_id, 'unlink', auth.uid(), trim(p_reason), v_m.context_version) returning id into v_dec;
    update public.movements set reconciliation_status = 'unmatched', matched_invoice_id = null,
      review_status = case when review_status = 'approved' then 'pending' else review_status end where id = p_movement;
    insert into public.audit_events (org_id, actor_id, entity, entity_id, action, before, reason)
    values (v_m.org_id, auth.uid(), 'match', p_movement, 'unlink', jsonb_build_object('invoice_id', v_m.matched_invoice_id, 'approval_invalidated', v_m.review_status = 'approved'), trim(p_reason));
    perform public.run_matching(v_m.org_id, p_movement);
  end if;
  return v_dec;
end $$;

-- =====================================================================
-- 7. Excepciones: asignar, comentar, poner en espera, resolver
-- =====================================================================
create or replace function public.update_exception(p_id uuid, p_status text, p_assignee uuid, p_comment text, p_resolution text)
returns void language plpgsql security definer set search_path = public as $$
declare v_e public.exceptions%rowtype;
begin
  select * into v_e from public.exceptions where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.has_role(v_e.org_id, '{operator,reviewer}') then raise exception 'FORBIDDEN: resolving exceptions requires operator or reviewer'; end if;
  if p_status not in ('open','waiting','resolved') then raise exception 'INVALID: status'; end if;
  if p_status = 'waiting' and nullif(trim(p_comment),'') is null and nullif(trim(v_e.resolution),'') is null then raise exception 'INVALID: say what you are waiting for'; end if;
  if p_status = 'resolved' and nullif(trim(p_resolution),'') is null then raise exception 'INVALID: a resolution is required'; end if;
  if p_assignee is not null and not exists (select 1 from public.memberships where org_id = v_e.org_id and user_id = p_assignee) then raise exception 'INVALID: assignee is not a member'; end if;
  update public.exceptions set
    status = p_status,
    assignee_id = coalesce(p_assignee, assignee_id),
    comments = case when nullif(trim(p_comment),'') is null then comments else comments || jsonb_build_object('by', auth.uid(), 'at', now(), 'text', trim(p_comment)) end,
    resolution = case when p_status = 'resolved' then trim(p_resolution) else resolution end,
    resolved_by = case when p_status = 'resolved' then auth.uid() else null end,
    resolved_at = case when p_status = 'resolved' then now() else null end
  where id = p_id;
  insert into public.audit_events (org_id, actor_id, entity, entity_id, action, before, after, reason)
  values (v_e.org_id, auth.uid(), 'exception', p_id,
    case when p_status = 'resolved' then 'resolved' when p_status = 'waiting' then 'waiting' when v_e.status = 'resolved' then 'reopened' when p_assignee is not null and p_assignee is distinct from v_e.assignee_id then 'assigned' else 'commented' end,
    jsonb_build_object('status', v_e.status, 'assignee', v_e.assignee_id), jsonb_build_object('status', p_status, 'assignee', coalesce(p_assignee, v_e.assignee_id), 'kind', v_e.kind), coalesce(nullif(trim(p_resolution),''), nullif(trim(p_comment),'')));
end $$;

-- Matching settings are changed only by admins through this function (audited).
create or replace function public.update_matching_settings(p_org uuid, p_tolerance numeric, p_window_days int, p_allow_self_approval boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_o public.organizations%rowtype;
begin
  select * into v_o from public.organizations where id = p_org for update;
  if not public.has_role(p_org, '{admin}') then raise exception 'FORBIDDEN'; end if;
  if p_tolerance < 0 or p_window_days < 0 then raise exception 'INVALID: negative'; end if;
  update public.organizations set matching_tolerance = p_tolerance, matching_date_window_days = p_window_days, allow_self_approval = p_allow_self_approval where id = p_org;
  insert into public.audit_events (org_id, actor_id, entity, entity_id, action, before, after)
  values (p_org, auth.uid(), 'matching_settings', p_org, 'updated',
    jsonb_build_object('tolerance', v_o.matching_tolerance, 'window_days', v_o.matching_date_window_days, 'allow_self_approval', v_o.allow_self_approval),
    jsonb_build_object('tolerance', p_tolerance, 'window_days', p_window_days, 'allow_self_approval', p_allow_self_approval));
  perform public.run_matching(p_org, null);
end $$;
