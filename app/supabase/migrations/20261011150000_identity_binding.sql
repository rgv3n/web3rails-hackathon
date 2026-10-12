-- Identity binding (review by Ignacio Montoya, 11-oct-2026):
--   1. the legal entity carries its tax id and whether it is a company or a natural person
--   2. the ownership statement is neutral about who signs and names the entity by tax id
--   3. the wallet-key statement can be LINKED to a verified certificate signature (it carries that signature's SHA-256)
--   4. the signed OCSP response is kept as evidence (DER, base64)
-- The policy "certificate must belong to this entity" lives in the server (src/lib/attestation/policy.ts) and its
-- outcome is recorded here like any other verdict.

alter table public.legal_entities
  add column tax_id text,
  add column tax_id_country char(2) not null default 'ES',
  add column subject_type text not null default 'legal_entity' check (subject_type in ('legal_entity', 'natural_person'));
comment on column public.legal_entities.tax_id is 'CIF/NIF (ES) or national tax id, without the VATES-/IDCES- prefix. Compared with the certificate subject.';

alter table public.wallet_ownership_attestations
  add column linked_attestation_id uuid references public.wallet_ownership_attestations(id),
  add column ocsp_response_der text;

drop function public.create_organization(text, text, char, text);
create or replace function public.create_organization(p_name text, p_slug text, p_base_currency char(3) default 'EUR', p_timezone text default 'Europe/Madrid', p_tax_id text default null, p_subject_type text default 'legal_entity')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_subject_type not in ('legal_entity', 'natural_person') then raise exception 'INVALID: subject_type'; end if;
  insert into public.organizations (name, slug, base_currency, timezone, created_by)
  values (p_name, p_slug, p_base_currency, p_timezone, auth.uid()) returning id into v_id;
  insert into public.memberships (org_id, user_id, role, financial_role) values (v_id, auth.uid(), 'admin', 'reviewer');
  insert into public.legal_entities (org_id, name, reporting_currency, tax_id, subject_type) values (v_id, p_name, p_base_currency, nullif(regexp_replace(upper(trim(p_tax_id)), '[\s-]', '', 'g'), ''), p_subject_type);
  insert into public.audit_events (org_id, actor_id, entity, entity_id, action, after)
  values (v_id, auth.uid(), 'organization', v_id, 'created', jsonb_build_object('name', p_name, 'slug', p_slug, 'tax_id', nullif(regexp_replace(upper(trim(p_tax_id)), '[\s-]', '', 'g'), ''), 'subject_type', p_subject_type));
  return v_id;
end $$;

drop function public.issue_wallet_attestation(uuid, text);
create or replace function public.issue_wallet_attestation(p_wallet uuid, p_method text default 'certificate', p_link uuid default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_w public.wallets%rowtype; v_org public.organizations%rowtype; v_ent public.legal_entities%rowtype; v_link public.wallet_ownership_attestations%rowtype;
        v_id uuid; v_nonce text; v_statement jsonb; v_profile text; v_sig_hash text;
begin
  if p_method not in ('certificate', 'wallet_key') then raise exception 'INVALID: method'; end if;
  select * into v_w from public.wallets where id = p_wallet;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.has_role(v_w.org_id, '{admin}') then raise exception 'FORBIDDEN: verifying ownership requires admin'; end if;
  if v_w.status <> 'active' then raise exception 'INVALID: wallet is archived'; end if;
  select * into v_org from public.organizations where id = v_w.org_id;
  select * into v_ent from public.legal_entities where id = v_w.entity_id;
  v_profile := case when v_org.is_demo then 'demo' else 'qualified' end;
  v_nonce := encode(extensions.gen_random_bytes(12), 'hex');
  v_id := gen_random_uuid();
  v_statement := jsonb_build_object(
    'statement', 'wallet_ownership_attestation', 'version', 2, 'attestation_id', v_id, 'method', p_method,
    'entity', jsonb_build_object('name', v_ent.name, 'tax_id', v_ent.tax_id, 'tax_id_country', v_ent.tax_id_country, 'subject_type', v_ent.subject_type),
    'chain', v_w.chain, 'wallet', v_w.address,
    'issued_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'nonce', v_nonce
  );
  if p_method = 'certificate' then
    -- Neutral about who signs: the signer type is established when the certificate is verified, not before.
    v_statement := v_statement || jsonb_build_object('text',
      'The holder of the signing certificate declares that the ' || v_w.chain || ' wallet ' || v_w.address || ' is controlled by ' || v_ent.name
      || case when v_ent.tax_id is null then '' else ' (tax id ' || v_ent.tax_id || ')' end || '.');
  else
    if p_link is not null then
      select * into v_link from public.wallet_ownership_attestations where id = p_link;
      if not found or v_link.wallet_id <> p_wallet then raise exception 'INVALID: linked attestation does not belong to this wallet'; end if;
      if v_link.method <> 'certificate' or v_link.status <> 'verified' or v_link.signature_b64 is null then raise exception 'INVALID: linked attestation is not a verified certificate signature'; end if;
      v_sig_hash := encode(extensions.digest(decode(v_link.signature_b64, 'base64'), 'sha256'), 'hex');
      v_statement := v_statement || jsonb_build_object('certificate_attestation_id', p_link, 'certificate_signature_sha256', v_sig_hash,
        'text', 'The key of the ' || v_w.chain || ' wallet ' || v_w.address || ' accepts the ownership statement signed with a qualified certificate (signature SHA-256 ' || v_sig_hash || ') on behalf of ' || v_ent.name
        || case when v_ent.tax_id is null then '' else ' (tax id ' || v_ent.tax_id || ')' end || '.');
    else
      v_statement := v_statement || jsonb_build_object('text',
        'The key of the ' || v_w.chain || ' wallet ' || v_w.address || ' declares that the wallet is controlled by ' || v_ent.name
        || case when v_ent.tax_id is null then '' else ' (tax id ' || v_ent.tax_id || ')' end || '.');
    end if;
  end if;
  insert into public.wallet_ownership_attestations (id, org_id, wallet_id, nonce, statement, trust_profile, method, issued_by, linked_attestation_id)
  values (v_id, v_w.org_id, p_wallet, v_nonce, v_statement::text, v_profile, p_method, auth.uid(), p_link);
  insert into public.audit_events (org_id, actor_id, entity, entity_id, action, after)
  values (v_w.org_id, auth.uid(), 'wallet_attestation', v_id, 'issued', jsonb_build_object('wallet_id', p_wallet, 'method', p_method, 'trust_profile', v_profile, 'nonce', v_nonce, 'linked_attestation_id', p_link));
  return jsonb_build_object('id', v_id, 'statement', v_statement::text, 'method', p_method, 'trust_profile', v_profile, 'linked_attestation_id', p_link, 'expires_at', now() + interval '15 minutes');
end $$;

drop function public.record_wallet_attestation(uuid, text, text, text, text[], jsonb, text[], text, text);
create or replace function public.record_wallet_attestation(
  p_id uuid, p_verdict text, p_proof text, p_signer_json text, p_chain text[], p_ocsp jsonb, p_reasons text[], p_signature_b64 text, p_certificate_pem text, p_ocsp_der text default null
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
        signature_b64 = p_signature_b64, certificate_pem = p_certificate_pem, ocsp_response_der = p_ocsp_der
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
      jsonb_build_object('attestation_id', p_id, 'method', 'wallet_key', 'signer', p_signer, 'linked_attestation_id', v_a.linked_attestation_id),
      case when v_a.linked_attestation_id is null then 'The wallet key signed the ownership statement' else 'The wallet key accepted the certificate-signed statement (linked)' end);
  else
    insert into public.audit_events (org_id, actor_id, entity, entity_id, action, after, reason)
    values (v_a.org_id, auth.uid(), 'wallet', v_a.wallet_id, 'ownership_verification_rejected',
      jsonb_build_object('attestation_id', p_id, 'method', v_a.method, 'trust_profile', v_a.trust_profile, 'reasons', p_reasons), array_to_string(p_reasons, '; '));
  end if;
  return jsonb_build_object('id', p_id, 'status', p_verdict);
end $$;

-- Demo data: the published demo certificate is issued to ACME DEMO SL, CIF B00000000.
update public.legal_entities e set tax_id = 'B00000000' from public.organizations o where o.id = e.org_id and o.is_demo and e.tax_id is null;
