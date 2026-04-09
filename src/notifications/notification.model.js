import mongoose, { Schema } from "mongoose";

const NOTIFICATION_TYPES = [
  "SCHEDULE_CREATED",
  "SCHEDULE_UPDATED",
  "SCHEDULE_CLOSED",
  "SCHEDULE_DELETED",
  "ORGANIZATION_ADDED",
  "ORGANIZATION_UPDATED",
  "ORGANIZATION_DELETED",
  "FINDING_ADDED",
  "FINDING_NC_ADDED",
  "VERDICT_SET",
  "AUDITOR_ASSIGNED",
  "AUDITOR_REMOVED",
  "ACTION_PLAN_SUBMITTED",
  "TEAM_ADDED_AS_ORG",
];

const notificationSchema = new Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    message: {
      type: String,
      default: "",
    },

    data: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },

    read: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

export const Notification = mongoose.model("Notification", notificationSchema);
export { NOTIFICATION_TYPES };
