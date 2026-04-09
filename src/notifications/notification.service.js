import { Notification } from "./notification.model.js";
import { User } from "../users/user.model.js";
import { Role } from "../roles/role.model.js";
import { Team } from "../teams/team.model.js";
import { Org } from "../audit/schedule/organization/org.model.js";

// Socket.io server instance — set once from websocket.js
let io = null;

export const setIo = (ioInstance) => {
  io = ioInstance;
};

// ──────────────────────────────────────────────────────────────
// Recipient resolution helpers
// ──────────────────────────────────────────────────────────────

/**
 * Return active user IDs whose roles include the given roleType tag.
 */
const getUsersByRoleType = async (roleType) => {
  const roles = await Role.find({ roleTypes: roleType }).select("_id").lean();
  if (roles.length === 0) return [];

  const roleIds = roles.map((r) => r._id);
  const roleIdStrings = roleIds.map((r) => r.toString());

  const users = await User.find({
    deletedAt: null,
    isActive: true,
    $or: [
      { role: { $in: roleIds } },
      { role: { $in: roleIdStrings } },
      { role: { $elemMatch: { $in: roleIds } } },
      { role: { $elemMatch: { $in: roleIdStrings } } },
    ],
  })
    .select("_id")
    .lean();

  return users.map((u) => u._id.toString());
};

/**
 * Return leader user IDs for a given team.
 */
const getTeamLeaderUserIds = async (teamId) => {
  const team = await Team.findById(teamId).select("leaders").lean();
  if (!team || !Array.isArray(team.leaders)) return [];
  return team.leaders.map((id) => id.toString());
};

/**
 * Return all auditor user IDs across every org in a schedule.
 */
const getScheduleAuditorIds = async (scheduleId) => {
  const orgs = await Org.find({
    auditScheduleId: scheduleId,
    deletedAt: null,
  })
    .select("auditors")
    .lean();

  const ids = new Set();
  for (const org of orgs) {
    extractAuditorIds(org.auditors).forEach((id) => ids.add(id));
  }
  return [...ids];
};

/**
 * Return team-leader user IDs for every team in a schedule's orgs.
 */
const getScheduleTeamLeaderIds = async (scheduleId) => {
  const orgs = await Org.find({
    auditScheduleId: scheduleId,
    deletedAt: null,
  })
    .select("team")
    .lean();

  const teamIds = orgs.map((o) => o.team).filter(Boolean);
  if (teamIds.length === 0) return [];

  const teams = await Team.find({ _id: { $in: teamIds } })
    .select("leaders")
    .lean();

  const ids = new Set();
  teams.forEach((t) => {
    if (Array.isArray(t.leaders)) {
      t.leaders.forEach((id) => ids.add(id.toString()));
    }
  });
  return [...ids];
};

/**
 * Safely extract a user-ID string from a value that may be a plain string,
 * a Mongoose ObjectId, or an object with `id` / `_id`.
 */
const toIdString = (a) => {
  if (!a) return null;
  if (typeof a === "string") return a;
  // Mongoose ObjectId — use toHexString before checking .id (which is a Buffer)
  if (typeof a.toHexString === "function") return a.toHexString();
  if (typeof a === "object") {
    if (typeof a.id === "string") return a.id;
    if (a._id) {
      return typeof a._id.toHexString === "function"
        ? a._id.toHexString()
        : a._id.toString();
    }
  }
  return null;
};

/**
 * Extract user IDs from an org's auditors field (handles array, object, ObjectIds).
 */
export const extractAuditorIds = (auditors) => {
  const ids = [];
  if (!auditors) return ids;

  const items = Array.isArray(auditors) ? auditors : Object.values(auditors);
  for (const a of items) {
    const id = toIdString(a);
    if (id) ids.push(id);
  }
  return ids;
};

// ──────────────────────────────────────────────────────────────
// Core: persist + broadcast
// ──────────────────────────────────────────────────────────────

const createAndBroadcast = async (
  recipientIds,
  { type, title, message, data },
  excludeUserId,
) => {
  let uniqueIds = [...new Set(recipientIds.filter(Boolean))];

  // Exclude the actor so they don't receive their own notification
  if (excludeUserId) {
    const excludeStr = excludeUserId.toString();
    uniqueIds = uniqueIds.filter((id) => id !== excludeStr);
  }

  if (uniqueIds.length === 0) return [];

  const docs = uniqueIds.map((recipientId) => ({
    recipient: recipientId,
    type,
    title,
    message: message || "",
    data: data || {},
  }));

  const created = await Notification.insertMany(docs);

  // Broadcast through Socket.io
  if (io) {
    for (const notif of created) {
      io.to(`user:${notif.recipient.toString()}`).emit("notification", notif);
    }
  }

  return created;
};

// ──────────────────────────────────────────────────────────────
// Public trigger functions — each is fire-and-forget safe
// ──────────────────────────────────────────────────────────────

export const notifyScheduleCreated = async (schedule, actorId, actorName) => {
  try {
    const adminIds = await getUsersByRoleType("admin");
    await createAndBroadcast(
      adminIds,
      {
        type: "SCHEDULE_CREATED",
        title: "Audit Schedule Created",
        message: `${actorName} created audit schedule "${schedule.title}".`,
        data: { scheduleId: schedule._id, scheduleTitle: schedule.title },
      },
      actorId,
    );
  } catch (err) {
    console.error("[Notification] notifyScheduleCreated error:", err.message);
  }
};

export const notifyScheduleUpdated = async (schedule, actorId, actorName) => {
  try {
    const adminIds = await getUsersByRoleType("admin");
    await createAndBroadcast(
      adminIds,
      {
        type: "SCHEDULE_UPDATED",
        title: "Audit Schedule Updated",
        message: `${actorName} updated audit schedule "${schedule.title}".`,
        data: { scheduleId: schedule._id, scheduleTitle: schedule.title },
      },
      actorId,
    );
  } catch (err) {
    console.error("[Notification] notifyScheduleUpdated error:", err.message);
  }
};

export const notifyScheduleClosed = async (schedule, actorId, actorName) => {
  try {
    const scheduleId = schedule._id;
    const adminIds = await getUsersByRoleType("admin");
    const auditorIds = await getScheduleAuditorIds(scheduleId);
    const teamLeaderIds = await getScheduleTeamLeaderIds(scheduleId);

    const allRecipients = [...adminIds, ...auditorIds, ...teamLeaderIds];

    await createAndBroadcast(
      allRecipients,
      {
        type: "SCHEDULE_CLOSED",
        title: "Audit Schedule Closed",
        message: `${actorName} closed audit schedule "${schedule.title}".`,
        data: { scheduleId, scheduleTitle: schedule.title },
      },
      actorId,
    );
  } catch (err) {
    console.error("[Notification] notifyScheduleClosed error:", err.message);
  }
};

export const notifyScheduleDeleted = async (schedule, actorId, actorName) => {
  try {
    const adminIds = await getUsersByRoleType("admin");
    await createAndBroadcast(
      adminIds,
      {
        type: "SCHEDULE_DELETED",
        title: "Audit Schedule Deleted",
        message: `${actorName} deleted audit schedule "${schedule.title}".`,
        data: { scheduleId: schedule._id, scheduleTitle: schedule.title },
      },
      actorId,
    );
  } catch (err) {
    console.error("[Notification] notifyScheduleDeleted error:", err.message);
  }
};

export const notifyOrganizationAdded = async (
  org,
  teamName,
  scheduleName,
  actorId,
  actorName,
) => {
  try {
    const adminIds = await getUsersByRoleType("admin");
    await createAndBroadcast(
      adminIds,
      {
        type: "ORGANIZATION_ADDED",
        title: "Organization Added to Audit",
        message: `${actorName} added "${teamName}" as an organization in "${scheduleName}".`,
        data: {
          orgId: org._id,
          teamId: org.team,
          teamName,
          scheduleId: org.auditScheduleId,
        },
      },
      actorId,
    );

    // Team leaders of the added team get a dedicated notification
    const leaderIds = await getTeamLeaderUserIds(org.team);
    if (leaderIds.length > 0) {
      await createAndBroadcast(
        leaderIds,
        {
          type: "TEAM_ADDED_AS_ORG",
          title: "Your Team Added to Audit",
          message: `Your team "${teamName}" has been added as an organization in "${scheduleName}".`,
          data: {
            orgId: org._id,
            teamId: org.team,
            teamName,
            scheduleId: org.auditScheduleId,
          },
        },
        actorId,
      );
    }
  } catch (err) {
    console.error("[Notification] notifyOrganizationAdded error:", err.message);
  }
};

export const notifyOrganizationDeleted = async (org, actorId, actorName) => {
  try {
    const adminIds = await getUsersByRoleType("admin");
    await createAndBroadcast(
      adminIds,
      {
        type: "ORGANIZATION_DELETED",
        title: "Organization Removed from Audit",
        message: `${actorName} removed an organization from the audit schedule.`,
        data: { orgId: org._id, scheduleId: org.auditScheduleId },
      },
      actorId,
    );
  } catch (err) {
    console.error(
      "[Notification] notifyOrganizationDeleted error:",
      err.message,
    );
  }
};

export const notifyAuditorAssigned = async (
  userIds,
  orgTeamName,
  scheduleName,
  actorId,
  actorName,
) => {
  try {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    await createAndBroadcast(
      ids,
      {
        type: "AUDITOR_ASSIGNED",
        title: "Assigned as Auditor",
        message: `${actorName} assigned you as auditor for "${orgTeamName}" in "${scheduleName}".`,
        data: { teamName: orgTeamName },
      },
      actorId,
    );
  } catch (err) {
    console.error("[Notification] notifyAuditorAssigned error:", err.message);
  }
};

export const notifyAuditorRemoved = async (
  userIds,
  orgTeamName,
  scheduleName,
  actorId,
  actorName,
) => {
  try {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    await createAndBroadcast(
      ids,
      {
        type: "AUDITOR_REMOVED",
        title: "Removed as Auditor",
        message: `${actorName} removed you as auditor for "${orgTeamName}" in "${scheduleName}".`,
        data: { teamName: orgTeamName },
      },
      actorId,
    );
  } catch (err) {
    console.error("[Notification] notifyAuditorRemoved error:", err.message);
  }
};

export const notifyVerdictSet = async (
  org,
  teamName,
  scheduleName,
  actorId,
  actorName,
) => {
  try {
    const qmrIds = await getUsersByRoleType("qmr");
    await createAndBroadcast(
      qmrIds,
      {
        type: "VERDICT_SET",
        title: "Final Verdict Set",
        message: `${actorName} set the final verdict for "${teamName}" in "${scheduleName}" to "${org.verdict}".`,
        data: {
          orgId: org._id,
          teamId: org.team,
          verdict: org.verdict,
          scheduleId: org.auditScheduleId,
        },
      },
      actorId,
    );
  } catch (err) {
    console.error("[Notification] notifyVerdictSet error:", err.message);
  }
};

export const notifyFindingAdded = async (
  org,
  teamName,
  scheduleName,
  newFindings,
  actorId,
  actorName,
) => {
  try {
    // Admins get notified for all findings
    const adminIds = await getUsersByRoleType("admin");
    await createAndBroadcast(
      adminIds,
      {
        type: "FINDING_ADDED",
        title: "Finding Added",
        message: `${actorName} added ${newFindings.length} finding(s) for "${teamName}" in "${scheduleName}".`,
        data: {
          orgId: org._id,
          teamId: org.team,
          teamName,
          scheduleId: org.auditScheduleId,
          findingsCount: newFindings.length,
        },
      },
      actorId,
    );

    // Team leaders get notified only for Minor / Major NC findings
    const ncFindings = newFindings.filter(
      (f) => f.compliance === "MAJOR_NC" || f.compliance === "MINOR_NC",
    );
    if (ncFindings.length > 0) {
      const leaderIds = await getTeamLeaderUserIds(org.team);
      if (leaderIds.length > 0) {
        const ncLabels = ncFindings.map((f) =>
          f.compliance === "MAJOR_NC" ? "Major" : "Minor",
        );
        const unique = [...new Set(ncLabels)].join(" & ");
        await createAndBroadcast(
          leaderIds,
          {
            type: "FINDING_NC_ADDED",
            title: "Non-Conformity Finding Added",
            message: `${actorName} added ${unique} Non-Conformity finding(s) for your team "${teamName}" in "${scheduleName}".`,
            data: {
              orgId: org._id,
              teamId: org.team,
              teamName,
              scheduleId: org.auditScheduleId,
              ncCount: ncFindings.length,
            },
          },
          actorId,
        );
      }
    }
  } catch (err) {
    console.error("[Notification] notifyFindingAdded error:", err.message);
  }
};

export const notifyActionPlanSubmitted = async (
  org,
  teamName,
  scheduleName,
  findings,
  actorId,
  actorName,
) => {
  try {
    const auditorIds = extractAuditorIds(org.auditors);
    if (auditorIds.length > 0) {
      const count = findings.length;
      const labels = findings.map((f) =>
        f.compliance === "MAJOR_NC" ? "Major NC" : "Minor NC",
      );
      const unique = [...new Set(labels)].join(" & ");
      await createAndBroadcast(
        auditorIds,
        {
          type: "ACTION_PLAN_SUBMITTED",
          title: "Action Plan Submitted",
          message: `${actorName} submitted ${count} action plan(s) for ${unique} finding(s) in "${teamName}" (${scheduleName}).`,
          data: {
            orgId: org._id,
            teamId: org.team,
            teamName,
            scheduleId: org.auditScheduleId,
            count,
          },
        },
        actorId,
      );
    }
  } catch (err) {
    console.error(
      "[Notification] notifyActionPlanSubmitted error:",
      err.message,
    );
  }
};

export const notifyFindingVerified = async (
  org,
  teamName,
  scheduleName,
  findings,
  actorId,
  actorName,
) => {
  try {
    const leaderIds = await getTeamLeaderUserIds(org.team);
    if (leaderIds.length === 0) return;

    const count = findings.length;
    const labels = findings.map((f) =>
      f.compliance === "MAJOR_NC" ? "Major NC" : "Minor NC",
    );
    const unique = [...new Set(labels)].join(" & ");
    await createAndBroadcast(
      leaderIds,
      {
        type: "FINDING_VERIFIED",
        title: "Action Plan Verified",
        message: `${actorName} verified ${count} action plan(s) for ${unique} finding(s) in "${teamName}" (${scheduleName}).`,
        data: {
          orgId: org._id,
          teamId: org.team,
          teamName,
          scheduleId: org.auditScheduleId,
          count,
        },
      },
      actorId,
    );
  } catch (err) {
    console.error("[Notification] notifyFindingVerified error:", err.message);
  }
};

// ──────────────────────────────────────────────────────────────
// Diff helpers — used by org controller to detect changes
// ──────────────────────────────────────────────────────────────

/**
 * Compare old and new visits **by position** (visit index × finding index)
 * to distinguish between:
 *  - newFindings   — findings appended at indices that did not exist before
 *  - actionPlans   — NC findings whose `corrected` changed 0 → 1
 *  - verifications  — NC findings whose `corrected` changed 1 → 2
 *
 * Position-based comparison avoids the JSON.stringify pitfall where a
 * field change (e.g. adding an action plan) would look like a "new finding".
 */
export const diffVisitChanges = (oldVisits, newVisits) => {
  const result = {
    newFindings: [],
    actionPlans: [],
    verifications: [],
  };

  if (!Array.isArray(newVisits)) return result;
  const safeOld = Array.isArray(oldVisits) ? oldVisits : [];

  for (let vi = 0; vi < newVisits.length; vi++) {
    const oldFindings = safeOld[vi]?.findings || [];
    const newFindings = newVisits[vi]?.findings || [];

    for (let fi = 0; fi < newFindings.length; fi++) {
      const newF = newFindings[fi];
      if (!newF) continue;

      // Index beyond old array → truly new finding
      if (fi >= oldFindings.length || !oldFindings[fi]) {
        result.newFindings.push(newF);
        continue;
      }

      // Existing finding — check corrected transitions for NC findings
      const oldF = oldFindings[fi];
      const isNC =
        newF.compliance === "MAJOR_NC" || newF.compliance === "MINOR_NC";
      if (!isNC) continue;

      const oldCorrected = oldF.corrected ?? 0;
      const newCorrected = newF.corrected ?? 0;

      // Action plan submitted (corrected 0 → 1)
      if (oldCorrected === 0 && newCorrected === 1) {
        result.actionPlans.push(newF);
      }
      // Auditor verified the action plan (corrected 1 → 2)
      if (oldCorrected === 1 && newCorrected === 2) {
        result.verifications.push(newF);
      }
    }
  }

  return result;
};
