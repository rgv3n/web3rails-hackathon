-- Let PostgREST embed profiles from memberships and audit_events (their user columns reference auth.users).
alter table public.memberships
  add constraint memberships_user_profile_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.audit_events
  add constraint audit_events_actor_profile_fkey foreign key (actor_id) references public.profiles(id) on delete set null;
