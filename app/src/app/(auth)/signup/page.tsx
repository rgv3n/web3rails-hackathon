import Link from "next/link";
import { AuthShell } from "../AuthShell";
import { SignupForm } from "./SignupForm";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your account"
      text="Then create your organization and connect your first wallet."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-fg underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
