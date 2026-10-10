import { createHash, randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Full secret shown once; only prefix + sha256 are stored. */
export function generateApiKey(env: "live" | "test" = "test") {
  const bytes = randomBytes(32);
  let body = "";
  for (const b of bytes) body += ALPHABET[b % ALPHABET.length];
  const secret = `w3r_${env}_${body}`;
  return { secret, prefix: secret.slice(0, 13), hash: hashApiKey(secret) };
}

export function hashApiKey(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}
