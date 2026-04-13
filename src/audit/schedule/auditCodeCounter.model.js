import mongoose, { Schema } from "mongoose";

/**
 * Tracks the highest sequence number ever assigned for each
 * auditTypeCode + year combination.  Using a dedicated counter
 * document with atomic $inc guarantees no two audits can receive
 * the same sequence number, even under concurrent requests.
 *
 * Deleted audits still consume their sequence number so the audit
 * trail is never ambiguous about which codes existed.
 */
const auditCodeCounterSchema = new Schema({
  auditTypeCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  },
  year: {
    type: Number,
    required: true,
  },
  sequence: {
    type: Number,
    default: 0,
  },
});

auditCodeCounterSchema.index({ auditTypeCode: 1, year: 1 }, { unique: true });

export const AuditCodeCounter = mongoose.model(
  "AuditCodeCounter",
  auditCodeCounterSchema,
);
