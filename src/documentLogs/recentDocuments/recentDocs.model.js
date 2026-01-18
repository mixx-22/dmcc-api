import mongoose, { Schema } from "mongoose";

const recentDocsSchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },

    documentType: {
      type: String,
      default: "",
    },

    accessedAt: {
      type: Date,
      default: Date.now,
    },

    count: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

export const RecentDocs = mongoose.model("RecentDocs", recentDocsSchema);
