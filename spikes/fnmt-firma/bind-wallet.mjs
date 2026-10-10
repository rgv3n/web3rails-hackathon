/**
 * Second signature: the Solana wallet signs the SAME attestation bytes (ed25519). Verifying both proves that whoever
 * holds the FNMT certificate (legal identity: NIF + CIF) also controls the wallet's private key.
 * In the product the wallet signature comes from the user's wallet (Phantom etc. signMessage); here a keypair stands in.
 */
import { readFileSync } from "node:fs";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
ed.hashes.sha512 = sha512;
import bs58 from "bs58";

const content = readFileSync(process.argv[2]);
const attestation = JSON.parse(content.toString("utf8"));
const priv = ed.utils.randomSecretKey();
const pub = ed.getPublicKey(priv);
const walletAddress = bs58.encode(pub);
// The attestation must name the wallet that signs it: patch the fixture's wallet to this keypair for the demo.
const bytes = Buffer.from(JSON.stringify({ ...attestation, wallet: walletAddress }));
const sig = ed.sign(bytes, priv);
const ok = ed.verify(sig, bytes, bs58.decode(walletAddress));
const tampered = ed.verify(sig, Buffer.from(JSON.stringify({ ...attestation, wallet: walletAddress, nonce: "x" })), bs58.decode(walletAddress));
console.log(JSON.stringify({ wallet: walletAddress, wallet_signature_b58: bs58.encode(sig), verifies: ok, tampered_verifies: tampered }, null, 2));
