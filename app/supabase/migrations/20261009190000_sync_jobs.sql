-- Front office · Fase 5 · sincronización de wallets (loop A): checkpoint por wallet, trabajos acotados, auditoría

alter table public.wallets
  add column sync_cursor text,                 -- newest signature fully processed (Helius `until`)
  add column last_synced_at timestamptz,
  add column last_sync_error text;

create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  provider text not null default 'helius',
  status text not null default 'running' check (status in ('running', 'finished', 'failed', 'partial')),
  attempt int not null default 1,
  cursor_from text,
  cursor_to text,
  pages int not null default 0,
  fetched int not null default 0,
  inserted int not null default 0,
  duplicate int not null default 0,
  discrepant int not null default 0,
  skipped int not null default 0,
  error text,
  started_by uuid references public.profiles(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index sync_jobs_wallet_idx on public.sync_jobs(wallet_id, started_at desc);
alter table public.sync_jobs enable row level security;
create policy "members read sync jobs" on public.sync_jobs for select using (public.is_member(org_id));

create or replace function public.start_sync_job(p_wallet uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_w public.wallets%rowtype; v_id uuid;
begin
  select * into v_w from public.wallets where id = p_wallet for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.has_role(v_w.org_id, '{admin,operator}') then raise exception 'FORBIDDEN: syncing requires admin or operator'; end if;
  if v_w.status <> 'active' then raise exception 'INVALID: wallet is archived'; end if;
  if exists (select 1 from public.sync_jobs j where j.wallet_id = p_wallet and j.status = 'running' and j.started_at > now() - interval '10 minutes') then
    raise exception 'CONFLICT: a sync is already running for this wallet';
  end if;
  insert into public.sync_jobs (org_id, wallet_id, cursor_from, started_by) values (v_w.org_id, p_wallet, v_w.sync_cursor, auth.uid()) returning id into v_id;
  insert into public.audit_events (org_id, actor_id, entity, entity_id, action, after)
  values (v_w.org_id, auth.uid(), 'sync_job', v_id, 'started', jsonb_build_object('wallet_id', p_wallet, 'cursor_from', v_w.sync_cursor));
  return v_id;
end $$;

-- Finish a job. The cursor advances only when the whole page walk succeeded (status finished or partial-with-progress).
create or replace function public.finish_sync_job(p_job uuid, p_status text, p_cursor_to text, p_pages int, p_fetched int, p_inserted int, p_duplicate int, p_discrepant int, p_skipped int, p_error text)
returns void language plpgsql security definer set search_path = public as $$
declare v_j public.sync_jobs%rowtype;
begin
  select * into v_j from public.sync_jobs where id = p_job for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.has_role(v_j.org_id, '{admin,operator}') then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('finished', 'failed', 'partial') then raise exception 'INVALID: status'; end if;
  update public.sync_jobs set status = p_status, cursor_to = p_cursor_to, pages = p_pages, fetched = p_fetched, inserted = p_inserted,
    duplicate = p_duplicate, discrepant = p_discrepant, skipped = p_skipped, error = nullif(trim(p_error), ''), finished_at = now() where id = p_job;
  if p_status in ('finished', 'partial') and p_cursor_to is not null then
    update public.wallets set sync_cursor = p_cursor_to, last_synced_at = now(), last_sync_error = case when p_status = 'partial' then nullif(trim(p_error), '') else null end where id = v_j.wallet_id;
  elsif p_status = 'failed' then
    update public.wallets set last_sync_error = nullif(trim(p_error), '') where id = v_j.wallet_id;
  else
    update public.wallets set last_synced_at = now(), last_sync_error = null where id = v_j.wallet_id;
  end if;
  insert into public.audit_events (org_id, actor_id, entity, entity_id, action, after, reason)
  values (v_j.org_id, auth.uid(), 'sync_job', p_job, p_status, jsonb_build_object('wallet_id', v_j.wallet_id, 'cursor_from', v_j.cursor_from, 'cursor_to', p_cursor_to, 'fetched', p_fetched, 'inserted', p_inserted, 'duplicate', p_duplicate, 'discrepant', p_discrepant, 'skipped', p_skipped, 'pages', p_pages), nullif(trim(p_error), ''));
end $$;
