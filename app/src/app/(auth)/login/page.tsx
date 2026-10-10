import Link from "next/link";
import { AuthShell } from "../AuthShell";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/app";
  const notice = typeof sp.error === "string" ? sp.error : null;
  return (
    <AuthShell
      title="Sign in"
      text="Access your organization's reconciliation workspace."
      footer={
        <>
          New to Web3Rails?{" "}
          <Link href="/signup" className="font-medium text-fg underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm next={next} notice={notice} />
    </AuthShell>
  );
}
