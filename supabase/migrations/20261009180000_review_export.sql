-- Front office · Fase 4 · aprobación, devolución, invalidación y exportación snapshot

-- =====================================================================
-- 1. Revisiones (aprobar / devolver)
-- =====================================================================
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  movement_id uuid not null references public.movements(id) on delete cascade,
  action text not null check (action in ('approved', 'returned', 'invalidated')),
  actor_id uuid references public.profiles(id),          -- null when invalidated by the system
  reason text,
  context_version int not null,
  invoice_id uuid references public.invoices(id) on delete set null,
  decided_at timestamptz not null default now()
);
create index reviews_movement_idx on public.reviews(movement_id, decided_at desc);
alter table public.reviews enable row level security;
create policy "members read reviews" on public.reviews for select using (public.is_member(org_id));

-- Why a movement cannot be approved right now. Empty array = eligible. The server decides; the UI only shows this.
create or replace function public.approval_blockers(p_movement uuid)
returns text[] language plpgsql security definer stable set search_path = public as $$
declare
  v_m public.movements%rowtype; v_org public.organizations%rowtype; v_b text[] := '{}';
  v_last_author uuid; v_last_decider uuid;
begin
  select * into v_m from public.movements where id = p_movement;
  if not found then return array['Movement not found']; end if;
  if not public.is_member(v_m.org_id) then return array['Not a member']; end if;
  select * into v_org from public.organizations where id = v_m.org_id;

  if v_m.source_status = 'failed' then v_b := array_append(v_b, 'Source transaction failed on chain'); end if;
  if v_m.identification_status <> 'identified' then v_b := array_append(v_b, 'Financial context incomplete (category and counterparty)'); end if;
  if v_m.reconciliation_status not in ('matched', 'not_applicable') then v_b := array_append(v_b, 'Not reconciled: link an invoice or classify as a category that needs none'); end if;
  if exists (select 1 from public.exceptions e where e.movement_id = p_movement and e.status <> 'resolved') then v_b := array_append(v_b, 'Open exceptions must be resolved first'); end if;
  if v_m.review_status = 'approved' then v_b := array_append(v_b, 'Already approved'); end if;

  if not v_org.allow_self_approval and auth.uid() is not null then
    select created_by into v_last_author from public.movement_context_revisions where movement_id = p_movement and version = v_m.context_version;
    select actor_id into v_last_decider from public.match_decisions where movement_id = p_movement and kind in ('accept','manual_link') order by decided_at desc limit 1;
    if v_last_author = auth.uid() or v_last_decider = auth.uid() then
      v_b := array_append(v_b, 'Self-approval is off for this organization: another reviewer must approve your own decisions');
    end if;
  end if;
  return v_b;
end $$;

create or replace function public.review_movement(p_movement uuid, p_action text, p_expected_version int, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_m public.movements%rowtype; v_blockers text[]; v_id uuid;
begin
  select * into v_m from public.movements where id = p_movement for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.has_role(v_m.org_id, '{reviewer}') then raise exception 'FORBIDDEN: approving or returning requires the reviewer role'; end if;
  if v_m.context_version <> p_expected_version then
    raise exception 'CONFLICT: the record changed (version % now, you had %). Reload before reviewing.', v_m.context_version, p_expected_version;
  end if;
  if p_action = 'approve' then
    v_blockers := public.approval_blockers(p_movement);
    if array_length(v_blockers, 1) > 0 then raise exception 'BLOCKED: %', array_to_string(v_blockers, ' · '); end if;
    insert into public.reviews (org_id, movement_id, action, actor_id, reason, context_version, invoice_id)
    values (v_m.org_id, p_movement, 'approved', auth.uid(), nullif(trim(p_reason),''), v_m.context_version, v_m.matched_invoice_id) returning id into v_id;
    update public.movements set review_status = 'approved' where id = p_movement;
    insert into public.audit_events (org_id, actor_id, entity, entity_id, action, after, reason)
    values (v_m.org_id, auth.uid(), 'review', p_movement, 'approved', jsonb_build_object('review_id', v_id, 'revision_version', v_m.context_version, 'invoice_id', v_m.matched_invoice_id), nullif(trim(p_reason),''));
  elsif p_action = 'return' then
    if nullif(trim(p_reason),'') is null then raise exception 'INVALID: a reason is required to return a record for correction'; end if;
    if v_m.review_status = 'approved' then raise exception 'INVALID: approved records are invalidated by a material correction, not returned'; end if;
    insert into public.reviews (org_id, movement_id, action, actor_id, reason, context_version, invoice_id)
    values (v_m.org_id, p_movement, 'returned', auth.uid(), trim(p_reason), v_m.context_version, v_m.matched_invoice_id) returning id into v_id;
    update public.movements set review_status = 'correction_requested' where id = p_movement;
    if not exists (select 1 from public.exceptions where movement_id = p_movement and kind = 'other' and status <> 'resolved' and reason like 'Returned by reviewer%') then
      insert into public.exceptions (org_id, movement_id, kind, reason, assignee_id)
      values (v_m.org_id, p_movement, 'other', 'Returned by reviewer: ' || trim(p_reason),
        (select created_by from public.movement_context_revisions where movement_id = p_movement and version = v_m.context_version));
    end if;
    insert into public.audit_events (org_id, actor_id, entity, entity_id, action, after, reason)
    values (v_m.org_id, auth.uid(), 'review', p_movement, 'returned', jsonb_build_object('review_id', v_id, 'revision_version', v_m.context_version), trim(p_reason));
  else
    raise exception 'INVALID: action';
  end if;
  return v_id;
end $$;

-- Material corrections after approval: record the invalidation (contract §4 "review invalidated").
create or replace function public.on_approval_invalidated()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.review_status = 'approved' and new.review_status = 'pending' then
    insert into public.reviews (org_id, movement_id, action, actor_id, reason, context_version, invoice_id)
    values (new.org_id, new.id, 'invalidated', auth.uid(), 'Material correction after approval', new.context_version, new.matched_invoice_id);
    insert into public.audit_events (org_id, actor_id, actor_kind, entity, entity_id, action, after, reason)
    values (new.org_id, auth.uid(), case when auth.uid() is null then 'system' else 'user' end, 'review', new.id, 'invalidated',
      jsonb_build_object('revision_version', new.context_version), 'Material correction after approval');
    -- A returned-for-correction exception is not opened here: the correction itself is what triggered this.
  end if;
  return null;
end $$;
create trigger movements_approval_invalidated after update of review_status on public.movements
  for each row execute function public.on_approval_invalidated();

-- Returned records go back to pending when the operator saves a new revision.
create or replace function public.on_context_after_return()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.review_status = 'correction_requested' and new.context_version > old.context_version then
    update public.movements set review_status = 'pending' where id = new.id;
    update public.exceptions set status = 'resolved', resolution = 'Corrected in revision ' || new.context_version, resolved_by = auth.uid(), resolved_at = now()
      where movement_id = new.id and kind = 'other' and reason like 'Returned by reviewer%' and status <> 'resolved';
  end if;
  return null;
end $$;
create trigger movements_context_after_return after update of context_version on public.movements
  for each row execute function public.on_context_after_return();

-- =====================================================================
-- 2. Exportaciones (snapshot de revisiones aprobadas)
-- =====================================================================
create table public.exports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid references public.legal_entities(id) on delete set null,
  period_from date not null,
  period_to date not null,
  filters jsonb not null default '{}',
  schema_version text not null default 'v1',
  record_count int not null default 0,
  checksum_sha256 text,                         -- of the CSV generated from the snapshot rows
  status text not null default 'ready' check (status in ('ready', 'failed')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index exports_org_idx on public.exports(org_id, created_at desc);

-- One row per included movement, frozen at export time. Later changes never touch these rows.
create table public.export_items (
  export_id uuid not null references public.exports(id) on delete cascade,
  movement_id uuid not null references public.movements(id) on delete restrict,
  review_id uuid references public.reviews(id) on delete set null,
  context_revision_id uuid references public.movement_context_revisions(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  row jsonb not null,
  primary key (export_id, movement_id)
);
alter table public.exports enable row level security;
alter table public.export_items enable row level security;
create policy "members read exports" on public.exports for select using (public.is_member(org_id));
create policy "members read export items" on public.export_items for select using (exists (select 1 from public.exports e where e.id = export_id and public.is_member(e.org_id)));

create or replace function public.create_export(p_org uuid, p_from date, p_to date, p_entity uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_count int;
begin
  if not public.has_role(p_org, '{admin,reviewer}') then raise exception 'FORBIDDEN: exporting requires admin or reviewer'; end if;
  if p_from > p_to then raise exception 'INVALID: period'; end if;
  insert into public.exports (org_id, entity_id, period_from, period_to, filters, created_by)
  values (p_org, p_entity, p_from, p_to, jsonb_build_object('entity_id', p_entity), auth.uid()) returning id into v_id;

  insert into public.export_items (export_id, movement_id, review_id, context_revision_id, invoice_id, row)
  select v_id, m.id, rv.id, r.id, i.id,
    jsonb_build_object(
      'movement_id', m.id,
      'block_time', to_char(m.block_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'entity', e.name,
      'wallet', w.label,
      'direction', m.direction,
      'network', m.chain,
      'tx_signature', m.tx_signature,
      'instruction_index', m.instruction_index,
      'token_symbol', coalesce(m.token_symbol, ''),
      'token_mint', m.token_mint,
      'amount_raw', m.amount_raw::text,
      'token_decimals', m.token_decimals,
      'amount', rtrim(rtrim(to_char(m.amount_raw / power(10::numeric, m.token_decimals), 'FM999999999999999999990.999999999999999999'), '0'), '.'),
      'counterparty', coalesce(r.counterparty_name, ''),
      'category', r.category,
      'purpose', coalesce(r.purpose, ''),
      'reference', coalesce(r.reference, ''),
      'invoice_ref', coalesce(i.external_ref, ''),
      'invoice_amount', coalesce(i.amount::text, ''),
      'invoice_currency', coalesce(i.currency, ''),
      'fiat_value', coalesce((select v.fiat_amount::text from public.valuations v where v.movement_id = m.id order by v.version desc limit 1), ''),
      'fiat_currency', coalesce((select v.currency from public.valuations v where v.movement_id = m.id order by v.version desc limit 1), ''),
      'context_version', m.context_version,
      'approved_by', coalesce(p.full_name, ''),
      'approved_at', to_char(rv.decided_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'evidence', 'movement:' || m.id || ';revision:' || r.id || ';review:' || rv.id || coalesce(';invoice:' || i.id, '')
    )
  from public.movements m
  join public.legal_entities e on e.id = m.entity_id
  join public.wallets w on w.id = m.wallet_id
  join public.movement_context_revisions r on r.movement_id = m.id and r.version = m.context_version
  join lateral (select * from public.reviews x where x.movement_id = m.id and x.action = 'approved' order by x.decided_at desc limit 1) rv on true
  left join public.profiles p on p.id = rv.actor_id
  left join public.invoices i on i.id = m.matched_invoice_id
  where m.org_id = p_org and m.review_status = 'approved'
    and m.block_time::date between p_from and p_to
    and (p_entity is null or m.entity_id = p_entity)
  order by m.block_time, m.id;

  get diagnostics v_count = row_count;
  update public.exports set record_count = v_count where id = v_id;
  insert into public.audit_events (org_id, actor_id, entity, entity_id, action, after)
  values (p_org, auth.uid(), 'export', v_id, 'created', jsonb_build_object('period_from', p_from, 'period_to', p_to, 'entity_id', p_entity, 'records', v_count, 'schema_version', 'v1'));
  return v_id;
end $$;

-- The app stores the checksum of the generated file right after creating the export (same actor, same transaction window).
create or replace function public.set_export_checksum(p_export uuid, p_checksum text)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.exports where id = p_export;
  if v_org is null or not public.has_role(v_org, '{admin,reviewer}') then raise exception 'FORBIDDEN'; end if;
  update public.exports set checksum_sha256 = p_checksum where id = p_export and checksum_sha256 is null;
end $$;
