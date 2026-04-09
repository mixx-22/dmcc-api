import { Org } from "./org.model.js";
import { Schedule } from "../schedule.model.js";
import { Team } from "../../../teams/team.model.js";
import { User } from "../../../users/user.model.js";
import { Document } from "../../../documents/document.model.js";
import mongoose from "mongoose";
import {
  notifyAdmins,
  notifyQmrVerdictSet,
  notifyAuditorsAssigned,
  notifyAuditorsRemoved,
  notifyAuditorsActionPlan,
  notifyTeamLeadersOrgAdded,
  notifyTeamLeadersNCFinding,
  actorName,
  NOTIFICATION_TYPES,
} from "../../../notifications/notification.service.js";

/**
 * Extract a flat array of auditor ID strings from the Mixed auditors field.
 */
const extractAuditorIds = (auditors) => {
  if (!auditors) return [];
  let raw = [];
  if (Array.isArray(auditors)) {
    raw = auditors.map((a) => (typeof a === "object" && a.id ? a.id : a));
  } else if (typeof auditors === "object") {
    raw = Object.values(auditors).map((a) =>
      typeof a === "object" && a.id ? a.id : a,
    );
  }
  return raw.filter((id) => id && mongoose.Types.ObjectId.isValid(id)).map(String);
};

const postOrganization = async (req, res) => {
  try {
    const {
      auditScheduleId,
      team,
      status,
      auditors,
      documents,
      visits,
      verdict,
    } = req.body;

    if (!auditScheduleId) {
      return res
        .status(400)
        .json({ message: "Audit Schedule ID is required." });
    }

    if (!team) {
      return res.status(400).json({ message: "Team ID is required." });
    }

    const orgData = {
      auditScheduleId,
      team,
      status,
      auditors,
      documents,
      visits,
      verdict,
    };

    const newOrg = await Org.create(orgData);

    // Update Schedule's organizations field with the new org ID
    const schedule = await Schedule.findById(auditScheduleId);
    if (schedule) {
      // Initialize organizations if it's not an object
      if (
        !schedule.organizations ||
        typeof schedule.organizations !== "object"
      ) {
        schedule.organizations = {};
      }

      // Add the new organization ID to the organizations object
      // Using team as key and org ID as value
      schedule.organizations[team.toString()] = newOrg._id.toString();
      schedule.markModified("organizations");
      await schedule.save();
    }

    // --- Notifications (fire-and-forget) ---
    const userId = req.user?._id || req.user?.id;
    const actorInfo = { id: userId, name: actorName(req.user) };
    const entityInfo = { kind: "Organization", id: newOrg._id };

    // Resolve team name for notification messages
    const teamDoc = await Team.findById(team).select("name").lean();
    const teamName = teamDoc?.name || "Unknown Team";
    const scheduleTitle = schedule?.title || "Audit Schedule";

    // Notify admins
    notifyAdmins({
      type: NOTIFICATION_TYPES.ORGANIZATION_ADDED,
      title: "Organization Added",
      message: `Team "${teamName}" has been added as an organization in schedule "${scheduleTitle}" by ${actorInfo.name}.`,
      entity: entityInfo,
      actor: actorInfo,
    }).catch((err) => console.error("[notify] ORGANIZATION_ADDED admin error:", err.message));

    // Notify team leaders of the team
    notifyTeamLeadersOrgAdded({
      teamId: team,
      scheduleTitle,
      orgTeamName: teamName,
      entity: entityInfo,
      actor: actorInfo,
    }).catch((err) => console.error("[notify] TEAM_ADDED_AS_ORG error:", err.message));

    return res.status(201).json({
      success: true,
      message: "Organization created successfully.",
      organization: newOrg,
    });
  } catch (error) {
    console.error("Error in postOrganization:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create organization",
      error: error.message,
    });
  }
};

const getAllOrganization = async (req, res) => {
  try {
    // pagination
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const maxLimit = 100;
    let limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    if (limit > maxLimit) limit = maxLimit;

    const filter = { deletedAt: null };

    // Filter by auditScheduleId if provided
    if (req.query.auditScheduleId) {
      filter.auditScheduleId = req.query.auditScheduleId;
    }

    // Filter by team if provided
    if (req.query.teamId || req.query.team) {
      filter.team = req.query.teamId || req.query.team;
    }

    // Filter by status if provided
    if (req.query.status !== undefined) {
      filter.status = parseInt(req.query.status, 10);
    }

    const total = await Org.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const data = await Org.find(filter)
      .populate("auditScheduleId", "title")
      .populate(
        "team",
        "name description folderId folderTitle objectives updatedAt leaders",
      )
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    // Transform team data to include id field
    const transformedData = await Promise.all(
      data.map(async (org) => {
        const orgObj = org.toObject();

        // Transform team data
        if (orgObj.team && orgObj.team._id) {
          let leadersData = [];

          if (Array.isArray(orgObj.team.leaders)) {
            const leaderIds = orgObj.team.leaders.filter((id) =>
              mongoose.Types.ObjectId.isValid(id),
            );

            if (leaderIds.length > 0) {
              const leaders = await User.find({
                _id: { $in: leaderIds },
                deletedAt: null,
              }).select("firstName lastName fullname fullName name employeeId");

              leadersData = leaders.map((user) => {
                const firstName = user.firstName || "";
                const lastName = user.lastName || "";
                const name = `${firstName} ${lastName}`.trim();

                return {
                  id: user._id.toString(),
                  name:
                    name || user.fullname || user.fullName || user.name || "",
                  employeeId: user.employeeId || "",
                };
              });
            }
          }

          orgObj.team = {
            id: orgObj.team._id.toString(),
            name: orgObj.team.name || "",
            description: orgObj.team.description || "",
            folderId: orgObj.team.folderId || "",
            folderTitle: orgObj.team.folderTitle || "",
            objectives: orgObj.team.objectives || [],
            updatedAt: orgObj.team.updatedAt || "",
            leadersData,
          };
        }

        // Transform auditors data
        let auditorsData = [];
        if (orgObj.auditors) {
          let auditorIds = [];

          if (Array.isArray(orgObj.auditors)) {
            auditorIds = orgObj.auditors
              .map((auditor) =>
                typeof auditor === "object" && auditor.id
                  ? auditor.id
                  : auditor,
              )
              .filter((id) => id && mongoose.Types.ObjectId.isValid(id));
          } else if (typeof orgObj.auditors === "object") {
            auditorIds = Object.values(orgObj.auditors)
              .map((auditor) =>
                typeof auditor === "object" && auditor.id
                  ? auditor.id
                  : auditor,
              )
              .filter((id) => id && mongoose.Types.ObjectId.isValid(id));
          }

          if (auditorIds.length > 0) {
            const auditors = await User.find({
              _id: { $in: auditorIds },
              deletedAt: null,
            }).select("firstName lastName fullname fullName name employeeId");

            auditorsData = auditors.map((user) => {
              const firstName = user.firstName || "";
              const lastName = user.lastName || "";
              const name = `${firstName} ${lastName}`.trim();

              return {
                id: user._id.toString(),
                name: name || user.fullname || user.fullName || user.name || "",
                employeeId: user.employeeId || "",
              };
            });
          }
        }
        orgObj.auditors = auditorsData;

        return orgObj;
      }),
    );

    return res.status(200).json({
      success: true,
      message: "Organizations retrieved successfully",
      data: transformedData,
      meta: { total, page, limit, totalPages },
    });
  } catch (error) {
    console.error("Error in getAllOrganization:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve organizations",
      error: error.message,
    });
  }
};

const getOrganization = async (req, res) => {
  try {
    const org = await Org.findById(req.params.id);

    if (!org || org.deletedAt) {
      return res.status(404).json({ message: "Organization not found." });
    }

    const orgObj = org.toObject ? org.toObject() : { ...org };

    // Populate AuditScheduleData
    let auditScheduleData = null;
    if (orgObj.auditScheduleId) {
      const schedule = await Schedule.findById(orgObj.auditScheduleId);
      if (schedule) {
        auditScheduleData = {
          id: schedule._id.toString(),
          title: schedule.title,
        };
      }
    }

    // Populate team with id and name
    if (orgObj.team) {
      const team = await Team.findById(orgObj.team);
      if (team) {
        let leadersData = [];

        if (Array.isArray(team.leaders) && team.leaders.length > 0) {
          const leaderIds = team.leaders.filter((id) =>
            mongoose.Types.ObjectId.isValid(id),
          );

          if (leaderIds.length > 0) {
            const leaders = await User.find({
              _id: { $in: leaderIds },
              deletedAt: null,
            }).select("firstName lastName fullname fullName name employeeId");

            leadersData = leaders.map((user) => {
              const firstName = user.firstName || "";
              const lastName = user.lastName || "";
              const name = `${firstName} ${lastName}`.trim();

              return {
                id: user._id.toString(),
                employeeId: user.employeeId || "",
                name: name || user.fullname || user.fullName || user.name || "",
              };
            });
          }
        }

        orgObj.team = {
          id: team._id.toString(),
          name: team.name || "",
          description: team.description || "",
          folderId: team.folderId || "",
          folderTitle: team.folderTitle || "",
          objectives: team.objectives || [],
          updatedAt: team.updatedAt || "",
          leadersData,
        };
      }
    }

    // Populate auditorsData
    let auditorsData = [];
    if (orgObj.auditors) {
      // Assuming auditors is an object/array containing user IDs
      let auditorIds = [];

      if (Array.isArray(orgObj.auditors)) {
        auditorIds = orgObj.auditors;
      } else if (typeof orgObj.auditors === "object") {
        // If it's an object, try to extract IDs
        auditorIds = Object.values(orgObj.auditors).filter(
          (id) => id && mongoose.Types.ObjectId.isValid(id),
        );
      }

      if (auditorIds.length > 0) {
        const auditors = await User.find({
          _id: { $in: auditorIds },
          deletedAt: null,
        }).select("firstName lastName fullname fullName name employeeId");

        auditorsData = auditors.map((user) => {
          const firstName = user.firstName || "";
          const lastName = user.lastName || "";
          const name = `${firstName} ${lastName}`.trim();

          return {
            id: user._id.toString(),
            name: name || user.fullname || user.fullName || user.name || "",
            employeeId: user.employeeId || "",
          };
        });
      }
    }

    orgObj.auditors = auditorsData;

    // Populate documentsData
    let documentsData = [];
    if (orgObj.documents) {
      // Assuming documents is an object/array containing document IDs
      let documentIds = [];

      if (Array.isArray(orgObj.documents)) {
        documentIds = orgObj.documents;
      } else if (typeof orgObj.documents === "object") {
        // If it's an object, try to extract IDs
        documentIds = Object.values(orgObj.documents).filter(
          (id) => id && mongoose.Types.ObjectId.isValid(id),
        );
      }

      if (documentIds.length > 0) {
        const documents = await Document.find({
          _id: { $in: documentIds },
          deletedAt: null,
        }).select("title");

        documentsData = documents.map((doc) => ({
          id: doc._id.toString(),
          title: doc.title,
        }));
      }
    }

    orgObj.auditScheduleData = auditScheduleData;
    orgObj.documentsData = documentsData;

    return res.status(200).json({
      success: true,
      message: "Organization retrieved successfully",
      data: orgObj,
    });
  } catch (error) {
    console.error("Error in getOrganization:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve organization",
      error: error.message,
    });
  }
};

const putOrganization = async (req, res) => {
  try {
    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: "No data provided for update." });
    }

    const org = await Org.findById(req.params.id);
    if (!org || org.deletedAt) {
      return res.status(404).json({ message: "Organization not found." });
    }

    // Capture previous state for diff-based notifications
    const prevAuditorIds = extractAuditorIds(org.auditors);
    const prevVisitCount = Array.isArray(org.visits) ? org.visits.length : 0;
    const prevVerdict = org.verdict || "";

    const {
      auditScheduleId,
      team,
      status,
      auditors,
      documents,
      visits,
      verdict,
    } = req.body;

    if (auditScheduleId !== undefined) org.auditScheduleId = auditScheduleId;
    if (team !== undefined) {
      // Extract team ID if team is an object, otherwise use it directly
      org.team = typeof team === "object" && team.id ? team.id : team;
    }
    if (status !== undefined) org.status = status;
    if (auditors !== undefined) {
      org.auditors = auditors;
      org.markModified("auditors");
    }
    if (documents !== undefined) {
      org.documents = documents;
      org.markModified("documents");
    }
    if (visits !== undefined) org.visits = visits;
    if (verdict !== undefined) org.verdict = verdict;

    const saved = await org.save();

    // --- Notifications (fire-and-forget) ---
    (async () => {
      try {
        const userId = req.user?._id || req.user?.id;
        const actorInfo = { id: userId, name: actorName(req.user) };
        const entityInfo = { kind: "Organization", id: saved._id };

        // Resolve context
        const schedule = await Schedule.findById(saved.auditScheduleId).select("title").lean();
        const teamDoc = await Team.findById(saved.team).select("name").lean();
        const scheduleTitle = schedule?.title || "Audit Schedule";
        const teamName = teamDoc?.name || "Unknown Team";

        // 1. Auditor assignment / removal
        if (auditors !== undefined) {
          const newAuditorIds = extractAuditorIds(auditors);
          const added = newAuditorIds.filter((id) => !prevAuditorIds.includes(id));
          const removed = prevAuditorIds.filter((id) => !newAuditorIds.includes(id));

          if (added.length > 0) {
            await notifyAuditorsAssigned({
              auditorIds: added,
              scheduleTitle,
              orgTeamName: teamName,
              entity: entityInfo,
              actor: actorInfo,
            });
            await notifyAdmins({
              type: NOTIFICATION_TYPES.AUDITOR_ASSIGNED,
              title: "Auditor Assigned",
              message: `Auditor(s) assigned to "${teamName}" in schedule "${scheduleTitle}" by ${actorInfo.name}.`,
              entity: entityInfo,
              actor: actorInfo,
            });
          }
          if (removed.length > 0) {
            await notifyAuditorsRemoved({
              auditorIds: removed,
              scheduleTitle,
              orgTeamName: teamName,
              entity: entityInfo,
              actor: actorInfo,
            });
            await notifyAdmins({
              type: NOTIFICATION_TYPES.AUDITOR_REMOVED,
              title: "Auditor Removed",
              message: `Auditor(s) removed from "${teamName}" in schedule "${scheduleTitle}" by ${actorInfo.name}.`,
              entity: entityInfo,
              actor: actorInfo,
            });
          }
        }

        // 2. Verdict set → notify QMRs and admins
        if (verdict !== undefined && verdict && verdict !== prevVerdict) {
          await notifyQmrVerdictSet({
            scheduleTitle,
            orgTeamName: teamName,
            verdict,
            entity: entityInfo,
            actor: actorInfo,
          });
          await notifyAdmins({
            type: NOTIFICATION_TYPES.VERDICT_SET,
            title: "Verdict Set",
            message: `The verdict for "${teamName}" has been set to "${verdict}" in schedule "${scheduleTitle}" by ${actorInfo.name}.`,
            entity: entityInfo,
            actor: actorInfo,
          });
        }

        // 3. Visit / finding changes
        if (visits !== undefined && Array.isArray(visits)) {
          const newVisitCount = visits.length;

          // Check new / updated visits for NC findings and action plans
          for (let i = 0; i < visits.length; i++) {
            const visit = visits[i];
            if (!visit) continue;

            const findings = visit.findings || visit.checklist || [];
            if (!Array.isArray(findings)) continue;

            for (const finding of findings) {
              if (!finding) continue;

              // Detect NC findings (Minor/Major Non-Conformity)
              const findingType = (finding.type || finding.findingType || "").toString();
              const isNC =
                /major/i.test(findingType) || /minor/i.test(findingType);

              if (isNC) {
                const ncType = /major/i.test(findingType) ? "Major" : "Minor";
                await notifyTeamLeadersNCFinding({
                  teamId: saved.team,
                  scheduleTitle,
                  orgTeamName: teamName,
                  findingType: ncType,
                  entity: entityInfo,
                  actor: actorInfo,
                });
                await notifyAdmins({
                  type: NOTIFICATION_TYPES.FINDING_ADDED,
                  title: `${ncType} NC Finding Added`,
                  message: `A ${ncType} Non-Conformity finding was added for "${teamName}" in schedule "${scheduleTitle}" by ${actorInfo.name}.`,
                  entity: entityInfo,
                  actor: actorInfo,
                });
                // Only notify once per update to avoid spam
                break;
              }

              // Detect action plan submission
              const hasActionPlan =
                finding.actionPlan ||
                finding.correctiveAction ||
                finding.action_plan;
              if (hasActionPlan) {
                const currentAuditorIds = extractAuditorIds(saved.auditors);
                if (currentAuditorIds.length > 0) {
                  await notifyAuditorsActionPlan({
                    auditorIds: currentAuditorIds,
                    scheduleTitle,
                    orgTeamName: teamName,
                    entity: entityInfo,
                    actor: actorInfo,
                  });
                  await notifyAdmins({
                    type: NOTIFICATION_TYPES.ACTION_PLAN_SUBMITTED,
                    title: "Action Plan Submitted",
                    message: `An action plan has been submitted for "${teamName}" in schedule "${scheduleTitle}" by ${actorInfo.name}.`,
                    entity: entityInfo,
                    actor: actorInfo,
                  });
                }
                break;
              }
            }
          }

          // Generic visit notification for admins if visits were added
          if (newVisitCount > prevVisitCount) {
            await notifyAdmins({
              type: NOTIFICATION_TYPES.VISIT_ADDED,
              title: "Visit Added",
              message: `A new visit has been added for "${teamName}" in schedule "${scheduleTitle}" by ${actorInfo.name}.`,
              entity: entityInfo,
              actor: actorInfo,
            });
          }
        }

        // 4. Generic org update for admins (if nothing specific above triggered)
        if (
          auditors === undefined &&
          verdict === undefined &&
          visits === undefined
        ) {
          await notifyAdmins({
            type: NOTIFICATION_TYPES.ORGANIZATION_UPDATED,
            title: "Organization Updated",
            message: `Organization "${teamName}" has been updated in schedule "${scheduleTitle}" by ${actorInfo.name}.`,
            entity: entityInfo,
            actor: actorInfo,
          });
        }
      } catch (err) {
        console.error("[notify] putOrganization error:", err.message);
      }
    })();

    return res.status(200).json({
      success: true,
      message: "Organization updated successfully.",
      organization: saved,
    });
  } catch (error) {
    console.error("Error in putOrganization:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update organization",
      error: error.message,
    });
  }
};

const deleteOrganization = async (req, res) => {
  try {
    const org = await Org.findById(req.params.id);

    if (!org || org.deletedAt) {
      return res.status(404).json({ message: "Organization not found." });
    }

    org.deletedAt = new Date();
    await org.save();

    // Notify admins about org deletion
    const userId = req.user?._id || req.user?.id;
    (async () => {
      try {
        const teamDoc = await Team.findById(org.team).select("name").lean();
        const schedule = await Schedule.findById(org.auditScheduleId).select("title").lean();
        const teamName = teamDoc?.name || "Unknown Team";
        const scheduleTitle = schedule?.title || "Audit Schedule";
        await notifyAdmins({
          type: NOTIFICATION_TYPES.ORGANIZATION_DELETED,
          title: "Organization Removed",
          message: `Organization "${teamName}" has been removed from schedule "${scheduleTitle}" by ${actorName(req.user)}.`,
          entity: { kind: "Organization", id: org._id },
          actor: { id: userId, name: actorName(req.user) },
        });
      } catch (err) {
        console.error("[notify] ORGANIZATION_DELETED error:", err.message);
      }
    })();

    return res.status(200).json({
      success: true,
      message: "Organization deleted successfully.",
      organization: org,
    });
  } catch (error) {
    console.error("Error in deleteOrganization:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete organization",
      error: error.message,
    });
  }
};

export {
  postOrganization,
  getAllOrganization,
  getOrganization,
  putOrganization,
  deleteOrganization,
};
