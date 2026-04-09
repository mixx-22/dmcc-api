import { Notification, NOTIFICATION_TYPES } from "./notification.model.js";
import { sendToUsers } from "./websocket.js";
import { User } from "../users/user.model.js";
import { Role } from "../roles/role.model.js";
import { Team } from "../teams/team.model.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the display name for a user object or an actor-like object.
 */
const actorName = (user) => {
  if (!user) return "System";
  const first = user.firstName || "";
  const last = user.lastName || "";
  const full = `${first} ${last}`.trim();
  return full || user.username || "Unknown";
};

/**
 * Find all active user IDs that carry at least one role with the given roleType tag.
 *
 * @param {string} roleType – one of "admin", "qmr", "auditor", "teamLeader"
 * @returns {Promise<string[]>} array of user ID strings
 */
const getUserIdsByRoleType = async (roleType) => {
  // Validate roleType to prevent NoSQL injection
  const validTypes = ["admin", "qmr", "auditor", "teamLeader"];
  if (!validTypes.includes(roleType)) return [];

  // 1. Find all role IDs that have this roleType tag
  const roles = await Role.find({ roleTypes: String(roleType) }).select("_id").lean();
  if (roles.length === 0) return [];

  const roleIds = roles.map((r) => r._id.toString());

  // 2. Find all active users whose role array includes any of those role IDs
  const users = await User.find({
    role: { $in: roleIds },
    isActive: true,
    deletedAt: null,
  })
    .select("_id")
    .lean();

  return users.map((u) => u._id.toString());
};

/**
 * Resolve team leader user IDs for a given teamId.
 *
 * @param {string} teamId
 * @returns {Promise<string[]>}
 */
const getTeamLeaderIds = async (teamId) => {
  const team = await Team.findById(teamId).select("leaders").lean();
  if (!team || !Array.isArray(team.leaders)) return [];
  return team.leaders.map((id) => id.toString());
};

// ---------------------------------------------------------------------------
// Core: create notifications, persist, and push via WebSocket
// ---------------------------------------------------------------------------

/**
 * Create notification documents for a list of recipients, persist to the
 * database, and push each notification to connected WebSocket clients in
 * real time.
 *
 * @param {object} opts
 * @param {string[]}  opts.recipientIds – user IDs to notify
 * @param {string}    opts.type         – NOTIFICATION_TYPES value
 * @param {string}    opts.title        – short notification title
 * @param {string}    [opts.message]    – longer body text
 * @param {string}    opts.roleType     – admin | qmr | auditor | teamLeader
 * @param {object}    [opts.entity]     – { kind, id }
 * @param {object}    [opts.actor]      – { id, name }
 */
const createNotifications = async ({
  recipientIds,
  type,
  title,
  message = "",
  roleType,
  entity = {},
  actor = {},
}) => {
  if (!recipientIds || recipientIds.length === 0) return;

  // De-duplicate
  const uniqueIds = [...new Set(recipientIds.map(String))];

  const docs = uniqueIds.map((uid) => ({
    recipient: uid,
    type,
    title,
    message,
    roleType,
    entity,
    actor,
  }));

  const saved = await Notification.insertMany(docs);

  // Push each notification to the recipient via WebSocket
  for (const notif of saved) {
    sendToUsers([notif.recipient.toString()], {
      type: "NOTIFICATION",
      payload: notif.toObject(),
    });
  }
};

// ---------------------------------------------------------------------------
// Notification trigger helpers – called from controllers
// ---------------------------------------------------------------------------

// ----- Admin notifications (all audit schedule actions) ---------------------

const notifyAdmins = async ({ type, title, message, entity, actor }) => {
  const adminIds = await getUserIdsByRoleType("admin");
  // Exclude the actor so they don't get notified of their own action
  const recipients = adminIds.filter((id) => id !== actor?.id?.toString());
  await createNotifications({
    recipientIds: recipients,
    type,
    title,
    message,
    roleType: "admin",
    entity,
    actor,
  });
};

// ----- QMR notifications ---------------------------------------------------

/**
 * Notify all QMRs when an auditor sets a final verdict.
 */
const notifyQmrVerdictSet = async ({ scheduleTitle, orgTeamName, verdict, entity, actor }) => {
  const qmrIds = await getUserIdsByRoleType("qmr");
  const recipients = qmrIds.filter((id) => id !== actor?.id?.toString());
  await createNotifications({
    recipientIds: recipients,
    type: NOTIFICATION_TYPES.QMR_VERDICT_SET,
    title: "Audit Verdict Set",
    message: `${actorName(actor)} set the verdict for ${orgTeamName} to "${verdict}" in schedule "${scheduleTitle}".`,
    roleType: "qmr",
    entity,
    actor: { id: actor?.id, name: actorName(actor) },
  });
};

// ----- Auditor notifications -----------------------------------------------

/**
 * Notify specific auditors when they are assigned to an organization.
 */
const notifyAuditorsAssigned = async ({ auditorIds, scheduleTitle, orgTeamName, entity, actor }) => {
  await createNotifications({
    recipientIds: auditorIds,
    type: NOTIFICATION_TYPES.AUDITOR_ASSIGNED_TO_ORG,
    title: "Assigned as Auditor",
    message: `You have been assigned as an auditor for ${orgTeamName} in schedule "${scheduleTitle}".`,
    roleType: "auditor",
    entity,
    actor: { id: actor?.id, name: actorName(actor) },
  });
};

/**
 * Notify specific auditors when they are removed from an organization.
 */
const notifyAuditorsRemoved = async ({ auditorIds, scheduleTitle, orgTeamName, entity, actor }) => {
  await createNotifications({
    recipientIds: auditorIds,
    type: NOTIFICATION_TYPES.AUDITOR_REMOVED_FROM_ORG,
    title: "Removed as Auditor",
    message: `You have been removed as an auditor for ${orgTeamName} in schedule "${scheduleTitle}".`,
    roleType: "auditor",
    entity,
    actor: { id: actor?.id, name: actorName(actor) },
  });
};

/**
 * Notify auditors of an organization when a team leader submits an action plan.
 */
const notifyAuditorsActionPlan = async ({ auditorIds, scheduleTitle, orgTeamName, entity, actor }) => {
  const recipients = auditorIds.filter((id) => id !== actor?.id?.toString());
  await createNotifications({
    recipientIds: recipients,
    type: NOTIFICATION_TYPES.AUDITOR_ACTION_PLAN_SUBMITTED,
    title: "Action Plan Submitted",
    message: `${actorName(actor)} submitted an action plan for ${orgTeamName} in schedule "${scheduleTitle}".`,
    roleType: "auditor",
    entity,
    actor: { id: actor?.id, name: actorName(actor) },
  });
};

/**
 * Notify all auditors (who are assigned to any org in the schedule) when an
 * audit schedule is closed.
 */
const notifyAuditorsScheduleClosed = async ({ auditorIds, scheduleTitle, entity, actor }) => {
  const recipients = auditorIds.filter((id) => id !== actor?.id?.toString());
  await createNotifications({
    recipientIds: recipients,
    type: NOTIFICATION_TYPES.AUDITOR_SCHEDULE_CLOSED,
    title: "Audit Schedule Closed",
    message: `The audit schedule "${scheduleTitle}" has been closed by ${actorName(actor)}.`,
    roleType: "auditor",
    entity,
    actor: { id: actor?.id, name: actorName(actor) },
  });
};

// ----- Team Leader notifications -------------------------------------------

/**
 * Notify team leaders when their team is added as an organization.
 */
const notifyTeamLeadersOrgAdded = async ({ teamId, scheduleTitle, orgTeamName, entity, actor }) => {
  const leaderIds = await getTeamLeaderIds(teamId);
  const recipients = leaderIds.filter((id) => id !== actor?.id?.toString());
  await createNotifications({
    recipientIds: recipients,
    type: NOTIFICATION_TYPES.TEAM_ADDED_AS_ORG,
    title: "Team Added to Audit Schedule",
    message: `Your team "${orgTeamName}" has been added as an organization in schedule "${scheduleTitle}".`,
    roleType: "teamLeader",
    entity,
    actor: { id: actor?.id, name: actorName(actor) },
  });
};

/**
 * Notify team leaders when an auditor adds a Minor or Major NC finding.
 */
const notifyTeamLeadersNCFinding = async ({
  teamId,
  scheduleTitle,
  orgTeamName,
  findingType,
  entity,
  actor,
}) => {
  const leaderIds = await getTeamLeaderIds(teamId);
  const recipients = leaderIds.filter((id) => id !== actor?.id?.toString());
  await createNotifications({
    recipientIds: recipients,
    type: NOTIFICATION_TYPES.TEAM_NC_FINDING_ADDED,
    title: `${findingType} Non-Conformity Finding`,
    message: `A ${findingType} Non-Conformity finding has been added for your team "${orgTeamName}" in schedule "${scheduleTitle}".`,
    roleType: "teamLeader",
    entity,
    actor: { id: actor?.id, name: actorName(actor) },
  });
};

/**
 * Notify team leaders when an audit schedule is closed.
 */
const notifyTeamLeadersScheduleClosed = async ({ teamIds, scheduleTitle, entity, actor }) => {
  const allLeaderIds = [];
  for (const tid of teamIds) {
    const ids = await getTeamLeaderIds(tid);
    allLeaderIds.push(...ids);
  }
  const recipients = [...new Set(allLeaderIds)].filter(
    (id) => id !== actor?.id?.toString(),
  );
  await createNotifications({
    recipientIds: recipients,
    type: NOTIFICATION_TYPES.TEAM_SCHEDULE_CLOSED,
    title: "Audit Schedule Closed",
    message: `The audit schedule "${scheduleTitle}" has been closed.`,
    roleType: "teamLeader",
    entity,
    actor: { id: actor?.id, name: actorName(actor) },
  });
};

export {
  actorName,
  getUserIdsByRoleType,
  getTeamLeaderIds,
  createNotifications,
  notifyAdmins,
  notifyQmrVerdictSet,
  notifyAuditorsAssigned,
  notifyAuditorsRemoved,
  notifyAuditorsActionPlan,
  notifyAuditorsScheduleClosed,
  notifyTeamLeadersOrgAdded,
  notifyTeamLeadersNCFinding,
  notifyTeamLeadersScheduleClosed,
  NOTIFICATION_TYPES,
};
