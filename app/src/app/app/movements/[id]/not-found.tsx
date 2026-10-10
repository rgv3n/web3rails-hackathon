import Link from "next/link";
import { Notice } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="space-y-3">
      <Notice tone="warn">This movement does not exist in your organization, or your role cannot see it.</Notice>
      <Link href="/app/movements" className="text-sm font-medium underline-offset-4 hover:underline">Back to movements</Link>
    </div>
  );
}
