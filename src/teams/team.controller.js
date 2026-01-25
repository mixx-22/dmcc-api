import { Team } from "../teams/team.model.js";
import { Settings } from "../systemSettings/settings.model.js";
import { User } from "../users/user.model.js";
import { postAuditTrailLog } from "../documentLogs/auditTrail/auditTrail.controller.js";
import { createTeamStat } from "./team-stat/teamstat.controller.js";
import mongoose from "mongoose";

// Helper function to extract user data for audit trail
const extractUserData = (req) => {
  const user = req.user || {};
  const userId = user._id?.toString() || user.id || "system";
  const userName =
    user.fullname ||
    user.fullName ||
    user.name ||
    `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
    "System";

  return {
    id: userId,
    name: userName,
  };
};

const getFullName = (user) => {
  if (!user || typeof user !== "object") return null;
  const constructed = [user.firstName, user.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return user.fullname || user.fullName || user.name || constructed || null;
};

const formatUserField = (field) => {
  if (!field) return null;
  if (Array.isArray(field)) {
    const names = field.map(getFullName).filter(Boolean);
    return names.length ? names : [];
  }
  return getFullName(field);
};

const formatUserFieldAsObject = (field) => {
  if (!field) return null;
  if (Array.isArray(field)) {
    return field
      .map((user) => {
        if (!user || typeof user !== "object") return null;
        return {
          id: user._id || user.id,
          firstName: user.firstName || null,
          lastName: user.lastName || null,
          middleName: user.middleName || user.middlename || null,
          employeeId: user.employeeId || user.employeeid || null,
        };
      })
      .filter((item) => item && item.id);
  }
  if (typeof field === "object") {
    return {
      id: field._id || field.id,
      firstName: field.firstName || null,
      lastName: field.lastName || null,
      middleName: field.middleName || field.middlename || null,
      employeeId: field.employeeId || field.employeeid || null,
    };
  }
  return null;
};

const postTeam = async (req, res) => {
  try {
    const {
      name,
      members,
      createdBy: createdByBody,
      createdby,
      ...other
    } = req.body;
    const creator = createdByBody ?? createdby ?? req.user?.id ?? req.user?._id;

    if (!name) {
      return res.status(400).json({ message: "Team name is required" });
    }

    const existing = await Team.findOne({ name });
    if (existing) {
      return res.status(409).json({ message: "Team already exists" });
    }

    const teamData = { name, members, ...other };
    if (creator) teamData.createdBy = creator; // use schema field createdBy

    const newTeam = new Team(teamData);
    await newTeam.save();

    console.log(`[postTeam] Team created with ID: ${newTeam._id}`);

    // Create TeamStat for the new team
    try {
      console.log(`[postTeam] Calling createTeamStat for team ${newTeam._id}`);
      await createTeamStat(newTeam._id);
      console.log(`[postTeam] TeamStat created successfully`);
    } catch (statError) {
      console.error("[postTeam] Error creating team stat:", statError);
      console.error("[postTeam] Error stack:", statError.stack);
      // Don't fail team creation if stat creation fails
    }

    // Log to audit trail
    await postAuditTrailLog(
      "C",
      newTeam._id.toString(),
      "TEAMS",
      `Team '${name}' created`,
      extractUserData(req),
      JSON.stringify({ name, members }),
    );

    return res.status(201).json({ message: "Team created", team: newTeam });
  } catch (err) {
    console.error("Team registration error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const getAllTeams = async (req, res) => {
  try {
    // pagination
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const maxLimit = 100;
    let limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    if (limit > maxLimit) limit = maxLimit;

    // keyword search (name OR description)
    const keyword = (req.query.keyword ?? req.query.q ?? "").toString().trim();
    const filter = { deletedAt: null };
    if (keyword) {
      const re = new RegExp(keyword, "i");
      filter.$or = [{ name: re }, { description: re }];
    }

    const total = await Team.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const data = await Team.find(filter)
      .populate({
        path: "createdBy leaders members", // use createdBy (camelCase)
        select:
          "fullname fullName name firstName lastName middleName middlename employeeId employeeid",
      })
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    const transformed = data.map((d) => {
      const obj = d.toObject ? d.toObject() : { ...d };
      obj.createdBy = formatUserField(obj.createdBy);
      obj.leaders = formatUserFieldAsObject(obj.leaders) ?? [];
      obj.members = formatUserFieldAsObject(obj.members) ?? [];
      return obj;
    });

    res.status(200).json({
      data: transformed,
      meta: { total, page, limit, totalPages },
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error.",
      error: error.message,
    });
  }
};

const getTeam = async (req, res) => {
  try {
    const data = await Team.findById(req.params.id).populate({
      path: "createdBy leaders members",
      select:
        "firstName lastName fullname fullName name middleName middlename employeeId employeeid",
    });

    if (!data) {
      return res.status(404).json({ message: "Team not found." });
    }

    // Log to audit trail
    await postAuditTrailLog(
      "R",
      req.params.id,
      "TEAMS",
      `Team '${data.name}' accessed`,
      extractUserData(req),
    );

    const obj = data.toObject ? data.toObject() : { ...data };
    obj.createdBy = formatUserField(obj.createdBy);
    obj.leaders = formatUserFieldAsObject(obj.leaders) ?? [];
    obj.members = formatUserFieldAsObject(obj.members) ?? [];

    res.status(200).json({ data: obj });
  } catch (error) {
    res.status(500).json({
      message: "Server error.",
      error: error.message,
    });
  }
};

const updateTeam = async (req, res) => {
  try {
    const id = req.params.id;
    const existingTeam = await Team.findById(id);
    if (!existingTeam) {
      return res.status(404).json({ message: "Team not found." });
    }

    const {
      name,
      description,
      leaders,
      members,
      createdBy: createdByBody,
      createdby,
      ...other
    } = req.body;

    // name validation & uniqueness
    if (name !== undefined) {
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "Team name is required" });
      }
      const conflict = await Team.findOne({
        name: name.trim(),
        _id: { $ne: id },
      });
      if (conflict) {
        return res.status(409).json({ message: "Team name already in use." });
      }
      existingTeam.name = name.trim();
    }

    if (description !== undefined) existingTeam.description = description;

    // Handle leaders change and update user roles
    if (Array.isArray(leaders)) {
      // Get current teamLeaderRole from settings
      const settings = await Settings.findOne().sort({ createdAt: -1 });
      const teamLeaderRoleId = settings?.teamLeaderRole;

      if (teamLeaderRoleId) {
        // Get old and new leader IDs
        const oldLeaderIds = existingTeam.leaders.map((id) => id.toString());
        const newLeaderIds = leaders.map((id) => id.toString());

        // Find leaders to remove (in old but not in new)
        const leadersToRemove = oldLeaderIds.filter(
          (id) => !newLeaderIds.includes(id),
        );

        // Find leaders to add (in new but not in old)
        const leadersToAdd = newLeaderIds.filter(
          (id) => !oldLeaderIds.includes(id),
        );

        // Remove teamLeaderRole from users who are no longer leaders
        if (leadersToRemove.length > 0) {
          await User.updateMany(
            {
              _id: {
                $in: leadersToRemove.map(
                  (id) => new mongoose.Types.ObjectId(id),
                ),
              },
              deletedAt: null,
            },
            {
              $pull: {
                role: new mongoose.Types.ObjectId(teamLeaderRoleId),
              },
            },
          );
        }

        // Add teamLeaderRole to users who are now leaders
        if (leadersToAdd.length > 0) {
          await User.updateMany(
            {
              _id: {
                $in: leadersToAdd.map((id) => new mongoose.Types.ObjectId(id)),
              },
              role: { $ne: new mongoose.Types.ObjectId(teamLeaderRoleId) },
              deletedAt: null,
            },
            {
              $addToSet: {
                role: new mongoose.Types.ObjectId(teamLeaderRoleId),
              },
            },
          );
        }
      }

      existingTeam.leaders = leaders;
    }

    if (Array.isArray(members)) existingTeam.members = members;
    const creator = createdByBody ?? createdby;
    if (creator !== undefined) existingTeam.createdBy = creator;

    // apply any other provided fields
    for (const [k, v] of Object.entries(other)) existingTeam[k] = v;

    await existingTeam.save();

    // Log to audit trail
    const changes = {};
    if (name !== undefined) changes.name = name;
    if (description !== undefined) changes.description = description;
    if (Array.isArray(leaders)) changes.leaders = { changed: true };
    if (Array.isArray(members)) changes.members = { changed: true };

    await postAuditTrailLog(
      "U",
      id,
      "TEAMS",
      `Team '${existingTeam.name}' updated`,
      extractUserData(req),
      JSON.stringify(changes),
    );

    // return populated & formatted team (same format as getTeam)
    const data = await Team.findById(id).populate({
      path: "createdBy leaders members",
      select:
        "firstName lastName fullname fullName name middleName middlename employeeId employeeid",
    });

    const obj = data.toObject ? data.toObject() : { ...data };
    obj.createdBy = formatUserField(obj.createdBy);
    obj.leaders = formatUserFieldAsObject(obj.leaders) ?? [];
    obj.members = formatUserFieldAsObject(obj.members) ?? [];

    return res.status(200).json({ message: "Team updated.", data: obj });
  } catch (error) {
    console.error("Update team error:", error);
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
};

const deleteTeam = async (req, res) => {
  try {
    const id = req.params.id;
    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({ message: "Team not found." });
    }
    if (team.deletedAt) {
      return res.status(400).json({ message: "Team already deleted." });
    }

    team.deletedAt = new Date();
    await team.save();

    // Log to audit trail
    await postAuditTrailLog(
      "D",
      id,
      "TEAMS",
      `Team '${team.name}' deleted`,
      extractUserData(req),
      JSON.stringify({ name: team.name, deletedAt: team.deletedAt }),
    );

    const data = await Team.findById(id).populate({
      path: "createdBy leaders members",
      select:
        "firstName lastName fullname fullName name middleName middlename employeeId employeeid",
    });

    const obj = data.toObject ? data.toObject() : { ...data };
    obj.createdBy = formatUserField(obj.createdBy);
    obj.leaders = formatUserFieldAsObject(obj.leaders) ?? [];
    obj.members = formatUserFieldAsObject(obj.members) ?? [];

    return res.status(200).json({ message: "Team deleted.", data: obj });
  } catch (error) {
    console.error("Delete team error:", error);
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
};

export { postTeam, getAllTeams, getTeam, updateTeam, deleteTeam };
