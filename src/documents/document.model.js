import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: "",
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      enum: ["file", "folder", "auditSchedule", "formTemplate", "formResponse"],
      required: true,
    },
    status: {
      type: Number,
      default: -1,
      min: -1,
      max: 3,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      default: null,
    },
    path: {
      type: [String],
      default: [],
    },
    privacy: {
      users: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      teams: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Team",
        },
      ],
      roles: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Role",
        },
      ],
    },
    permissionOverrides: {
      readOnly: {
        type: Number,
        default: 0,
      },
      restricted: {
        type: Number,
        default: 0,
      },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: false },
    toObject: { virtuals: false },
  },
);

// Pre-save middleware to set default title from filename for file type
documentSchema.pre("save", function () {
  if (this.type === "file") {
    // Set default title from filename if not provided
    if (!this.title && this.metadata && this.metadata.filename) {
      this.title = this.metadata.filename;
    }

    // Set default checkedOut value if not provided
    if (!this.metadata) {
      this.metadata = {};
    }
    if (this.metadata.checkedOut === undefined) {
      this.metadata.checkedOut = 0;
    }
  }
});

// Indexes for better query performance
documentSchema.index({ type: 1 });
documentSchema.index({ status: 1 });
documentSchema.index({ parentId: 1 });
documentSchema.index({ owner: 1 });

export const Document =
  mongoose.models.Document || mongoose.model("Document", documentSchema);
