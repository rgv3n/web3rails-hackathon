-- Web3Rails front office · F0 foundation
-- Users (auth.users) → profiles · organizations · memberships · api_keys · integration_requests · audit_events

create extension if not exists pgcrypto;

-- ---------- helpers ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  job_title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', null));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- organizations & memberships ----------
create type public.member_role as enum ('owner', 'reviewer', 'auditor');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  base_currency char(3) not null default 'EUR',
  timezone text not null default 'Europe/Madrid',
  is_demo boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships(user_id);

-- Security-definer helpers so RLS policies never recurse
create or replace function public.is_member(p_org uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = auth.uid());
$$;
create or replace function public.has_role(p_org uuid, p_roles public.member_role[])
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.memberships m
                 where m.org_id = p_org and m.user_id = auth.uid() and m.role = any(p_roles));
$$;

-- Create an organization and make the caller its owner, atomically.
create or replace function public.create_organization(p_name text, p_slug text, p_base_currency char(3) default 'EUR', p_timezone text default 'Europe/Madrid')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.organizations (name, slug, base_currency, timezone, created_by)
  values (p_name, p_slug, p_base_currency, p_timezone, auth.uid()) returning id into v_id;
  insert into public.memberships (org_id, user_id, role) values (v_id, auth.uid(), 'owner');
  insert into public.audit_events (org_id, actor_id, entity, entity_id, action, after)
  values (v_id, auth.uid(), 'organization', v_id, 'created', jsonb_build_object('name', p_name, 'slug', p_slug));
  return v_id;
end $$;

-- ---------- API keys (front office shows prefix only; secret shown once at creation) ----------
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  key_prefix text not null,            -- e.g. w3r_live_ab12  (first 12 chars, for display)
  key_hash text not null unique,       -- sha256 of the full key
  scopes text[] not null default '{read}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index api_keys_org_idx on public.api_keys(org_id);

-- ---------- integration requests (catalogue is static in the app; requests are per org) ----------
create type public.integration_request_status as enum ('requested', 'in_review', 'enabled', 'declined');
create table public.integration_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  integration_slug text not null,
  status public.integration_request_status not null default 'requested',
  note text,
  requested_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, integration_slug)
);
create trigger integration_requests_updated_at before update on public.integration_requests
  for each row execute function public.set_updated_at();

-- ---------- audit (insert-only) ----------
create table public.audit_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id),
  entity text not null,
  entity_id uuid,
  action text not null,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index audit_events_org_at_idx on public.audit_events(org_id, at desc);

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.api_keys enable row level security;
alter table public.integration_requests enable row level security;
alter table public.audit_events enable row level security;

create policy "own profile read"   on public.profiles for select using (id = auth.uid());
create policy "own profile update" on public.profiles for update using (id = auth.uid());

create policy "members read org"   on public.organizations for select using (public.is_member(id));
create policy "owners update org"  on public.organizations for update using (public.has_role(id, '{owner}'));

create policy "members read memberships" on public.memberships for select using (public.is_member(org_id));
create policy "owners manage memberships" on public.memberships for all
  using (public.has_role(org_id, '{owner}')) with check (public.has_role(org_id, '{owner}'));

create policy "members read keys"   on public.api_keys for select using (public.is_member(org_id));
create policy "owners create keys"  on public.api_keys for insert with check (public.has_role(org_id, '{owner}'));
create policy "owners revoke keys"  on public.api_keys for update using (public.has_role(org_id, '{owner}'));

create policy "members read requests" on public.integration_requests for select using (public.is_member(org_id));
create policy "owners/reviewers request" on public.integration_requests for insert
  with check (public.has_role(org_id, '{owner,reviewer}'));
create policy "owners/reviewers update request" on public.integration_requests for update
  using (public.has_role(org_id, '{owner,reviewer}'));

create policy "members read audit"  on public.audit_events for select using (public.is_member(org_id));
create policy "members write audit" on public.audit_events for insert with check (public.is_member(org_id));
