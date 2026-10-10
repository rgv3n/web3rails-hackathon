import Link from "next/link";
import { AuthShell } from "../AuthShell";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      text="Enter the email of your account. We will send a link that lets you choose a new password."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-fg underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
