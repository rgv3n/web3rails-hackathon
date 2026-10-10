import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { attestationConfigured } from "@/lib/attestation/proof";

/** POST { wallet_id } → issues an ownership statement for the wallet (admin of its organization). */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!attestationConfigured()) return NextResponse.json({ error: "Ownership verification is not configured on this server (ATTESTATION_HMAC_SECRET)." }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { wallet_id?: string; method?: string };
  if (!body.wallet_id) return NextResponse.json({ error: "wallet_id required" }, { status: 400 });
  const method = body.method === "wallet_key" ? "wallet_key" : "certificate";
  const { data, error } = await supabase.rpc("issue_wallet_attestation", { p_wallet: body.wallet_id, p_method: method });
  if (error) return NextResponse.json({ error: error.message }, { status: error.message.startsWith("FORBIDDEN") ? 403 : 400 });
  return NextResponse.json(data);
}
