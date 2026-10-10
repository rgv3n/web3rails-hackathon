-- Second proof of wallet ownership: the wallet's own key (ed25519, e.g. Phantom signMessage) signs the same kind of
-- server-issued statement. Same table, same HMAC-proofed verdict; `method` tells the two apart.
--   certificate → legal identity (who the representative is)           → wallets.ownership = 'verified'
--   wallet_key  → cryptographic control (who holds the private key)     → wallets.control_verified_at

alter table public.wallet_ownership_attestations
  add column method text not null default 'certificate' check (method in ('certificate', 'wallet_key'));
alter table public.wallets add column control_verified_at timestamptz;
alter table public.wallets add column control_evidence text;

drop function public.issue_wallet_attestation(uuid);
create or replace function public.issue_wallet_attestation(p_wallet uuid, p_method text default 'certificate')
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_w public.wallets%rowtype; v_org public.organizations%rowtype; v_id uuid; v_nonce text; v_statement text; v_profile text;
begin
  if p_method not in ('certificate', 'wallet_key') then raise exception 'INVALID: method'; end if;
  select * into v_w from public.wallets where id = p_wallet;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.has_role(v_w.org_id, '{admin}') then raise exception 'FORBIDDEN: verifying ownership requires admin'; end if;
  if v_w.status <> 'active' then raise exception 'INVALID: wallet is archived'; end if;
  select * into v_org from public.organizations where id = v_w.org_id;
  v_profile := case when v_org.is_demo then 'demo' else 'qualified' end;
  v_nonce := encode(extensions.gen_random_bytes(12), 'hex');
  v_id := gen_random_uuid();
  v_statement := jsonb_build_object(
    'statement', 'wallet_ownership_attestation', 'version', 1, 'attestation_id', v_id, 'method', p_method,
    'organization', v_org.name, 'chain', v_w.chain, 'wallet', v_w.address,
    'issued_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'nonce', v_nonce,
    'text', case when p_method = 'certificate'
      then 'I declare, as legal representative of ' || v_org.name || ', that the organization controls the ' || v_w.chain || ' wallet ' || v_w.address || '.'
      else 'This ' || v_w.chain || ' wallet ' || v_w.address || ' is controlled by ' || v_org.name || ' and is being registered in Web3Rails.' end
  )::text;
  insert into public.wallet_ownership_attestations (id, org_id, wallet_id, nonce, statement, trust_profile, method, issued_by)
  values (v_id, v_w.org_id, p_wallet, v_nonce, v_statement, v_profile, p_method, auth.uid());
  insert into public.audit_events (org_id, actor_id, entity, entity_id, action, after)
  values (v_w.org_id, auth.uid(), 'wallet_attestation', v_id, 'issued', jsonb_build_object('wallet_id', p_wallet, 'method', p_method, 'trust_profile', v_profile, 'nonce', v_nonce));
  return jsonb_build_object('id', v_id, 'statement', v_statement, 'method', p_method, 'trust_profile', v_profile, 'expires_at', now() + interval '15 minutes');
end $$;

create or replace function public.record_wallet_attestation(
  p_id uuid, p_verdict text, p_proof text, p_signer_json text, p_chain text[], p_ocsp jsonb, p_reasons text[], p_signature_b64 text, p_certificate_pem text
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_a public.wallet_ownership_attestations%rowtype; v_secret text; v_expected text; p_signer jsonb;
begin
  select * into v_a from public.wallet_ownership_attestations where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.has_role(v_a.org_id, '{admin}') then raise exception 'FORBIDDEN: verifying ownership requires admin'; end if;
  if p_verdict not in ('verified', 'rejected') then raise exception 'INVALID: verdict'; end if;
  if v_a.status <> 'issued' then raise exception 'CONFLICT: attestation already %', v_a.status; end if;
  if v_a.expires_at < now() then
    update public.wallet_ownership_attestations set status = 'expired', decided_at = now() where id = p_id;
    return jsonb_build_object('id', p_id, 'status', 'expired');
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'attestation_hmac' limit 1;
  if v_secret is null then raise exception 'CONFIG: attestation secret is not set in Vault'; end if;
  v_expected := encode(extensions.hmac(convert_to(p_id::text || '|' || p_verdict || '|' || coalesce(p_signer_json, ''), 'UTF8'), convert_to(v_secret, 'UTF8'), 'sha256'), 'hex');
  p_signer := case when p_signer_json is null or p_signer_json = '' then null else p_signer_json::jsonb end;
  if p_proof is null or p_proof <> v_expected then raise exception 'FORBIDDEN: verdict proof does not match'; end if;

  update public.wallet_ownership_attestations
    set status = p_verdict, decided_at = now(), signer = p_signer, chain = p_chain, ocsp = p_ocsp, reasons = coalesce(p_reasons, '{}'),
        signature_b64 = p_signature_b64, certificate_pem = p_certificate_pem
    where id = p_id;
  if p_verdict = 'verified' and v_a.method = 'certificate' then
    update public.wallets set ownership = 'verified', ownership_evidence = 'attestation:' || p_id::text where id = v_a.wallet_id;
    insert into public.audit_events (org_id, actor_id, entity, entity_id, action, after, reason)
    values (v_a.org_id, auth.uid(), 'wallet', v_a.wallet_id, 'ownership_verified',
      jsonb_build_object('attestation_id', p_id, 'method', 'certificate', 'trust_profile', v_a.trust_profile, 'signer', p_signer, 'ocsp', p_ocsp),
      'Qualified signature over the ownership statement');
  elsif p_verdict = 'verified' then
    update public.wallets set control_verified_at = now(), control_evidence = 'attestation:' || p_id::text where id = v_a.wallet_id;
    insert into public.audit_events (org_id, actor_id, entity, entity_id, action, after, reason)
    values (v_a.org_id, auth.uid(), 'wallet', v_a.wallet_id, 'control_verified',
      jsonb_build_object('attestation_id', p_id, 'method', 'wallet_key', 'signer', p_signer),
      'The wallet key signed the ownership statement');
  else
    insert into public.audit_events (org_id, actor_id, entity, entity_id, action, after, reason)
    values (v_a.org_id, auth.uid(), 'wallet', v_a.wallet_id, 'ownership_verification_rejected',
      jsonb_build_object('attestation_id', p_id, 'method', v_a.method, 'trust_profile', v_a.trust_profile, 'reasons', p_reasons), array_to_string(p_reasons, '; '));
  end if;
  return jsonb_build_object('id', p_id, 'status', p_verdict);
end $$;
