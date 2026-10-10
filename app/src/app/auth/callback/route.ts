import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for every link Supabase sends by email (password reset, signup confirmation).
 * PKCE links carry `code`; token-hash links carry `token_hash` + `type`. Both end with a session cookie
 * and a redirect to `next` (same-origin paths only). Anything else goes back to /login with a reason.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next") ?? "/app";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/app";

  const supabase = await createClient();
  let failed = true;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = !!error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    failed = !!error;
  }
  // Relative Location: the browser resolves it on the host it used, so the session cookie just set is sent along.
  const location = failed ? "/login?error=link-expired" : next;
  return new NextResponse(null, { status: 303, headers: { Location: location } });
}
