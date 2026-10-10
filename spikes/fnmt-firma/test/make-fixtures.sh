#!/usr/bin/env bash
# Synthetic PKI that mimics the FNMT layout: root CA → intermediate (AC Representación) → leaf (representante de persona jurídica).
# Then a CAdES-like CMS detached signature over a wallet-ownership JSON, produced with openssl (CMS SignedData, SHA-256, signed attributes).
set -euo pipefail
cd "$(dirname "$0")"
rm -rf out && mkdir out && cd out
openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 3650 -subj "/C=ES/O=TEST FNMT-RCM/OU=CERES/CN=TEST AC RAIZ" -keyout root.key -out root.pem -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
openssl req -newkey rsa:3072 -nodes -sha256 -subj "/C=ES/O=TEST FNMT-RCM/OU=CERES/CN=TEST AC REPRESENTACION" -keyout inter.key -out inter.csr 2>/dev/null
openssl x509 -req -in inter.csr -CA root.pem -CAkey root.key -CAcreateserial -days 3000 -sha256 -out inter.pem -extfile <(printf "basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nauthorityInfoAccess=OCSP;URI:http://127.0.0.1:8888/ocsp\n") 2>/dev/null
# Leaf subject mimics FNMT "representante": serialNumber=IDCES-<NIF>, O=<razón social>, organizationIdentifier=VATES-<CIF>
openssl req -newkey rsa:2048 -nodes -sha256 -subj "/C=ES/O=ACME TEST SL/OU=REPRESENTANTE/serialNumber=IDCES-12345678Z/2.5.4.97=VATES-B12345674/SN=EJEMPLO/GN=MARIA/CN=12345678Z MARIA EJEMPLO (R: B12345674)" -keyout leaf.key -out leaf.csr 2>/dev/null
openssl x509 -req -in leaf.csr -CA inter.pem -CAkey inter.key -CAcreateserial -days 800 -sha256 -out leaf.pem -extfile <(printf "basicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature,nonRepudiation\nsubjectAltName=email:rep@acme.test\nauthorityInfoAccess=OCSP;URI:http://127.0.0.1:8888/ocsp\n") 2>/dev/null
# A second leaf from an UNTRUSTED CA (must be rejected)
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 365 -subj "/C=ES/O=ROGUE CA/CN=ROGUE ROOT" -keyout rogue-root.key -out rogue-root.pem 2>/dev/null
openssl req -newkey rsa:2048 -nodes -sha256 -subj "/C=ES/O=ACME TEST SL/CN=12345678Z MARIA EJEMPLO (R: B12345674)" -keyout rogue-leaf.key -out rogue-leaf.csr 2>/dev/null
openssl x509 -req -in rogue-leaf.csr -CA rogue-root.pem -CAkey rogue-root.key -CAcreateserial -days 365 -sha256 -out rogue-leaf.pem 2>/dev/null
# OCSP index: leaf valid, and a revoked twin to test revocation
touch index.txt; echo 01 > serial
LEAF_SERIAL=$(openssl x509 -in leaf.pem -noout -serial | cut -d= -f2)
LEAF_EXP=$(openssl x509 -in leaf.pem -noout -enddate | cut -d= -f2)
LEAF_EXP_FMT=$(date -u -d "$LEAF_EXP" +%y%m%d%H%M%SZ)
printf "V\t%s\t\t%s\tunknown\t%s\n" "$LEAF_EXP_FMT" "$LEAF_SERIAL" "$(openssl x509 -in leaf.pem -noout -subject -nameopt RFC2253 | cut -d= -f2-)" > index.txt
openssl x509 -req -in leaf.csr -CA inter.pem -CAkey inter.key -CAserial inter.srl -days 800 -sha256 -out revoked-leaf.pem -extfile <(printf "basicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature,nonRepudiation\nauthorityInfoAccess=OCSP;URI:http://127.0.0.1:8888/ocsp\n") 2>/dev/null
REV_SERIAL=$(openssl x509 -in revoked-leaf.pem -noout -serial | cut -d= -f2)
printf "R\t%s\t%s\t%s\tunknown\t%s\n" "$LEAF_EXP_FMT" "$(date -u +%y%m%d%H%M%SZ)" "$REV_SERIAL" "$(openssl x509 -in revoked-leaf.pem -noout -subject -nameopt RFC2253 | cut -d= -f2-)" >> index.txt
# The payload: wallet ownership attestation
cat > ownership.json <<JSON
{"statement":"ownership_attestation","version":1,"org_tax_id":"B12345674","org_name":"ACME TEST SL","chain":"solana","wallet":"9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin","issued_at":"2026-10-10T18:00:00Z","nonce":"c0ffee-0001"}
JSON
openssl cms -sign -binary -in ownership.json -signer leaf.pem -inkey leaf.key -certfile inter.pem -md sha256 -outform DER -out ownership.cades.der 2>/dev/null
openssl cms -sign -binary -in ownership.json -signer revoked-leaf.pem -inkey leaf.key -certfile inter.pem -md sha256 -outform DER -out ownership.revoked.der 2>/dev/null
openssl cms -sign -binary -in ownership.json -signer rogue-leaf.pem -inkey rogue-leaf.key -md sha256 -outform DER -out ownership.rogue.der 2>/dev/null
# Tampered payload (signature made over the original)
sed 's/c0ffee-0001/c0ffee-0002/' ownership.json > ownership.tampered.json
echo "fixtures ready:"; ls -1
