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
    if (req.query.team) {
      filter.team = req.query.team;
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
        "name description folderId folderTitle objectives updatedAt",
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
          orgObj.team = {
            id: orgObj.team._id.toString(),
            name: orgObj.team.name || "",
            description: orgObj.team.description || "",
            folderId: orgObj.team.folderId || "",
            folderTitle: orgObj.team.folderTitle || "",
            objectives: orgObj.team.objectives || [],
            updatedAt: orgObj.team.updatedAt || "",
          };
        }

        // Transform auditors data
        let auditorsData = [];
        if (orgObj.auditors) {
          let auditorIds = [];

          if (Array.isArray(orgObj.auditors)) {
            auditorIds = orgObj.auditors;
          } else if (typeof orgObj.auditors === "object") {
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
        orgObj.team = {
          id: team._id.toString(),
          name: team.name || "",
          description: team.description || "",
          folderId: team.folderId || "",
          folderTitle: team.folderTitle || "",
          objectives: team.objectives || [],
          updatedAt: team.updatedAt || "",
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
    if (team !== undefined) org.team = team;
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
