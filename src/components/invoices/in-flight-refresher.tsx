"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, POLL_INTERVAL_MS } from "@/lib/api-client";

/**
 * Polls the lightweight status endpoint only while invoices are in flight and the tab is visible,
 * then refreshes the server-rendered page when something changed. Stops by itself when `active` turns false.
 */
export function InFlightRefresher({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    let last: string | null = null;
    let stopped = false;
    const tick = async () => {
      if (stopped || document.hidden) return;
      try {
        const snap = await api<{ items: { id: string; status: string }[]; activeCount: number }>("/api/invoices/status");
        const sig = snap.items.map((i) => `${i.id}:${i.status}`).join("|");
        if (last !== null && sig !== last) router.refresh();
        last = sig;
        if (snap.activeCount === 0) router.refresh();
      } catch {
        /* transient — try again on next tick */
      }
    };
    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [active, router]);

  return null;
}
