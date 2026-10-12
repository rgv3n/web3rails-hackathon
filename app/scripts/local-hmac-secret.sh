#!/usr/bin/env bash
# Re-creates the LOCAL Vault secret 'attestation_hmac' from ATTESTATION_HMAC_SECRET in .env.local.
# Needed after `npx supabase db reset` (the reset wipes Vault). Prints nothing sensitive.
set -euo pipefail
cd "$(dirname "$0")/.."
v=$(grep -E '^ATTESTATION_HMAC_SECRET=' .env.local | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
[ -n "$v" ] || { echo "ATTESTATION_HMAC_SECRET not set in .env.local"; exit 1; }
docker exec -i supabase_db_web3rails-app psql -U postgres -d postgres -q -v s="$v" <<'SQL'
delete from vault.secrets where name = 'attestation_hmac';
select vault.create_secret(:'s', 'attestation_hmac', 'HMAC key shared with the Next server (local)');
SQL
echo "local Vault secret 'attestation_hmac' recreated"
