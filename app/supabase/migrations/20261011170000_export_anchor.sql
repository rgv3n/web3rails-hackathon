-- Anchor each export (close) on Solana: one memo transaction carrying the export id and its SHA-256 checksum.
-- No personal data leaves the system: the memo is "web3rails:export:<id>:<sha256>". Devnet for the hackathon.
alter table public.exports
  add column anchor_cluster text check (anchor_cluster in ('devnet', 'mainnet-beta')),
  add column anchor_signature text,
  add column anchor_memo text,
  add column anchored_at timestamptz;

create or replace function public.record_export_anchor(p_export uuid, p_cluster text, p_signature text, p_memo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_e public.exports%rowtype;
begin
  select * into v_e from public.exports where id = p_export for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.has_role(v_e.org_id, '{admin,reviewer}') then raise exception 'FORBIDDEN: anchoring requires admin or reviewer'; end if;
  if v_e.checksum_sha256 is null then raise exception 'INVALID: export has no checksum yet'; end if;
  if v_e.anchor_signature is not null then raise exception 'CONFLICT: export already anchored'; end if;
  if p_cluster not in ('devnet', 'mainnet-beta') then raise exception 'INVALID: cluster'; end if;
  update public.exports set anchor_cluster = p_cluster, anchor_signature = p_signature, anchor_memo = p_memo, anchored_at = now() where id = p_export;
  insert into public.audit_events (org_id, actor_id, entity, entity_id, action, after, reason)
  values (v_e.org_id, auth.uid(), 'export', p_export, 'anchored', jsonb_build_object('cluster', p_cluster, 'signature', p_signature, 'memo', p_memo), 'Export checksum anchored on Solana');
end $$;
