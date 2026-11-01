"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { statusLabel } from "@/components/ui/badge";
import type { DashboardData } from "@/services/dashboard.service";
import type { InvoiceStatus } from "@/types/invoice";

const PALETTE = ["#2563eb", "#0ea5e9", "#6366f1", "#14b8a6", "#f59e0b", "#94a3b8"];
const STATUS_COLORS: Record<string, string> = {
  APPROVED: "#10b981", REVIEW_REQUIRED: "#f59e0b", PROCESSING: "#2563eb", PENDING: "#94a3b8", FAILED: "#ef4444", DUPLICATE: "#8b5cf6", PENDING_UPLOAD: "#cbd5e1",
};

const compact = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" });
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function Empty() {
  return <div className="flex h-60 items-center justify-center text-sm text-muted">No data yet</div>;
}

export function DashboardCharts({ data }: { data: DashboardData }) {
  const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: data.currency, maximumFractionDigits: 0 }).format(n);
  const hasSpend = data.monthly.some((m) => m.total > 0);
  const hasActivity = data.activity.some((a) => a.uploaded > 0);
  const axis = { stroke: "#94a3b8", fontSize: 12, tickLine: false, axisLine: false } as const;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Monthly invoice spending ({data.currency})</CardTitle></CardHeader>
        <CardContent className="h-72">
          {hasSpend ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthly}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
                <YAxis tickFormatter={compact} {...axis} width={48} />
                <Tooltip formatter={(v) => money(Number(v))} labelFormatter={(l) => monthLabel(String(l))} />
                <Bar dataKey="total" name="Spend" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Processing activity (14 days)</CardTitle></CardHeader>
        <CardContent className="h-72">
          {hasActivity ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.activity}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tickFormatter={dayLabel} {...axis} />
                <YAxis allowDecimals={false} {...axis} width={32} />
                <Tooltip labelFormatter={(l) => dayLabel(String(l))} />
                <Legend />
                <Line type="monotone" dataKey="uploaded" name="Uploaded" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="processed" name="Processed" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="failed" name="Failed" stroke="#ef4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Top suppliers</CardTitle></CardHeader>
        <CardContent className="h-72">
          {data.suppliers.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.suppliers} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tickFormatter={compact} {...axis} />
                <YAxis type="category" dataKey="name" width={110} {...axis} tickFormatter={(s: string) => (s.length > 16 ? `${s.slice(0, 15)}…` : s)} />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Bar dataKey="total" name="Total" radius={[0, 4, 4, 0]}>
                  {data.suppliers.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Invoice status distribution</CardTitle></CardHeader>
        <CardContent className="h-72">
          {data.statuses.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.statuses.map((s) => ({ name: statusLabel(s.status as InvoiceStatus), value: s.count, key: s.status }))} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {data.statuses.map((s) => <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? "#94a3b8"} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </CardContent>
      </Card>
    </div>
  );
}
