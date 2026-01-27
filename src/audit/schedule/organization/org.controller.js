import { Org } from "./org.model.js";
import { Schedule } from "../schedule.model.js";
import { Team } from "../../../teams/team.model.js";
import { User } from "../../../users/user.model.js";
import { Document } from "../../../documents/document.model.js";
import mongoose from "mongoose";

const postOrganization = async (req, res) => {
  try {
    const {
      auditScheduleId,
      teamId,
      status,
      auditors,
      documents,
      visit,
      verdict,
    } = req.body;

    if (!auditScheduleId) {
      return res
        .status(400)
        .json({ message: "Audit Schedule ID is required." });
    }

    if (!teamId) {
      return res.status(400).json({ message: "Team ID is required." });
    }

    const orgData = {
      auditScheduleId,
      teamId,
      status,
      auditors,
      documents,
      visit,
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
      // Using teamId as key and org ID as value
      schedule.organizations[teamId.toString()] = newOrg._id.toString();
      schedule.markModified("organizations");
      await schedule.save();
    }

    res.status(201).json({
      message: "Organization created successfully.",
      organization: newOrg,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error.", error: error.message });
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

    // Filter by teamId if provided
    if (req.query.teamId) {
      filter.teamId = req.query.teamId;
    }

    // Filter by status if provided
    if (req.query.status !== undefined) {
      filter.status = parseInt(req.query.status, 10);
    }

    const total = await Org.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const data = await Org.find(filter)
      .populate("auditScheduleId", "title")
      .populate("teamId", "name")
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json({
      data,
      meta: { total, page, limit, totalPages },
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error.",
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

    // Populate teamData
    let teamData = null;
    if (orgObj.teamId) {
      const team = await Team.findById(orgObj.teamId);
      if (team) {
        teamData = {
          id: team._id.toString(),
          name: team.name,
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
        }).select("firstName lastName fullname fullName name");

        auditorsData = auditors.map((user) => {
          const firstName = user.firstName || "";
          const lastName = user.lastName || "";
          const fullName =
            user.fullname ||
            user.fullName ||
            user.name ||
            `${firstName} ${lastName}`.trim();

          return {
            id: user._id.toString(),
            name: fullName,
            firstName: firstName,
            lastName: lastName,
          };
        });
      }
    }

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
    orgObj.teamData = teamData;
    orgObj.auditorsData = auditorsData;
    orgObj.documentsData = documentsData;

    res.status(200).json({ data: orgObj });
  } catch (error) {
    res.status(500).json({
      message: "Server error.",
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

    const {
      auditScheduleId,
      teamId,
      status,
      auditors,
      documents,
      visit,
      verdict,
    } = req.body;

    if (auditScheduleId !== undefined) org.auditScheduleId = auditScheduleId;
    if (teamId !== undefined) org.teamId = teamId;
    if (status !== undefined) org.status = status;
    if (auditors !== undefined) {
      org.auditors = auditors;
      org.markModified("auditors");
    }
    if (documents !== undefined) {
      org.documents = documents;
      org.markModified("documents");
    }
    if (visit !== undefined) org.visit = visit;
    if (verdict !== undefined) org.verdict = verdict;

    const saved = await org.save();

    res.status(200).json({
      message: "Organization updated successfully.",
      organization: saved,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error.",
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

    res.status(200).json({
      message: "Organization deleted successfully.",
      organization: org,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error.",
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
