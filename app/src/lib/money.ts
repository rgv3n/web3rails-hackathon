/**
 * Exact token amounts. amount_raw is an integer string in minimal units; decimals is the token's scale.
 * No floating point anywhere in this file.
 */
export function formatTokenAmount(amountRaw: string, decimals: number, opts: { maxFraction?: number } = {}): string {
  if (!/^\d+$/.test(amountRaw)) return amountRaw;
  const neg = false;
  const raw = BigInt(amountRaw);
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = raw % base;
  const wholeStr = groupThousands(whole.toString());
  if (decimals === 0) return (neg ? "-" : "") + wholeStr;
  let fracStr = frac.toString().padStart(decimals, "0");
  const maxFraction = opts.maxFraction ?? Math.min(decimals, 6);
  fracStr = fracStr.slice(0, maxFraction).replace(/0+$/, "");
  const truncated = frac.toString().padStart(decimals, "0").slice(maxFraction).replace(/0/g, "").length > 0;
  return (neg ? "-" : "") + wholeStr + (fracStr ? "." + fracStr : "") + (truncated ? "…" : "");
}

function groupThousands(s: string) {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Parse a human decimal string ("4250.00") into minimal units for a given scale. Returns null when not exact. */
export function parseDecimalToRaw(value: string, decimals: number): string | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) return null;
  const [, whole, frac = ""] = m;
  if (frac.length > decimals) return null;
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0")).toString();
}

/** Fiat amounts arrive as exact decimal strings from Postgres numeric; format without converting to float. */
export function formatFiat(value: string, currency: string): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!m) return `${value} ${currency}`;
  const [, sign, whole, frac = ""] = m;
  const cents = (frac + "00").slice(0, 2);
  return `${sign}${groupThousands(whole)}.${cents} ${currency}`;
}

/** Exact decimal string from Postgres numeric → display without float: trims trailing zeros, keeps at least `minFraction` places. */
export function trimDecimal(value: string | null | undefined, minFraction = 2): string {
  if (value == null) return "—";
  const m = /^(-?\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!m) return String(value);
  const [, whole, frac = ""] = m;
  let f = frac.replace(/0+$/, "");
  if (f.length < minFraction) f = f.padEnd(minFraction, "0");
  return f ? `${whole}.${f}` : whole;
}
