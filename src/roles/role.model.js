// ...existing code...
import mongoose, { Schema } from "mongoose";

const roleSchema = new Schema(
  {
    title: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: "" },

    // store arbitrary nested permission structures
    permissions: { type: Schema.Types.Mixed, default: {} },

    deletedAt: {
      type: Date,
      default: null,
    },
  },

  { timestamps: true }
);

export const Role = mongoose.model("Role", roleSchema);
// ...existing code...
