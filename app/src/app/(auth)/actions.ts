"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface AuthState {
  error?: string;
  message?: string;
}

function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/app";
}

/** Public origin of this deployment, for links sent by email. Supabase only redirects to allow-listed URLs. */
async function getOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Invalid email or password." };
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!fullName || !email || !password) return { error: "All fields are required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName }, emailRedirectTo: `${await getOrigin()}/auth/callback?next=/onboarding` },
  });
  if (error) return { error: error.message };
  if (!data.session) return { message: "Check your inbox to confirm your email, then sign in." };
  redirect("/onboarding");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Email is required." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await getOrigin()}/auth/callback?next=/reset-password`,
  });
  // Same message whether or not the address exists: never reveal which emails have accounts.
  if (error && error.status !== 400 && error.status !== 422) return { error: "Could not send the email right now. Try again in a minute." };
  return { message: "If that address has an account, a reset link is on its way. It expires in one hour." };
}

export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirm) return { error: "The two passwords do not match." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "This reset link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  redirect("/app?message=password-updated");
}
