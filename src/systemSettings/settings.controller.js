import { Settings } from "../systemSettings/settings.model.js";
import { User } from "../users/user.model.js";
import { Team } from "../teams/team.model.js";
import mongoose from "mongoose";

const postSetting = async (req, res) => {
  try {
    const { teamLeaderRole } = req.body;

    // Validate required fields
    if (!teamLeaderRole || typeof teamLeaderRole !== "string") {
      return res.status(400).json({
        success: false,
        message: "teamLeaderRole is required and must be a string",
      });
    }

    // Create new setting
    const newSettings = new Settings({
      teamLeaderRole,
    });

    // Save setting
    const savedSettings = await newSettings.save();

    return res.status(201).json({
      success: true,
      message: "Setting created successfully",
      data: savedSettings,
    });
  } catch (error) {
    console.error("Error in postSetting:", error);

    // Handle validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.keys(error.errors).map((key) => ({
          field: key,
          message: error.errors[key].message,
        })),
      });
    }

    // Handle cast errors (invalid ObjectId)
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create settings",
      error: error.message,
    });
  }
};

const getSettings = async (req, res) => {
  try {
    // Find the most recent settings document
    const settings = await Settings.findOne().sort({ createdAt: -1 });

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: "Settings not found",
      });
    }

    // Transform the response to include teamLeaderRole as an object with id and title
    const { Role } = await import("../roles/role.model.js");
    
    let teamLeaderRole = {
      id: "",
      title: "",
    };

    if (settings.teamLeaderRole) {
      const role = await Role.findById(settings.teamLeaderRole).select("_id title");
      if (role) {
        teamLeaderRole = {
          id: role._id.toString(),
          title: role.title,
        };
      }
    }

    return res.status(200).json({
      success: true,
      message: "Settings retrieved successfully",
      data: {
        ...settings.toObject(),
        teamLeaderRole,
      },
    });
  } catch (error) {
    console.error("Error in getSettings:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve settings",
      error: error.message,
    });
  }
};

const updateSettings = async (req, res) => {
  try {
    const { teamLeaderRole } = req.body;

    // Validate required fields
    if (typeof teamLeaderRole !== "string") {
      return res.status(400).json({
        success: false,
        message: "teamLeaderRole must be a string",
      });
    }

    // Find the most recent settings document
    const existingSettings = await Settings.findOne().sort({ createdAt: -1 });

    if (!existingSettings) {
      return res.status(404).json({
        success: false,
        message: "Settings not found",
      });
    }

    // Get old and new role IDs
    const oldRoleId = existingSettings.teamLeaderRole;
    const newRoleId = teamLeaderRole;

    let teamLeadersCount = 0;
    let usersUpdated = 0;

    // If the role is changing, update users who are team leaders
    if (oldRoleId !== newRoleId) {
      // Find all teams and get leader user IDs
      const teams = await Team.find({ deletedAt: null }).select("leaders");

      // Extract all unique leader IDs from all teams
      const teamLeaderIds = [...new Set(teams.flatMap((team) => team.leaders))];

      teamLeadersCount = teamLeaderIds.length;

      if (teamLeaderIds.length > 0) {
        // Remove the old teamLeaderRole from all team leaders' role array
        if (oldRoleId) {
          const removeResult = await User.updateMany(
            {
              _id: { $in: teamLeaderIds },
              deletedAt: null,
            },
            {
              $pull: {
                role: new mongoose.Types.ObjectId(oldRoleId),
              },
            },
          );
          console.log(
            "Removed old role from users:",
            removeResult.modifiedCount,
          );
        }

        // Add the new teamLeaderRole to all team leaders' role array
        if (newRoleId) {
          const addResult = await User.updateMany(
            {
              _id: { $in: teamLeaderIds },
              role: { $ne: new mongoose.Types.ObjectId(newRoleId) },
              deletedAt: null,
            },
            {
              $addToSet: { role: new mongoose.Types.ObjectId(newRoleId) },
            },
          );
          console.log("Added new role to users:", addResult.modifiedCount);
          usersUpdated = addResult.modifiedCount || 0;
        }
      }
    }

    // Update settings with new teamLeaderRole
    existingSettings.teamLeaderRole = newRoleId;
    const updatedSettings = await existingSettings.save();

    return res.status(200).json({
      success: true,
      message: "Settings updated successfully",
      data: updatedSettings,
      teamLeadersCount,
      usersUpdated,
    });
  } catch (error) {
    console.error("Error in updateSettings:", error);

    // Handle validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.keys(error.errors).map((key) => ({
          field: key,
          message: error.errors[key].message,
        })),
      });
    }

    // Handle cast errors (invalid ObjectId)
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update settings",
      error: error.message,
    });
  }
};

export { postSetting, getSettings, updateSettings };
