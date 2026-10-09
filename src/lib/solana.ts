const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

export function isSolanaAddress(v: string) {
  return v.length >= 32 && v.length <= 44 && BASE58.test(v);
}
export function isSolanaSignature(v: string) {
  return v.length >= 64 && v.length <= 88 && BASE58.test(v);
}

/** Explorer links are only built for a known chain and a validated identifier. */
export function explorerTxUrl(chain: string, signature: string): string | null {
  if (chain !== "solana" || !isSolanaSignature(signature)) return null;
  return `https://solscan.io/tx/${signature}`;
}
export function explorerAddressUrl(chain: string, address: string): string | null {
  if (chain !== "solana" || !isSolanaAddress(address)) return null;
  return `https://solscan.io/account/${address}`;
}

export function shortId(v: string, head = 6, tail = 6) {
  return v.length <= head + tail + 1 ? v : `${v.slice(0, head)}…${v.slice(-tail)}`;
}
