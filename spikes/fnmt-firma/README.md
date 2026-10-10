# Spike FNMT · firma cualificada + propiedad de wallet

Findings and verdict: `../../docs/2026-10-10-spike-fnmt.md`. Not part of the product.

```bash
npm install
npm run test:fixtures                                  # synthetic PKI + CMS signatures in test/out (ignored by git)
# local OCSP responder for the fixtures (another terminal):
(cd test/out && openssl ocsp -index index.txt -port 8888 -rsigner inter.pem -rkey inter.key -CA inter.pem -ignore_err)
node verify-cades.mjs test/out/ownership.cades.der test/out/ownership.json test/trusted     # accepted
node verify-cades.mjs test/out/ownership.revoked.der test/out/ownership.json test/trusted   # rejected: revoked
node bind-wallet.mjs test/out/ownership.json                                                # ed25519 co-signature
node server.mjs                                        # http://127.0.0.1:8787 → sign with AutoFirma, verify against the real FNMT CAs
```

`ca/*.cer` are the public FNMT CA certificates (sede.fnmt.gob.es). `web/autoscript.js` is the official @firma client (GPL 2+ / EUPL 1.1, ctt-gob-es/clienteafirma). Nothing private is ever committed: see `.gitignore`.
