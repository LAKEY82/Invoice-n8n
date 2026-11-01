import { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb/connect";
import { Invoice, type InvoiceDoc } from "@/models/Invoice";
import { BusinessSettings } from "@/models/BusinessSettings";
import { toDTO } from "@/services/invoice.service";
import type { InvoiceDTO } from "@/types/invoice";

export interface DashboardData {
  currency: string;
  otherCurrencyCount: number;
  stats: { totalInvoices: number; totalValue: number; processed: number; pendingReview: number; failed: number; duplicates: number; inFlight: number };
  monthly: { month: string; total: number }[];
  activity: { date: string; uploaded: number; processed: number; failed: number }[];
  suppliers: { name: string; total: number }[];
  statuses: { status: string; count: number }[];
  recent: InvoiceDTO[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export async function getDashboard(userId: string): Promise<DashboardData> {
  await connectDB();
  const uid = new Types.ObjectId(userId);
  const settings = await BusinessSettings.findOne({ userId }).lean();
  const currency = settings?.defaultCurrency ?? "USD";
  const base = { userId: uid, processingStatus: { $ne: "PENDING_UPLOAD" as const } };
  const valued = { ...base, processingStatus: { $in: ["APPROVED", "REVIEW_REQUIRED"] }, currency: { $in: [currency, null] } };
  const since12 = new Date();
  since12.setMonth(since12.getMonth() - 11, 1);
  since12.setHours(0, 0, 0, 0);
  const since14 = new Date(Date.now() - 13 * 86_400_000);
  since14.setHours(0, 0, 0, 0);

  const [statusRows, valueRow, otherCurrency, monthly, activityRows, suppliers, recent] = await Promise.all([
    Invoice.aggregate([{ $match: base }, { $group: { _id: "$processingStatus", count: { $sum: 1 } } }]),
    Invoice.aggregate([{ $match: valued }, { $group: { _id: null, total: { $sum: { $ifNull: ["$total", 0] } } } }]),
    Invoice.countDocuments({ ...base, processingStatus: { $in: ["APPROVED", "REVIEW_REQUIRED"] }, currency: { $nin: [currency, null] } }),
    Invoice.aggregate([
      { $match: { ...valued, invoiceDate: { $gte: since12 } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$invoiceDate" } }, total: { $sum: { $ifNull: ["$total", 0] } } } },
      { $sort: { _id: 1 } },
    ]),
    Invoice.aggregate([
      { $match: { ...base, createdAt: { $gte: since14 } } },
      { $group: { _id: { day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, s: "$processingStatus" }, count: { $sum: 1 } } },
    ]),
    Invoice.aggregate([
      { $match: valued },
      { $group: { _id: { $ifNull: ["$supplierName", "Unknown"] }, total: { $sum: { $ifNull: ["$total", 0] } } } },
      { $sort: { total: -1 } },
      { $limit: 6 },
    ]),
    Invoice.find(base).sort({ updatedAt: -1 }).limit(8).lean(),
  ]);

  const count = (s: string) => statusRows.find((r) => r._id === s)?.count ?? 0;
  const totalInvoices = statusRows.reduce((n, r) => n + r.count, 0);

  // Fill missing months/days so charts have continuous axes.
  const months: { month: string; total: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(since12);
    d.setMonth(since12.getMonth() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({ month: key, total: r2(monthly.find((m) => m._id === key)?.total ?? 0) });
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
    otherCurrencyCount: otherCurrency,
    stats: {
      totalInvoices,
      totalValue: r2(valueRow[0]?.total ?? 0),
      processed: count("APPROVED") + count("REVIEW_REQUIRED"),
      pendingReview: count("REVIEW_REQUIRED"),
      failed: count("FAILED"),
      duplicates: count("DUPLICATE"),
      inFlight: count("PENDING") + count("PROCESSING"),
    },
    monthly: months,
    activity,
    suppliers: suppliers.map((s) => ({ name: s._id as string, total: r2(s.total) })),
    statuses: statusRows.map((r) => ({ status: r._id as string, count: r.count })),
    recent: (recent as InvoiceDoc[]).map(toDTO),
  };
}
