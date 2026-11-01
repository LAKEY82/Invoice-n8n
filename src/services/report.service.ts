import { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb/connect";
import { Invoice } from "@/models/Invoice";
import { BusinessSettings } from "@/models/BusinessSettings";

export interface ReportFilters {
  from?: string;
  to?: string;
  approvedOnly?: boolean;
}

export interface ReportData {
  currencies: string[];
  primaryCurrency: string;
  totals: { currency: string; count: number; subtotal: number; tax: number; discount: number; total: number }[];
  monthly: { month: string; currency: string; count: number; total: number }[];
  suppliers: { supplier: string; currency: string; count: number; total: number; tax: number }[];
  tax: { month: string; currency: string; subtotal: number; tax: number; total: number }[];
  statuses: { status: string; count: number }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function dateRange(f: ReportFilters) {
  const r: Record<string, Date> = {};
  if (f.from && !isNaN(Date.parse(f.from))) r.$gte = new Date(f.from);
  if (f.to && !isNaN(Date.parse(f.to))) r.$lte = new Date(new Date(f.to).getTime() + 86_399_999);
  return Object.keys(r).length ? { invoiceDate: r } : {};
}

export async function buildReport(userId: string, f: ReportFilters): Promise<ReportData> {
  await connectDB();
  const uid = new Types.ObjectId(userId);
  const counted = f.approvedOnly ? ["APPROVED"] : ["APPROVED", "REVIEW_REQUIRED"];
  const match = { userId: uid, processingStatus: { $in: counted }, ...dateRange(f) };
  const cur = { $ifNull: ["$currency", "N/A"] };
  const month = { $dateToString: { format: "%Y-%m", date: "$invoiceDate" } };

  const [totals, monthly, suppliers, statuses, settings] = await Promise.all([
    Invoice.aggregate([
      { $match: match },
      { $group: { _id: cur, count: { $sum: 1 }, subtotal: { $sum: { $ifNull: ["$subtotal", 0] } }, tax: { $sum: { $ifNull: ["$tax", 0] } }, discount: { $sum: { $ifNull: ["$discount", 0] } }, total: { $sum: { $ifNull: ["$total", 0] } } } },
      { $sort: { total: -1 } },
    ]),
    Invoice.aggregate([
      { $match: { ...match, invoiceDate: { $ne: null, ...(match as { invoiceDate?: object }).invoiceDate } } },
      { $group: { _id: { month, currency: cur }, count: { $sum: 1 }, total: { $sum: { $ifNull: ["$total", 0] } }, subtotal: { $sum: { $ifNull: ["$subtotal", 0] } }, tax: { $sum: { $ifNull: ["$tax", 0] } } } },
      { $sort: { "_id.month": 1 } },
    ]),
    Invoice.aggregate([
      { $match: match },
      { $group: { _id: { supplier: { $ifNull: ["$supplierName", "Unknown supplier"] }, currency: cur }, count: { $sum: 1 }, total: { $sum: { $ifNull: ["$total", 0] } }, tax: { $sum: { $ifNull: ["$tax", 0] } } } },
      { $sort: { total: -1 } },
      { $limit: 200 },
    ]),
    Invoice.aggregate([
      { $match: { userId: uid, processingStatus: { $ne: "PENDING_UPLOAD" }, ...dateRange(f) } },
      { $group: { _id: "$processingStatus", count: { $sum: 1 } } },
    ]),
    BusinessSettings.findOne({ userId }).lean(),
  ]);

  const currencies = totals.map((t) => t._id as string);
  const wanted = settings?.defaultCurrency ?? "USD";
  return {
    currencies,
    primaryCurrency: currencies.includes(wanted) ? wanted : (currencies[0] ?? wanted),
    totals: totals.map((t) => ({ currency: t._id, count: t.count, subtotal: r2(t.subtotal), tax: r2(t.tax), discount: r2(t.discount), total: r2(t.total) })),
    monthly: monthly.map((m) => ({ month: m._id.month, currency: m._id.currency, count: m.count, total: r2(m.total) })),
    suppliers: suppliers.map((s) => ({ supplier: s._id.supplier, currency: s._id.currency, count: s.count, total: r2(s.total), tax: r2(s.tax) })),
    tax: monthly.map((m) => ({ month: m._id.month, currency: m._id.currency, subtotal: r2(m.subtotal), tax: r2(m.tax), total: r2(m.total) })),
    statuses: statuses.map((s) => ({ status: s._id, count: s.count })).sort((a, b) => b.count - a.count),
  };
}
