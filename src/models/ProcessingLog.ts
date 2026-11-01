import { Schema, model, models, type Model, type Types } from "mongoose";

/** Processing attempts and audit trail. Expires after 90 days to preserve free-tier storage. */
const processingLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", default: null },
    jobId: { type: String, default: null },
    event: { type: String, required: true },
    level: { type: String, enum: ["info", "warn", "error"], default: "info" },
    message: { type: String, default: "" },
    meta: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 },
  },
  { versionKey: false },
);

processingLogSchema.index({ userId: 1, createdAt: -1 });
processingLogSchema.index({ invoiceId: 1, createdAt: -1 });

export interface ProcessingLogDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  invoiceId: Types.ObjectId | null;
  jobId: string | null;
  event: string;
  level: "info" | "warn" | "error";
  message: string;
  meta: unknown;
  createdAt: Date;
}

export const ProcessingLog: Model<ProcessingLogDoc> =
  (models.ProcessingLog as Model<ProcessingLogDoc>) || model<ProcessingLogDoc>("ProcessingLog", processingLogSchema);
