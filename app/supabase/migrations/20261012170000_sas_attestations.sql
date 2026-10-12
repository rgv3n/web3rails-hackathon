-- Solana Attestation Service (SAS): a public, opt-in attestation per wallet that says "this wallet's ownership was verified
-- with a qualified certificate", and nothing else. Five fields, no name, no NIF, no CIF, nothing derived from them.
-- Decision of 11-oct-2026 (Rubén): opt-in per wallet, devnet first, off by default. The chain never learns who the owner is.

alter table public.wallets add column sas_opt_in boolean not null default false;

create table public.sas_attestations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  attestation_id uuid not null references public.wallet_ownership_attestations(id) on delete restrict, -- the verified certificate signature it is based on
  cluster text not null check (cluster in ('devnet', 'mainnet-beta')),
  credential_pda text not null,
  schema_pda text not null,
  attestation_pda text not null,
  signature text not null,                       -- transaction that created the attestation account
  fields jsonb not null,                         -- exactly what went on-chain (the five fields)
  expiry timestamptz,                            -- certificate expiry; the attestation stops being valid then
  status text not null default 'published' check (status in ('published', 'closed')),
  published_by uuid references auth.users(id),
  published_at timestamptz not null default now(),
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  close_signature text
);
create index sas_attestations_wallet_idx on public.sas_attestations(wallet_id, published_at desc);
create unique index sas_attestations_one_live_per_wallet on public.sas_attestations(wallet_id) where status = 'published';
alter table public.sas_attestations enable row level security;
create policy "members read sas attestations" on public.sas_attestations for select using (public.is_member(org_id));

-- Admin switches the opt-in. Opting out requires closing the live attestation first (the chain account must go away).
create or replace function public.set_wallet_sas_opt_in(p_wallet uuid, p_opt_in boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_w public.wallets%rowtype;
begin
  select * into v_w from public.wallets where id = p_wallet for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.has_role(v_w.org_id, '{admin}') then raise exception 'FORBIDDEN: only admins change the public attestation opt-in'; end if;
  if v_w.sas_opt_in = p_opt_in then return; end if;
  if not p_opt_in and exists (select 1 from public.sas_attestations where wallet_id = p_wallet and status = 'published') then
    raise exception 'CONFLICT: close the published attestation before opting out';
  end if;
  update public.wallets set sas_opt_in = p_opt_in where id = p_wallet;
  insert into public.audit_events (org_id, actor_id, entity, entity_id, action, before, after)
  values (v_w.org_id, auth.uid(), 'wallet', p_wallet, 'sas_opt_in_changed', jsonb_build_object('sas_opt_in', v_w.sas_opt_in), jsonb_build_object('sas_opt_in', p_opt_in));
end $$;

-- Records an attestation the server has already written on-chain. Refuses anything but the five agreed fields.
create or replace function public.record_sas_attestation(
  p_attestation uuid, p_cluster text, p_credential text, p_schema text, p_pda text, p_signature text, p_fields jsonb, p_expiry timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_a public.wallet_ownership_attestations%rowtype; v_w public.wallets%rowtype; v_id uuid; v_keys text[];
begin
  select * into v_a from public.wallet_ownership_attestations where id = p_attestation;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.has_role(v_a.org_id, '{admin}') then raise exception 'FORBIDDEN: publishing an attestation requires admin'; end if;
  if v_a.status <> 'verified' or v_a.method <> 'certificate' then raise exception 'INVALID: only a verified certificate signature can be attested'; end if;
  select * into v_w from public.wallets where id = v_a.wallet_id for update;
  if not v_w.sas_opt_in then raise exception 'FORBIDDEN: this wallet has not opted in to a public attestation'; end if;
  if p_cluster not in ('devnet', 'mainnet-beta') then raise exception 'INVALID: cluster'; end if;
  if jsonb_typeof(p_fields) <> 'object' then raise exception 'INVALID: fields'; end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_fields) k;
  if v_keys <> array['issuer', 'level', 'statement_sha256', 'subject_type', 'wallet'] then
    raise exception 'INVALID: an attestation carries exactly wallet, subject_type, level, issuer, statement_sha256';
  end if;
  if exists (select 1 from jsonb_each(p_fields) where jsonb_typeof(value) <> 'string') then raise exception 'INVALID: fields must be strings'; end if;
  if p_fields->>'wallet' <> v_w.address then raise exception 'INVALID: the attested wallet is not this wallet'; end if;
  if p_fields->>'subject_type' not in ('legal_entity', 'natural_person') then raise exception 'INVALID: subject_type'; end if;
  if p_fields->>'level' not in ('qualified', 'qualified_linked') then raise exception 'INVALID: level'; end if;
  if p_fields->>'statement_sha256' !~ '^[0-9a-f]{64}$' then raise exception 'INVALID: statement_sha256'; end if;
  if exists (select 1 from public.sas_attestations where wallet_id = v_w.id and status = 'published') then
    raise exception 'CONFLICT: this wallet already has a published attestation; close it first';
  end if;
  insert into public.sas_attestations (org_id, wallet_id, attestation_id, cluster, credential_pda, schema_pda, attestation_pda, signature, fields, expiry, published_by)
  values (v_a.org_id, v_w.id, p_attestation, p_cluster, p_credential, p_schema, p_pda, p_signature, p_fields, p_expiry, auth.uid()) returning id into v_id;
  insert into public.audit_events (org_id, actor_id, entity, entity_id, action, after)
  values (v_a.org_id, auth.uid(), 'wallet', v_w.id, 'sas_published',
    jsonb_build_object('sas_id', v_id, 'attestation_id', p_attestation, 'cluster', p_cluster, 'attestation_pda', p_pda, 'signature', p_signature, 'fields', p_fields, 'expiry', p_expiry));
  return v_id;
end $$;

-- Records the on-chain close (revocation). The account is gone; the row stays as history.
create or replace function public.record_sas_close(p_id uuid, p_signature text)
returns void language plpgsql security definer set search_path = public as $$
declare v_s public.sas_attestations%rowtype;
begin
  select * into v_s from public.sas_attestations where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.has_role(v_s.org_id, '{admin}') then raise exception 'FORBIDDEN: closing an attestation requires admin'; end if;
  if v_s.status <> 'published' then raise exception 'CONFLICT: attestation is not published'; end if;
  update public.sas_attestations set status = 'closed', closed_by = auth.uid(), closed_at = now(), close_signature = p_signature where id = p_id;
  insert into public.audit_events (org_id, actor_id, entity, entity_id, action, after)
  values (v_s.org_id, auth.uid(), 'wallet', v_s.wallet_id, 'sas_closed', jsonb_build_object('sas_id', p_id, 'attestation_pda', v_s.attestation_pda, 'signature', p_signature));
end $$;
