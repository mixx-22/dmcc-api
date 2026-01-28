import { Schedule } from "./schedule.model.js";
import { Team } from "../../teams/team.model.js";
import mongoose from "mongoose";

const postSchedule = async (req, res) => {
  try {
    const {
      title,
      description,
      auditCode,
      auditType,
      standard,
      organizations,
      status,
    } = req.body;

    // Get userId from token
    const userId = req.user?.id || req.user?._id;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ message: "Title is required." });
    }

    // Check if there's an ongoing audit (status = 0)
    const ongoingAudit = await Schedule.findOne({
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

    const scheduleData = {
      title: title.trim(),
      description,
      auditCode,
      auditType,
      standard,
      organizations,
      status,
      owner: userId,
    };

    const newSchedule = await Schedule.create(scheduleData);

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
        { standard: re },
      ];
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

    const {
      title,
      description,
      auditCode,
      auditType,
      standard,
      organizations,
      status,
    } = req.body;

    if (title !== undefined) {
      if (!title || typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ message: "Title is required." });
      }
      schedule.title = title.trim();
    }

    if (description !== undefined) schedule.description = description;
    if (auditCode !== undefined) schedule.auditCode = auditCode;
    if (auditType !== undefined) schedule.auditType = auditType;
    if (standard !== undefined) schedule.standard = standard;
    if (status !== undefined) schedule.status = status;
    if (organizations !== undefined) {
      schedule.organizations = organizations;
      schedule.markModified("organizations");
    }

    const saved = await schedule.save();

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

export {
  postSchedule,
  getAllSchedule,
  getSchedule,
  putSchedule,
  deleteSchedule,
};
