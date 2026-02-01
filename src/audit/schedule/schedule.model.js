import mongoose, { Schema } from "mongoose";

const scheduleSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
    },

    auditCode: {
      type: String,
      default: "",
    },

    auditType: {
      type: String,
      default: "",
    },

    standard: {
      type: String,
      default: "",
    },

    date: {
      start: {
        type: Date,
        default: null,
      },
      end: {
        type: Date,
        default: null,
      },
    },

    organizations: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },

    status: {
      type: Number,
      default: 0,
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
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

export const Schedule = mongoose.model("Schedule", scheduleSchema);
