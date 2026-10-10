/**
 * Local harness: serves web/, builds the attestation text, and verifies the CAdES signature AutoFirma returns
 * against the REAL FNMT CAs (ca/*.cer) with live OCSP. Nothing is written to disk; nothing leaves the machine.
 * Run: node server.mjs  → http://127.0.0.1:8787
 */
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import * as pkijs from "pkijs";
import { verifyCades } from "./verify-cades.mjs";

const caDir = process.env.CA_DIR ?? "ca";
const trusted = readdirSync(caDir).filter((f) => /\.(cer|pem)$/i.test(f)).map((f) => {
  const raw = readFileSync(join(caDir, f));
  const text = raw.toString("latin1");
  return text.includes("-----BEGIN") ? pkijs.Certificate.fromBER(Buffer.from(text.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64")) : pkijs.Certificate.fromBER(raw);
});
console.log(`trusted CAs: ${trusted.map((c) => c.subject.typesAndValues.at(-1).value.valueBlock.value).join(" | ")}`);

const attestation = (wallet) => JSON.stringify({ statement: "ownership_attestation", version: 1, chain: "solana", wallet, issued_at: new Date().toISOString().slice(0, 16) + "Z", nonce: Math.random().toString(36).slice(2, 10) });
const issued = new Map(); // nonce → text, so the server only verifies texts it generated

createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/attestation") {
    const text = attestation(url.searchParams.get("wallet") ?? "");
    issued.set(JSON.parse(text).nonce, text);
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }); return res.end(text);
  }
  if (url.pathname === "/verify" && req.method === "POST") {
    let body = ""; for await (const c of req) body += c;
    const { payload, signatureB64 } = JSON.parse(body);
    const known = issued.get(JSON.parse(payload).nonce);
    if (known !== payload) { res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ verdict: "rejected", reasons: ["payload was not issued by this server"] })); }
    try {
      const report = await verifyCades({ signatureDer: Buffer.from(signatureB64, "base64"), content: Buffer.from(payload, "utf8"), trusted });
      res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(report));
    } catch (e) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ verdict: "rejected", reasons: [e.message] })); }
  }
  const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  try {
    const data = readFileSync(join("web", file));
    res.writeHead(200, { "Content-Type": { ".html": "text/html; charset=utf-8", ".js": "text/javascript" }[extname(file)] ?? "application/octet-stream" }); res.end(data);
  } catch { res.writeHead(404); res.end("not found"); }
}).listen(8787, "127.0.0.1", () => console.log("http://127.0.0.1:8787"));
