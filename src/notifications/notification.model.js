import mongoose, { Schema } from "mongoose";

/**
 * Notification event types grouped by audience.
 *
 * ADMIN events   – every audit-schedule lifecycle action.
 * QMR events     – auditor sets a final verdict.
 * AUDITOR events – assigned/removed, action plan submitted, schedule closed.
 * TEAM_LEADER    – team added as org, NC finding added, schedule closed.
 */
const NOTIFICATION_TYPES = {
  // Admin notifications
  SCHEDULE_CREATED: "SCHEDULE_CREATED",
  SCHEDULE_UPDATED: "SCHEDULE_UPDATED",
  SCHEDULE_CLOSED: "SCHEDULE_CLOSED",
  SCHEDULE_DELETED: "SCHEDULE_DELETED",
  ORGANIZATION_ADDED: "ORGANIZATION_ADDED",
  ORGANIZATION_UPDATED: "ORGANIZATION_UPDATED",
  ORGANIZATION_DELETED: "ORGANIZATION_DELETED",
  FINDING_ADDED: "FINDING_ADDED",
  FINDING_UPDATED: "FINDING_UPDATED",
  VERDICT_SET: "VERDICT_SET",
  AUDITOR_ASSIGNED: "AUDITOR_ASSIGNED",
  AUDITOR_REMOVED: "AUDITOR_REMOVED",
  VISIT_ADDED: "VISIT_ADDED",
  VISIT_UPDATED: "VISIT_UPDATED",
  ACTION_PLAN_SUBMITTED: "ACTION_PLAN_SUBMITTED",

  // QMR-specific
  QMR_VERDICT_SET: "QMR_VERDICT_SET",

  // Auditor-specific
  AUDITOR_ASSIGNED_TO_ORG: "AUDITOR_ASSIGNED_TO_ORG",
  AUDITOR_REMOVED_FROM_ORG: "AUDITOR_REMOVED_FROM_ORG",
  AUDITOR_ACTION_PLAN_SUBMITTED: "AUDITOR_ACTION_PLAN_SUBMITTED",
  AUDITOR_SCHEDULE_CLOSED: "AUDITOR_SCHEDULE_CLOSED",

  // Team Leader-specific
  TEAM_ADDED_AS_ORG: "TEAM_ADDED_AS_ORG",
  TEAM_NC_FINDING_ADDED: "TEAM_NC_FINDING_ADDED",
  TEAM_SCHEDULE_CLOSED: "TEAM_SCHEDULE_CLOSED",
};

const notificationSchema = new Schema(
  {
    // The user who should receive this notification
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // The notification event type
    type: {
      type: String,
      required: true,
      enum: Object.values(NOTIFICATION_TYPES),
    },

    // Human-readable title shown in the notification
    title: {
      type: String,
      required: true,
    },

    // Longer description / body
    message: {
      type: String,
      default: "",
    },

    // Which role type this notification targets (admin, qmr, auditor, teamLeader)
    roleType: {
      type: String,
      enum: ["admin", "qmr", "auditor", "teamLeader"],
      required: true,
    },

    // Optional reference to the entity that triggered the notification
    entity: {
      kind: {
        type: String,
        enum: [
          "Schedule",
          "Organization",
          "Visit",
          "Finding",
          "User",
          "Team",
        ],
        default: null,
      },
      id: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
    },

    // Who triggered the action (the actor)
    actor: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      name: { type: String, default: "" },
    },

    // Read / seen flags
    read: {
      type: Boolean,
      default: false,
      index: true,
    },

    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for efficient queries: unread notifications per user
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

export const Notification = mongoose.model("Notification", notificationSchema);
export { NOTIFICATION_TYPES };
