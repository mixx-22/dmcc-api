import mongoose from "mongoose";

const versionHistorySchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    versionHistory: [
      {
        title: {
          type: String,
          default: "",
        },
        description: {
          type: String,
          default: "",
        },
        metadata: {
          type: mongoose.Schema.Types.Mixed,
          default: {},
        },
        ownerData: {
          userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          name: {
            type: String,
            default: "",
          },
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        updatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

const VersionHistory = mongoose.model("VersionHistory", versionHistorySchema);

export { VersionHistory };
