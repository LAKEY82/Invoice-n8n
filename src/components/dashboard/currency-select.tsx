"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/** Switches the currency every dashboard amount is shown in (kept in the URL, so it survives refreshes). */
export function CurrencySelect({ value, options, tone = "light" }: { value: string; options: string[]; tone?: "light" | "dark" }) {
  const router = useRouter();
  const pathname = usePathname();
  const list = options.includes(value) ? options : [value, ...options];
  return (
    <label className={cn("flex items-center gap-2 text-xs font-medium", tone === "dark" ? "text-slate-300" : "text-slate-600")}>
      Show amounts in
      <select
        aria-label="Display currency"
        value={value}
        onChange={(e) => router.replace(`${pathname}?currency=${e.target.value}`, { scroll: false })}
        className={cn(
          "h-9 w-24 rounded-xl border px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40",
          tone === "dark" ? "border-white/15 bg-white/10 text-white [&>option]:text-navy" : "border-border bg-white text-navy",
        )}
      >
        {list.map((c) => <option key={c}>{c}</option>)}
      </select>
    </label>
  );
}
