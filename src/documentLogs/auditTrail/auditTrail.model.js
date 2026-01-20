import mongoose, { Schema } from "mongoose";

const auditTrailSchema = new Schema(
  {
    action: {
      type: String,
      enum: ["C", "R", "U", "D"], // C = Create, R = Read, U = Update, D = Delete
      required: true,
    },
    entityId: {
      type: String,
      required: true, // ID of the entity where action was made
    },
    log: {
      type: String,
      default: "", // Changes to data
    },
    module: {
      type: String,
      required: true, // e.g., USERS, TEAMS, ROLES, DOCUMENTS
    },
    summary: {
      type: String,
      default: "",
    },
    userData: {
      id: {
        type: String,
        required: true,
      },
      name: {
        type: String,
        required: true, // firstName lastName
      },
    },
  },
  {
    timestamps: true,
    minimize: false,
  },
);

export const AuditTrail = mongoose.model("AuditTrail", auditTrailSchema);
