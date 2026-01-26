import mongoose, { Schema } from "mongoose";

const fileTypeSchema = new Schema(
  {
    name: { type: String, default: "", trim: true },
    isQualityDocument: { type: Boolean, default: false },
    isDefault: { type: Boolean, default: false },

    deletedAt: {
      type: Date,
      default: null,
    },
  },

  { timestamps: true },
);

export const FileType = mongoose.model("FileType", fileTypeSchema);
