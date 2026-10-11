-- MCP / API access: calls made with an organization API key are audited as actor_kind 'api', with the key prefix.
alter table public.audit_events drop constraint if exists audit_events_actor_kind_check;
alter table public.audit_events add constraint audit_events_actor_kind_check check (actor_kind in ('user', 'system', 'internal', 'api'));
alter table public.audit_events add column api_key_id uuid references public.api_keys(id) on delete set null;
create index audit_events_api_key_idx on public.audit_events(api_key_id) where api_key_id is not null;
