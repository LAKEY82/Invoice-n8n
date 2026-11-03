import { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb/connect";
import { Invoice, type InvoiceDoc } from "@/models/Invoice";
import { BusinessSettings } from "@/models/BusinessSettings";
import { toDTO } from "@/services/invoice.service";
import type { InvoiceDTO } from "@/types/invoice";
import { convertAmount, getRates } from "@/lib/fx/rates";

export interface DashboardData {
  /** Currency every amount below is shown in. */
  currency: string;
  /** Invoices that could not be converted (no exchange rate available) and are left out of the amounts. */
  otherCurrencyCount: number;
  /** Date of the exchange rates used, when any invoice was converted from another currency. */
  rateDate: string | null;
  /** Currencies the user can pick (those with a published rate). */
  currencies: string[];
  stats: { totalInvoices: number; totalValue: number; processed: number; pendingReview: number; failed: number; duplicates: number; inFlight: number };
  monthly: { month: string; total: number }[];
  activity: { date: string; uploaded: number; processed: number; failed: number }[];
  suppliers: { name: string; total: number }[];
  statuses: { status: string; count: number }[];
  recent: InvoiceDTO[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export async function getDashboard(userId: string, requestedCurrency?: string): Promise<DashboardData> {
  await connectDB();
  const uid = new Types.ObjectId(userId);
  const settings = await BusinessSettings.findOne({ userId }).lean();
  const fx = await getRates();
  const wanted = requestedCurrency?.toUpperCase();
  const currency = wanted && /^[A-Z]{3}$/.test(wanted) && (fx?.rates[wanted] || wanted === settings?.defaultCurrency) ? wanted : (settings?.defaultCurrency ?? "USD");
  /** Amount in the display currency, or null when no rate exists. Invoices without a currency count as the display currency. */
  const conv = (amount: number, from: string | null) => convertAmount(amount, from ?? currency, currency, fx);
  const base = { userId: uid, processingStatus: { $ne: "PENDING_UPLOAD" as const } };
  const valued = { ...base, processingStatus: { $in: ["APPROVED", "REVIEW_REQUIRED"] } };
  const since12 = new Date();
  since12.setMonth(since12.getMonth() - 11, 1);
  since12.setHours(0, 0, 0, 0);
  const since14 = new Date(Date.now() - 13 * 86_400_000);
  since14.setHours(0, 0, 0, 0);

  const [statusRows, valueRows, monthlyRows, activityRows, supplierRows, recent] = await Promise.all([
    Invoice.aggregate([{ $match: base }, { $group: { _id: "$processingStatus", count: { $sum: 1 } } }]),
    Invoice.aggregate([{ $match: valued }, { $group: { _id: "$currency", count: { $sum: 1 }, total: { $sum: { $ifNull: ["$total", 0] } } } }]),
    Invoice.aggregate([
      { $match: { ...valued, invoiceDate: { $gte: since12 } } },
      { $group: { _id: { month: { $dateToString: { format: "%Y-%m", date: "$invoiceDate" } }, cur: "$currency" }, count: { $sum: 1 }, total: { $sum: { $ifNull: ["$total", 0] } } } },
    ]),
    Invoice.aggregate([
      { $match: { ...base, createdAt: { $gte: since14 } } },
      { $group: { _id: { day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, s: "$processingStatus" }, count: { $sum: 1 } } },
    ]),
    Invoice.aggregate([
      { $match: valued },
      { $group: { _id: { name: { $ifNull: ["$supplierName", "Unknown"] }, cur: "$currency" }, total: { $sum: { $ifNull: ["$total", 0] } } } },
    ]),
    Invoice.find(base).sort({ updatedAt: -1 }).limit(8).lean(),
  ]);

  // Convert every currency bucket into the display currency; buckets without a rate are left out and reported.
  let totalValue = 0;
  let unconverted = 0;
  let usedForeign = false;
  for (const r of valueRows) {
    const v = conv(r.total, r._id as string | null);
    if (v === null) unconverted += r.count;
    else {
      totalValue += v;
      if (r._id && r._id !== currency) usedForeign = true;
    }
  }
  const monthlyTotals = new Map<string, number>();
  for (const m of monthlyRows) {
    const v = conv(m.total, m._id.cur as string | null);
    if (v !== null) monthlyTotals.set(m._id.month, (monthlyTotals.get(m._id.month) ?? 0) + v);
  }
  const supplierTotals = new Map<string, number>();
  for (const sp of supplierRows) {
    const v = conv(sp.total, sp._id.cur as string | null);
    if (v !== null) supplierTotals.set(sp._id.name, (supplierTotals.get(sp._id.name) ?? 0) + v);
  }
  const topSuppliers = [...supplierTotals].sort((a, b) => b[1] - a[1]).slice(0, 6);

  const count = (s: string) => statusRows.find((r) => r._id === s)?.count ?? 0;
  const totalInvoices = statusRows.reduce((n, r) => n + r.count, 0);

  // Fill missing months/days so charts have continuous axes.
  const months: { month: string; total: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(since12);
    d.setMonth(since12.getMonth() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({ month: key, total: r2(monthlyTotals.get(key) ?? 0) });
  }
  const activity: DashboardData["activity"] = [];
  for (let i = 0; i < 14; i++) {
    const key = dayKey(new Date(since14.getTime() + i * 86_400_000));
    const rows = activityRows.filter((r) => r._id.day === key);
    const sum = (ss: string[]) => rows.filter((r) => ss.includes(r._id.s)).reduce((n, r) => n + r.count, 0);
    activity.push({ date: key, uploaded: rows.reduce((n, r) => n + r.count, 0), processed: sum(["REVIEW_REQUIRED", "APPROVED"]), failed: sum(["FAILED"]) });
  }

  return {
    currency,
    otherCurrencyCount: unconverted,
    rateDate: usedForeign ? (fx?.date ?? null) : null,
    currencies: fx ? Object.keys(fx.rates).sort() : [],
    stats: {
      totalInvoices,
      totalValue: r2(totalValue),
      processed: count("APPROVED") + count("REVIEW_REQUIRED"),
      pendingReview: count("REVIEW_REQUIRED"),
      failed: count("FAILED"),
      duplicates: count("DUPLICATE"),
      inFlight: count("PENDING") + count("PROCESSING"),
    },
    monthly: months,
    activity,
    suppliers: topSuppliers.map(([name, total]) => ({ name, total: r2(total) })),
    statuses: statusRows.map((r) => ({ status: r._id as string, count: r.count })),
    recent: (recent as InvoiceDoc[]).map(toDTO),
  };
}
