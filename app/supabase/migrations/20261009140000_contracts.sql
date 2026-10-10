-- Front office · Fase 1 · contratos, roles, movimientos, contexto versionado, excepciones de importación

-- =====================================================================
-- 1. Roles: owner → admin, nuevo operator, financial_role opcional
-- =====================================================================
drop policy "owners update org" on public.organizations;
drop policy "owners manage memberships" on public.memberships;
drop policy "owners create keys" on public.api_keys;
drop policy "owners revoke keys" on public.api_keys;
drop policy "owners/reviewers request" on public.integration_requests;
drop policy "owners/reviewers update request" on public.integration_requests;
drop function public.has_role(uuid, public.member_role[]);
drop function public.create_organization(text, text, char, text);

create type public.member_role_v2 as enum ('admin', 'operator', 'reviewer', 'auditor');
alter table public.memberships alter column role drop default;
alter table public.memberships
  alter column role type public.member_role_v2
  using (case when role::text = 'owner' then 'admin' else role::text end)::public.member_role_v2;
drop type public.member_role;
alter type public.member_role_v2 rename to member_role;
alter table public.memberships alter column role set default 'admin';

-- An admin may additionally hold an explicit financial role. Null = no financial actions.
alter table public.memberships
  add column financial_role public.member_role
  check (financial_role is null or financial_role in ('operator', 'reviewer'));

-- Effective roles = role ∪ financial_role
create or replace function public.has_role(p_org uuid, p_roles public.member_role[])
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = auth.uid()
      and (m.role = any(p_roles) or m.financial_role = any(p_roles))
  );
$$;

create policy "admins update org" on public.organizations for update using (public.has_role(id, '{admin}'));
create policy "admins manage memberships" on public.memberships for all
  using (public.has_role(org_id, '{admin}')) with check (public.has_role(org_id, '{admin}'));
create policy "admins create keys" on public.api_keys for insert with check (public.has_role(org_id, '{admin}'));
create policy "admins revoke keys" on public.api_keys for update using (public.has_role(org_id, '{admin}'));
create policy "admins/operators request" on public.integration_requests for insert
  with check (public.has_role(org_id, '{admin,operator}'));
create policy "admins/operators update request" on public.integration_requests for update
  using (public.has_role(org_id, '{admin,operator}'));

alter table public.audit_events add column reason text;

create or replace function public.create_organization(p_name text, p_slug text, p_base_currency char(3) default 'EUR', p_timezone text default 'Europe/Madrid')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.organizations (name, slug, base_currency, timezone, created_by)
  values (p_name, p_slug, p_base_currency, p_timezone, auth.uid()) returning id into v_id;
  -- The creator administers the organization and can also operate and review until the team exists.
  insert into public.memberships (org_id, user_id, role, financial_role) values (v_id, auth.uid(), 'admin', 'reviewer');
  insert into public.legal_entities (org_id, name, reporting_currency) values (v_id, p_name, p_base_currency);
  insert into public.audit_events (org_id, actor_id, entity, entity_id, action, after)
  values (v_id, auth.uid(), 'organization', v_id, 'created', jsonb_build_object('name', p_name, 'slug', p_slug));
  return v_id;
end $$;

-- =====================================================================
-- 2. Entidades legales y wallets declaradas
-- =====================================================================
create table public.legal_entities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  reporting_currency char(3) not null default 'EUR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger legal_entities_updated_at before update on public.legal_entities for each row execute function public.set_updated_at();
create index legal_entities_org_idx on public.legal_entities(org_id);

create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid not null references public.legal_entities(id) on delete restrict,
  chain text not null check (chain in ('solana')),
  address text not null,
  label text not null,
  ownership text not null default 'declared' check (ownership in ('declared', 'verified')),
  ownership_evidence text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, chain, address)
);
create trigger wallets_updated_at before update on public.wallets for each row execute function public.set_updated_at();
create index wallets_org_idx on public.wallets(org_id);

-- Existing organizations get one legal entity named after themselves.
insert into public.legal_entities (org_id, name, reporting_currency)
select id, name, base_currency from public.organizations;

-- =====================================================================
-- 3. Importaciones y movimientos (origen, nunca editado)
-- =====================================================================
create type public.movement_source as enum ('import', 'sync', 'demo');

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('movements', 'invoices')),
  source public.movement_source not null default 'import',
  filename text,
  rows_total int not null default 0,
  rows_inserted int not null default 0,
  rows_duplicate int not null default 0,
  rows_discrepant int not null default 0,
  rows_error int not null default 0,
  errors jsonb not null default '[]',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index import_batches_org_idx on public.import_batches(org_id, created_at desc);

create table public.movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid not null references public.legal_entities(id) on delete restrict,
  wallet_id uuid not null references public.wallets(id) on delete restrict,
  source public.movement_source not null,
  source_ref text,
  import_batch_id uuid references public.import_batches(id),
  chain text not null check (chain in ('solana')),
  tx_signature text not null,
  instruction_index int not null default 0,
  from_address text not null,
  to_address text not null,
  direction text not null check (direction in ('in', 'out')),
  token_mint text not null,
  token_symbol text,
  token_decimals int not null check (token_decimals between 0 and 18),
  amount_raw numeric(39, 0) not null check (amount_raw >= 0),
  block_time timestamptz not null,
  source_status text not null default 'finalized' check (source_status in ('confirmed', 'finalized', 'failed')),
  raw jsonb,
  -- Separate state dimensions (spec §5)
  context_version int not null default 0,
  identification_status text not null default 'unidentified' check (identification_status in ('unidentified', 'identified')),
  reconciliation_status text not null default 'unmatched' check (reconciliation_status in ('unmatched', 'proposed', 'matched', 'not_applicable')),
  review_status text not null default 'pending' check (review_status in ('pending', 'correction_requested', 'approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Idempotency key (documented in docs/front-office-plan.md)
  unique (org_id, chain, tx_signature, instruction_index, token_mint, from_address, to_address)
);
create trigger movements_updated_at before update on public.movements for each row execute function public.set_updated_at();
create index movements_org_time_idx on public.movements(org_id, block_time desc);
create index movements_org_review_idx on public.movements(org_id, review_status, identification_status);

create table public.import_discrepancies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  movement_id uuid not null references public.movements(id) on delete cascade,
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  field text not null,
  stored_value text,
  incoming_value text,
  created_at timestamptz not null default now()
);
create index import_discrepancies_movement_idx on public.import_discrepancies(movement_id);

-- =====================================================================
-- 4. Contexto financiero versionado, valoraciones, excepciones
-- =====================================================================
create table public.movement_context_revisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  movement_id uuid not null references public.movements(id) on delete cascade,
  version int not null,
  counterparty_name text,
  purpose text,
  category text not null check (category in ('unknown', 'customer_payment', 'vendor_payment', 'internal_transfer', 'fee', 'refund', 'treasury', 'other')),
  reference text,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (movement_id, version)
);

create table public.valuations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  movement_id uuid not null references public.movements(id) on delete cascade,
  fiat_amount numeric(28, 8) not null,
  currency char(3) not null,
  source text not null,
  valued_at timestamptz not null,
  method text not null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  unique (movement_id, version)
);

create table public.exceptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  movement_id uuid references public.movements(id) on delete cascade,
  kind text not null check (kind in ('import_discrepancy', 'missing_context', 'no_invoice', 'amount_mismatch', 'ambiguous_match', 'unsupported_partial', 'other')),
  status text not null default 'open' check (status in ('open', 'waiting', 'resolved')),
  reason text not null,
  assignee_id uuid references public.profiles(id),
  resolution text,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger exceptions_updated_at before update on public.exceptions for each row execute function public.set_updated_at();
create index exceptions_org_status_idx on public.exceptions(org_id, status);
create index exceptions_movement_idx on public.exceptions(movement_id);

-- =====================================================================
-- 5. RLS: lectura por organización; escritura solo por funciones (abajo) o admin para entidades/wallets
-- =====================================================================
alter table public.legal_entities enable row level security;
alter table public.wallets enable row level security;
alter table public.import_batches enable row level security;
alter table public.movements enable row level security;
alter table public.import_discrepancies enable row level security;
alter table public.movement_context_revisions enable row level security;
alter table public.valuations enable row level security;
alter table public.exceptions enable row level security;

create policy "members read entities" on public.legal_entities for select using (public.is_member(org_id));
create policy "admins manage entities" on public.legal_entities for all
  using (public.has_role(org_id, '{admin}')) with check (public.has_role(org_id, '{admin}'));
create policy "members read wallets" on public.wallets for select using (public.is_member(org_id));
create policy "admins manage wallets" on public.wallets for all
  using (public.has_role(org_id, '{admin}')) with check (public.has_role(org_id, '{admin}'));
create policy "members read batches" on public.import_batches for select using (public.is_member(org_id));
create policy "members read movements" on public.movements for select using (public.is_member(org_id));
create policy "members read discrepancies" on public.import_discrepancies for select using (public.is_member(org_id));
create policy "members read revisions" on public.movement_context_revisions for select using (public.is_member(org_id));
create policy "members read valuations" on public.valuations for select using (public.is_member(org_id));
create policy "members read exceptions" on public.exceptions for select using (public.is_member(org_id));

-- =====================================================================
-- 6. Funciones de mutación (permisos en servidor)
-- =====================================================================

-- Importación idempotente de movimientos.
-- rows: [{tx_signature, instruction_index, block_time, from_address, to_address, token_mint, token_symbol, token_decimals, amount_raw, source_status, source_ref}]
create or replace function public.import_movements(p_org uuid, p_filename text, p_rows jsonb, p_source public.movement_source default 'import')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid;
  v_row jsonb;
  v_i int := 0;
  v_ins int := 0; v_dup int := 0; v_disc int := 0; v_err int := 0;
  v_errors jsonb := '[]';
  v_wallet record;
  v_existing record;
  v_dir text;
  v_amount numeric(39,0);
  v_block timestamptz;
  v_decimals int;
  v_status text;
  v_idx int;
  v_new_id uuid;
  v_changed boolean;
  v_exc_reason text;
begin
  if not public.has_role(p_org, '{admin,operator}') then
    raise exception 'FORBIDDEN: import requires admin or operator';
  end if;
  if p_source = 'demo' and not exists (select 1 from public.organizations where id = p_org and is_demo) then
    raise exception 'FORBIDDEN: demo data only in demo organizations';
  end if;
  if p_source <> 'demo' and exists (select 1 from public.organizations where id = p_org and is_demo) then
    raise exception 'FORBIDDEN: demo organizations only accept demo data';
  end if;

  insert into public.import_batches (org_id, kind, source, filename, rows_total, created_by)
  values (p_org, 'movements', p_source, p_filename, jsonb_array_length(p_rows), auth.uid())
  returning id into v_batch;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    begin
      -- validation
      if coalesce(v_row->>'tx_signature','') !~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$' then raise exception 'invalid tx_signature'; end if;
      if coalesce(v_row->>'from_address','') !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then raise exception 'invalid from_address'; end if;
      if coalesce(v_row->>'to_address','') !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then raise exception 'invalid to_address'; end if;
      if coalesce(v_row->>'token_mint','') !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then raise exception 'invalid token_mint'; end if;
      if coalesce(v_row->>'amount_raw','') !~ '^[0-9]{1,39}$' then raise exception 'amount_raw must be an integer in minimal units'; end if;
      v_amount := (v_row->>'amount_raw')::numeric(39,0);
      v_decimals := coalesce((v_row->>'token_decimals')::int, -1);
      if v_decimals < 0 or v_decimals > 18 then raise exception 'token_decimals must be 0..18'; end if;
      v_idx := coalesce((v_row->>'instruction_index')::int, 0);
      begin v_block := (v_row->>'block_time')::timestamptz; exception when others then raise exception 'invalid block_time'; end;
      if v_block is null then raise exception 'block_time required'; end if;
      v_status := coalesce(nullif(v_row->>'source_status',''), 'finalized');
      if v_status not in ('confirmed','finalized','failed') then raise exception 'invalid source_status'; end if;

      -- which org wallet does this touch? (to = in, else from = out)
      select w.id, w.entity_id into v_wallet from public.wallets w
        where w.org_id = p_org and w.chain = 'solana' and w.status = 'active' and w.address = v_row->>'to_address';
      if found then v_dir := 'in';
      else
        select w.id, w.entity_id into v_wallet from public.wallets w
          where w.org_id = p_org and w.chain = 'solana' and w.status = 'active' and w.address = v_row->>'from_address';
        if found then v_dir := 'out'; else raise exception 'neither address is a declared wallet of this organization'; end if;
      end if;

      select * into v_existing from public.movements m
        where m.org_id = p_org and m.chain = 'solana' and m.tx_signature = v_row->>'tx_signature'
          and m.instruction_index = v_idx and m.token_mint = v_row->>'token_mint'
          and m.from_address = v_row->>'from_address' and m.to_address = v_row->>'to_address';

      if found then
        v_changed := false;
        if v_existing.amount_raw <> v_amount then
          insert into public.import_discrepancies (org_id, movement_id, import_batch_id, field, stored_value, incoming_value)
          values (p_org, v_existing.id, v_batch, 'amount_raw', v_existing.amount_raw::text, v_amount::text); v_changed := true;
        end if;
        if v_existing.block_time <> v_block then
          insert into public.import_discrepancies (org_id, movement_id, import_batch_id, field, stored_value, incoming_value)
          values (p_org, v_existing.id, v_batch, 'block_time', v_existing.block_time::text, v_block::text); v_changed := true;
        end if;
        if v_existing.source_status <> v_status then
          insert into public.import_discrepancies (org_id, movement_id, import_batch_id, field, stored_value, incoming_value)
          values (p_org, v_existing.id, v_batch, 'source_status', v_existing.source_status, v_status); v_changed := true;
        end if;
        if v_existing.token_decimals <> v_decimals then
          insert into public.import_discrepancies (org_id, movement_id, import_batch_id, field, stored_value, incoming_value)
          values (p_org, v_existing.id, v_batch, 'token_decimals', v_existing.token_decimals::text, v_decimals::text); v_changed := true;
        end if;
        if v_changed then
          v_disc := v_disc + 1;
          v_exc_reason := 'Re-import (row ' || v_i || ') differs from the stored source record. Stored values were kept.';
          if not exists (select 1 from public.exceptions e where e.movement_id = v_existing.id and e.kind = 'import_discrepancy' and e.status <> 'resolved') then
            insert into public.exceptions (org_id, movement_id, kind, reason) values (p_org, v_existing.id, 'import_discrepancy', v_exc_reason);
          end if;
        else
          v_dup := v_dup + 1;
        end if;
      else
        insert into public.movements (org_id, entity_id, wallet_id, source, source_ref, import_batch_id, chain, tx_signature, instruction_index,
          from_address, to_address, direction, token_mint, token_symbol, token_decimals, amount_raw, block_time, source_status, raw)
        values (p_org, v_wallet.entity_id, v_wallet.id, p_source, nullif(v_row->>'source_ref',''), v_batch, 'solana', v_row->>'tx_signature', v_idx,
          v_row->>'from_address', v_row->>'to_address', v_dir, v_row->>'token_mint', nullif(v_row->>'token_symbol',''), v_decimals, v_amount, v_block, v_status, v_row)
        returning id into v_new_id;
        v_ins := v_ins + 1;
      end if;
    exception when others then
      v_err := v_err + 1;
      v_errors := v_errors || jsonb_build_object('row', v_i, 'error', sqlerrm);
    end;
  end loop;

  update public.import_batches set rows_inserted = v_ins, rows_duplicate = v_dup, rows_discrepant = v_disc, rows_error = v_err, errors = v_errors
    where id = v_batch;
  insert into public.audit_events (org_id, actor_id, entity, entity_id, action, after)
  values (p_org, auth.uid(), 'import_batch', v_batch, 'imported',
    jsonb_build_object('filename', p_filename, 'source', p_source, 'inserted', v_ins, 'duplicate', v_dup, 'discrepant', v_disc, 'errors', v_err));

  return jsonb_build_object('batch_id', v_batch, 'inserted', v_ins, 'duplicate', v_dup, 'discrepant', v_disc, 'errors', v_errors);
end $$;

-- Save a new financial-context revision with optimistic concurrency.
create or replace function public.save_movement_context(
  p_movement uuid, p_expected_version int,
  p_counterparty_name text, p_purpose text, p_category text, p_reference text, p_note text, p_reason text
) returns int language plpgsql security definer set search_path = public as $$
declare
  v_m public.movements%rowtype;
  v_prev public.movement_context_revisions%rowtype;
  v_new int;
  v_identified boolean;
  v_was_approved boolean;
begin
  select * into v_m from public.movements where id = p_movement for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.has_role(v_m.org_id, '{operator,reviewer}') then
    raise exception 'FORBIDDEN: editing financial context requires operator or reviewer';
  end if;
  if v_m.context_version <> p_expected_version then
    raise exception 'CONFLICT: the record changed (version % now, you had %). Reload and review before saving.', v_m.context_version, p_expected_version;
  end if;
  if p_category is null or p_category not in ('unknown','customer_payment','vendor_payment','internal_transfer','fee','refund','treasury','other') then
    raise exception 'INVALID: category';
  end if;

  select * into v_prev from public.movement_context_revisions where movement_id = p_movement and version = v_m.context_version;
  v_new := v_m.context_version + 1;
  insert into public.movement_context_revisions (org_id, movement_id, version, counterparty_name, purpose, category, reference, note, created_by)
  values (v_m.org_id, p_movement, v_new, nullif(trim(p_counterparty_name),''), nullif(trim(p_purpose),''), p_category, nullif(trim(p_reference),''), nullif(trim(p_note),''), auth.uid());

  -- Context is sufficient when the category is known and (a counterparty is named or it is an internal transfer).
  v_identified := p_category <> 'unknown' and (nullif(trim(p_counterparty_name),'') is not null or p_category = 'internal_transfer');
  v_was_approved := v_m.review_status = 'approved';

  update public.movements set
    context_version = v_new,
    identification_status = case when v_identified then 'identified' else 'unidentified' end,
    reconciliation_status = case when p_category in ('internal_transfer','fee','treasury') and v_m.reconciliation_status = 'unmatched' then 'not_applicable'
                                 when p_category not in ('internal_transfer','fee','treasury') and v_m.reconciliation_status = 'not_applicable' then 'unmatched'
                                 else v_m.reconciliation_status end,
    -- Rule 11: a material correction after approval invalidates the approval; history is kept.
    review_status = case when v_was_approved then 'pending' else v_m.review_status end
  where id = p_movement;

  insert into public.audit_events (org_id, actor_id, entity, entity_id, action, before, after, reason)
  values (v_m.org_id, auth.uid(), 'movement_context', p_movement,
    case when v_m.context_version = 0 then 'created' else 'revised' end,
    case when v_prev.id is null then null else jsonb_build_object('version', v_prev.version, 'counterparty_name', v_prev.counterparty_name, 'purpose', v_prev.purpose, 'category', v_prev.category, 'reference', v_prev.reference, 'note', v_prev.note) end,
    jsonb_build_object('version', v_new, 'counterparty_name', nullif(trim(p_counterparty_name),''), 'purpose', nullif(trim(p_purpose),''), 'category', p_category, 'reference', nullif(trim(p_reference),''), 'note', nullif(trim(p_note),''), 'approval_invalidated', v_was_approved),
    nullif(trim(p_reason),''));
  return v_new;
end $$;
