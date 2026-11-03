"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function SpendChart({ data, currency }: { data: { month: string; total: number }[]; currency: string }) {
  if (!data.length) return <div className="flex h-full items-center justify-center text-sm text-muted">No data for this period.</div>;
  const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} width={56} tickFormatter={(n) => new Intl.NumberFormat("en-US", { notation: "compact" }).format(n)} />
        <Tooltip formatter={(v) => money(Number(v))} />
        <Bar dataKey="total" name="Spend" fill="var(--primary)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
