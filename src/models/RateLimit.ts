import { Schema, model, models, type Model } from "mongoose";

/** Fixed-window counters stored in MongoDB so limits hold across serverless instances. */
const rateLimitSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { versionKey: false },
);

export interface RateLimitDoc {
  key: string;
  count: number;
  expiresAt: Date;
}

export const RateLimit: Model<RateLimitDoc> =
  (models.RateLimit as Model<RateLimitDoc>) || model<RateLimitDoc>("RateLimit", rateLimitSchema);
