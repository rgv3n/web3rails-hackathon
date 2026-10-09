import Image from "next/image";
import { cn } from "@/lib/cn";
import mark from "../../public/brand/logo-mark.png";

export function Logo({ className, invert = false }: { className?: string; invert?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image src={mark} alt="" aria-hidden width={42} height={22} priority className="h-[22px] w-auto shrink-0" style={{ width: "auto", height: 22 }} />
      <span className={cn("text-[17px] font-semibold tracking-tight", invert ? "text-ink-fg" : "text-fg")}>
        Web3Rails
      </span>
    </span>
  );
}
