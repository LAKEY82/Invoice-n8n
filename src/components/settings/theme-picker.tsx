"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { THEMES, type ThemeId } from "@/lib/theme";
import { api } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function ThemePicker({ initial }: { initial: ThemeId }) {
  const router = useRouter();
  const { toast } = useToast();
  const [value, setValue] = useState<ThemeId>(initial);
  const [saving, setSaving] = useState(false);

  async function choose(id: ThemeId) {
    if (id === value || saving) return;
    const previous = value;
    setValue(id);
    // Preview instantly; the layout re-renders with the saved value after the request.
    document.querySelector("[data-app-theme]")?.setAttribute("data-theme", id);
    setSaving(true);
    try {
      await api("/api/settings", { method: "PATCH", json: { themeColor: id } });
      router.refresh();
    } catch (e) {
      setValue(previous);
      document.querySelector("[data-app-theme]")?.setAttribute("data-theme", previous);
      toast("error", e instanceof Error ? e.message : "Could not save your theme.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div role="radiogroup" aria-label="Theme colour" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {THEMES.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => choose(t.id)}
            className={cn(
              "flex flex-col items-center gap-3 rounded-2xl border bg-white p-4 text-sm font-medium text-navy transition-all hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
              active ? "border-navy shadow-card" : "border-border",
            )}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full text-white" style={{ background: t.swatch }}>
              {active && <Check className="h-5 w-5 text-navy" />}
            </span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
