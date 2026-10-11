Web3Rails DEMO certificate. Not issued by any real certification authority. It proves nothing about anyone.
Use it only to try the wallet-ownership verification in a DEMO organization.

File:     demo-representative.p12   (PKCS#12, contains a throwaway private key)
Password: demo1234
Subject:  MARIA EJEMPLO, representative of ACME DEMO SL (NIF 00000000T, CIF B00000000), all fictitious
Issuer:   Web3Rails Demo Root (demo-root.pem)

How to use it (desktop only):
  1. Install AutoFirma from firmaelectronica.gob.es if you do not have it.
  2. Double-click demo-representative.p12 and import it into your system keystore (Windows certificate store or macOS Keychain)
     with the password above. AutoFirma reads that keystore, so the certificate appears in its dialog.
  3. In Web3Rails, open the wallet > Verify ownership > Sign with AutoFirma. The first time, the browser asks to open AutoFirma: accept.
Real organizations only accept qualified certificates (FNMT and other eIDAS providers); this file is rejected there.
