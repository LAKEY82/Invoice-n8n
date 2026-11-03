"use client";

import { usePathname, useRouter } from "next/navigation";
import { Select } from "@/components/ui/form";

/** Switches the currency every dashboard amount is shown in (kept in the URL, so it survives refreshes). */
export function CurrencySelect({ value, options }: { value: string; options: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const list = options.includes(value) ? options : [value, ...options];
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
      Show amounts in
      <Select
        aria-label="Display currency"
        value={value}
        className="w-24"
        onChange={(e) => router.replace(`${pathname}?currency=${e.target.value}`, { scroll: false })}
      >
        {list.map((c) => <option key={c}>{c}</option>)}
      </Select>
    </label>
  );
}
