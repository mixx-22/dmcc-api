import { Schedule } from "./schedule.model.js";
import { AuditCodeCounter } from "./auditCodeCounter.model.js";
import { Team } from "../../teams/team.model.js";
import Standard from "./Standard/standard.model.js";
import mongoose from "mongoose";
import {
  notifyScheduleCreated,
  notifyScheduleUpdated,
  notifyScheduleClosed,
  notifyScheduleDeleted,
} from "../../notifications/notification.service.js";

const AUDIT_TYPE_CODES = {
  internal: "INT",
  external: "EXT",
  compliance: "CMP",
  financial: "FIN",
  operational: "OPR",
};

const AUDIT_STATUS_CLOSED = 1;

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Atomically increments the per-type-per-year counter and returns the
 * next audit code.  Using findOneAndUpdate + $inc ensures no two
 * concurrent requests can receive the same sequence number.
 * Deleted audits permanently consume their sequence so the history
 * remains unambiguous.
 */
const generateAuditCode = async (auditType) => {
  const auditTypeValue = (auditType ?? "").toString().trim();
  const auditTypeKey = auditTypeValue.toLowerCase();
  const auditTypeCode = AUDIT_TYPE_CODES[auditTypeKey];

  if (!auditTypeCode) {
    return {
      error:
        "Invalid audit type. Use Internal, External, Compliance, Financial, or Operational.",
    };
  }

  const year = new Date().getFullYear();

  const counter = await AuditCodeCounter.findOneAndUpdate(
    { auditTypeCode, year },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true },
  );

  const sequence = String(counter.sequence).padStart(2, "0");

  return { auditCode: `${auditTypeCode}-${year}-${sequence}` };
};

/**
 * Releases an audit code back to the pool only when no higher
 * sequence has been issued for the same type and year.
 *
 * This covers the case where an audit's type is changed before any
 * subsequent audit of the same type is created:
 *   INT-2025-03 changed to EXT → INT counter goes back to 02 so the
 *   next internal audit gets INT-2025-03 again.
 *
 * If INT-2025-04 already exists the filter won't match and the
 * counter is left unchanged, preserving the full sequence.
 *
 * @param {string} auditCode - The code to release, e.g. "INT-2025-03"
 */
const releaseAuditCode = async (auditCode) => {
  if (!auditCode) return;

  const parts = auditCode.split("-");
  if (parts.length !== 3) return;

  const [typeCode, yearStr, seqStr] = parts;
  const year = parseInt(yearStr, 10);
  const sequence = parseInt(seqStr, 10);

  if (isNaN(year) || isNaN(sequence) || sequence < 1) return;

  // Decrement only when this sequence is still the current maximum
  await AuditCodeCounter.findOneAndUpdate(
    { auditTypeCode: typeCode, year, sequence },
    { $inc: { sequence: -1 } },
  );
};

const postSchedule = async (req, res) => {
  try {
    const {
      title,
      description,
      auditCode,
      auditType,
      standard,
      organizations,
      previousAudit,
      status,
      auditYear,
      auditNumber,
    } = req.body;

    // Get userId from token
    const userId = req.user?.id || req.user?._id;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ message: "Title is required." });
    }

    // Check if there's an ongoing audit of the SAME type (status = 0).
    // Audits of different types may run simultaneously.
    const auditTypeValue = (auditType ?? "").toString().trim();
    const ongoingAudit = await Schedule.findOne({
      auditType: new RegExp(`^${escapeRegExp(auditTypeValue)}$`, "i"),
      status: 0,
      deletedAt: null,
    });

    if (ongoingAudit) {
      return res.status(400).json({
        message: "There's an on-going audit. Cannot create a new schedule.",
        ongoingSchedule: {
          id: ongoingAudit._id,
          title: ongoingAudit.title,
        },
      });
    }

    const { auditCode: generatedAuditCode, error: auditCodeError } =
      await generateAuditCode(auditType);
    if (auditCodeError) {
      return res.status(400).json({ message: auditCodeError });
    }

    const scheduleData = {
      title: title.trim(),
      description,
      auditCode: generatedAuditCode,
      auditType,
      standard,
      organizations,
      previousAudit,
      status,
      auditYear,
      auditNumber,
      owner: userId,
    };

    const newSchedule = await Schedule.create(scheduleData);

    // Notify admins about the new schedule
    const actorName =
      `${req.user?.firstName || ""} ${req.user?.lastName || ""}`.trim() ||
      "System";
    notifyScheduleCreated(newSchedule, userId, actorName);

    res.status(201).json({
      message: "Schedule created successfully.",
      schedule: newSchedule,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};

const getAllSchedule = async (req, res) => {
  try {
    // pagination
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const maxLimit = 100;
    let limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    if (limit > maxLimit) limit = maxLimit;

    // keyword search (title OR description)
    const keyword = (req.query.keyword ?? req.query.q ?? "").toString().trim();
    const filter = { deletedAt: null };
    if (keyword) {
      const re = new RegExp(keyword, "i");
      filter.$or = [
        { title: re },
        { description: re },
        { auditCode: re },
        { auditType: re },
      ];
    }

    // Year filtering
    if (req.query.year) {
      const year = parseInt(req.query.year, 10);
      if (!isNaN(year)) {
        // Filter schedules where date.start year matches
        filter["date.start"] = {
          $gte: new Date(`${year}-01-01T00:00:00.000Z`),
          $lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
        };
      }
    }

    const total = await Schedule.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const data = await Schedule.find(filter)
      .populate({
        path: "owner",
        select:
          "fullname fullName name firstName lastName middleName employeeId",
      })
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Schedules retrieved successfully",
      data,
      meta: { total, page, limit, totalPages },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve schedules",
      error: error.message,
    });
  }
};

const getSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id).populate({
      path: "owner",
      select: "fullname fullName name firstName lastName middleName employeeId",
    });

    if (!schedule || schedule.deletedAt) {
      return res.status(404).json({ message: "Schedule not found." });
    }

    const scheduleObj = schedule.toObject
      ? schedule.toObject()
      : { ...schedule };

    // Format organization data
    let organizationData = null;
    if (scheduleObj.organizations) {
      // If organizations is an ObjectId or string ID
      const orgId = scheduleObj.organizations.id || scheduleObj.organizations;

      if (orgId && mongoose.Types.ObjectId.isValid(orgId)) {
        const team = await Team.findById(orgId);
        if (team) {
          organizationData = {
            id: team._id.toString(),
            name: team.name,
          };
        }
      }
    }

    scheduleObj.organizationData = organizationData;

    // Format standard data
    let standardData = {
      standard: "",
      description: "",
    };
    if (scheduleObj.standard && scheduleObj.standard.id) {
      const standardDoc = await Standard.findById(scheduleObj.standard.id);
      if (standardDoc) {
        standardData = {
          standard: standardDoc.standard || "",
          description: standardDoc.description || "",
        };
      }
    }

    scheduleObj.standardData = standardData;

    return res.status(200).json({
      success: true,
      message: "Schedule retrieved successfully",
      data: scheduleObj,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve schedule",
      error: error.message,
    });
  }
};

const putSchedule = async (req, res) => {
  try {
    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: "No data provided for update." });
    }

    const schedule = await Schedule.findById(req.params.id);
    if (!schedule || schedule.deletedAt) {
      return res.status(404).json({ message: "Schedule not found." });
    }

    const oldStatus = schedule.status;

    const {
      title,
      description,
      auditCode,
      auditType,
      standard,
      organizations,
      previousAudit,
      status,
      auditYear,
      auditNumber,
    } = req.body;

    if (title !== undefined) {
      if (!title || typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ message: "Title is required." });
      }
      schedule.title = title.trim();
    }

    if (description !== undefined) schedule.description = description;

    // Never regenerate the audit code for a closed audit, and never allow a
    // manual override of auditCode on a closed audit.  The audit code is
    // permanent once an audit reaches status 1.
    const auditIsClosed = schedule.status === AUDIT_STATUS_CLOSED;

    if (!auditIsClosed && auditType !== undefined) {
      const newAuditTypeCode =
        AUDIT_TYPE_CODES[(auditType ?? "").toString().toLowerCase()];
      const oldAuditTypeCode =
        AUDIT_TYPE_CODES[(schedule.auditType ?? "").toString().toLowerCase()];

      if (newAuditTypeCode !== oldAuditTypeCode) {
        // Block the type change if there is already an ongoing audit of the new type.
        const newAuditTypeValue = auditType.toString().trim();
        const conflictingAudit = await Schedule.findOne({
          auditType: new RegExp(`^${escapeRegExp(newAuditTypeValue)}$`, "i"),
          status: 0,
          deletedAt: null,
          _id: { $ne: schedule._id },
        });
        if (conflictingAudit) {
          return res.status(400).json({
            message:
              "There's an ongoing audit of the new type. Cannot change the audit type.",
            ongoingSchedule: {
              id: conflictingAudit._id,
              title: conflictingAudit.title,
            },
          });
        }

        // Type is actually changing — generate a fresh code for the new type
        // and release the old code if it was the latest of its kind.
        const oldAuditCode = schedule.auditCode;

        const { auditCode: updatedAuditCode, error: auditCodeError } =
          await generateAuditCode(auditType);
        if (auditCodeError) {
          return res.status(400).json({ message: auditCodeError });
        }

        schedule.auditType = auditType;
        schedule.auditCode = updatedAuditCode;

        await releaseAuditCode(oldAuditCode);
      } else {
        // Same type — just normalize the stored value, keep the existing code.
        schedule.auditType = auditType;
      }
    } else if (!auditIsClosed && auditCode !== undefined) {
      schedule.auditCode = auditCode;
    }
    if (standard !== undefined) {
      schedule.standard = standard;
      schedule.markModified("standard");
    }
    if (status !== undefined) schedule.status = status;
    if (auditYear !== undefined) schedule.auditYear = auditYear;
    if (auditNumber !== undefined) schedule.auditNumber = auditNumber;
    if (organizations !== undefined) {
      schedule.organizations = organizations;
      schedule.markModified("organizations");
    }
    if (previousAudit !== undefined) {
      schedule.previousAudit = previousAudit;
      schedule.markModified("previousAudit");
    }

    const saved = await schedule.save();

    // Fire notifications
    const actorId = req.user?._id || req.user?.id;
    const actorName =
      `${req.user?.firstName || ""} ${req.user?.lastName || ""}`.trim() ||
      "System";
    if (status !== undefined && status === AUDIT_STATUS_CLOSED && oldStatus !== AUDIT_STATUS_CLOSED) {
      notifyScheduleClosed(saved, actorId, actorName);
    } else {
      notifyScheduleUpdated(saved, actorId, actorName);
    }

    return res.status(200).json({
      success: true,
      message: "Schedule updated successfully.",
      schedule: saved,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update schedule",
      error: error.message,
    });
  }
};

const deleteSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);

    if (!schedule || schedule.deletedAt) {
      return res.status(404).json({ message: "Schedule not found." });
    }

    schedule.deletedAt = new Date();
    await schedule.save();

    // Notify admins about deletion
    const actorId = req.user?._id || req.user?.id;
    const actorName =
      `${req.user?.firstName || ""} ${req.user?.lastName || ""}`.trim() ||
      "System";
    notifyScheduleDeleted(schedule, actorId, actorName);

    return res.status(200).json({
      success: true,
      message: "Schedule deleted successfully.",
      schedule: schedule,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete schedule",
      error: error.message,
    });
  }
};

const getAvailableYears = async (req, res) => {
  try {
    // Aggregate to get unique years from date.start field
    const yearsData = await Schedule.aggregate([
      // Filter out deleted schedules
      {
        $match: {
          deletedAt: null,
          "date.start": { $exists: true, $ne: null },
        },
      },
      // Extract year from date.start
      {
        $project: {
          year: { $year: "$date.start" },
        },
      },
      // Group by year to get unique values
      {
        $group: {
          _id: "$year",
        },
      },
      // Sort descending (newest first)
      {
        $sort: { _id: -1 },
      },
    ]);

    // Extract years from aggregation result
    const years = yearsData.map((item) => item._id);

    return res.status(200).json({
      success: true,
      message: "Available years retrieved successfully",
      data: {
        years,
      },
    });
  } catch (error) {
    console.error("Error in getAvailableYears:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve available years",
      error: error.message,
    });
  }
};

export {
  postSchedule,
  getAllSchedule,
  getSchedule,
  putSchedule,
  deleteSchedule,
  getAvailableYears,
};
