import { Schema, model, models, type Model, type Types } from "mongoose";

const businessSettingsSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    businessName: { type: String, default: "" },
    defaultCurrency: { type: String, default: "USD" },
    /** Tolerance (in currency units) when comparing computed vs. stated totals. */
    totalsTolerance: { type: Number, default: 0.02 },
    preferredProvider: { type: String, enum: ["gemini", "openai"], default: "gemini" },
    /** UI accent colour chosen under Settings. */
    themeColor: { type: String, enum: ["green", "blue", "red", "orange", "pink"], default: "green" },
  },
  { timestamps: true },
);

export interface BusinessSettingsDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  businessName: string;
  defaultCurrency: string;
  totalsTolerance: number;
  preferredProvider: "gemini" | "openai";
  themeColor?: "green" | "blue" | "red" | "orange" | "pink";
}

export const BusinessSettings: Model<BusinessSettingsDoc> =
  (models.BusinessSettings as Model<BusinessSettingsDoc>) ||
  model<BusinessSettingsDoc>("BusinessSettings", businessSettingsSchema);
