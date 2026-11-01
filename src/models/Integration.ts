import { Schema, model, models, type Model, type Types } from "mongoose";

export const INTEGRATION_PROVIDERS = ["gemini", "openai"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

const integrationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    provider: { type: String, enum: INTEGRATION_PROVIDERS, required: true },
    /** AES-256-GCM ciphertext — never returned to the client. */
    encryptedSecret: { type: String, required: true },
    secretHint: { type: String, default: "" },
    model: { type: String, default: null },
    lastTestedAt: { type: Date, default: null },
    lastTestOk: { type: Boolean, default: null },
    lastTestMessage: { type: String, default: null },
  },
  { timestamps: true },
);

integrationSchema.index({ userId: 1, provider: 1 }, { unique: true });

export interface IntegrationDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  provider: IntegrationProvider;
  encryptedSecret: string;
  secretHint: string;
  model: string | null;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
}

export const Integration: Model<IntegrationDoc> =
  (models.Integration as Model<IntegrationDoc>) || model<IntegrationDoc>("Integration", integrationSchema);
