import mongoose, { Schema } from "mongoose";

const orgSchema = new Schema(
  {
    auditScheduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Schedule",
      required: true,
    },

    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
    },

    status: {
      type: Number,
      default: 0,
    },

    auditors: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },

    documents: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },

    visit: [
      {
        type: Schema.Types.Mixed,
      },
    ],

    verdict: {
      type: String,
      default: "",
    },

    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export const Org = mongoose.model("Org", orgSchema);
