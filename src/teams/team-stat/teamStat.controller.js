import { TeamStat } from "./teamStat.model.js";
import { Team } from "../team.model.js";

const postTeamStat = async (req, res) => {
  try {
    const { teamId, files, pending } = req.body;

    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: "teamId is required",
      });
    }

    // Check if teamStat already exists for this team
    const existing = await TeamStat.findOne({ teamId });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "TeamStat already exists for this team",
        data: existing,
      });
    }

    // Create new teamStat
    const newTeamStat = new TeamStat({
      teamId,
      files: files || [],
      pending: pending || [],
    });

    await newTeamStat.save();

    return res.status(201).json({
      success: true,
      message: "TeamStat created successfully",
      data: newTeamStat,
    });
  } catch (error) {
    console.error("Error creating team stat:", error);

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
      message: "Failed to create team stat",
      error: error.message,
    });
  }
};

// Helper function to create TeamStat when team is created
const createTeamStat = async (teamId) => {
  try {
    console.log(`[createTeamStat] Called with teamId: ${teamId}`);

    if (!teamId) {
      console.error("[createTeamStat] Missing teamId");
      return;
    }

    // Check if teamStat already exists
    const existing = await TeamStat.findOne({ teamId });
    if (existing) {
      console.log(
        `[createTeamStat] TeamStat already exists for team ${teamId}`,
      );
      return existing;
    }

    console.log(`[createTeamStat] Creating new TeamStat for team ${teamId}`);

    // Create new teamStat
    const newTeamStat = new TeamStat({
      teamId,
      files: [],
      pending: [],
    });

    await newTeamStat.save();
    console.log(`[createTeamStat] TeamStat created successfully:`, newTeamStat);
    return newTeamStat;
  } catch (error) {
    console.error("[createTeamStat] Error creating team stat:", error);
    console.error("[createTeamStat] Error stack:", error.stack);
    throw error;
  }
};

const putFileTeamStat = async (teamId, documentId) => {
  try {
    if (!teamId || !documentId) {
      console.error("Missing required parameters for putFileTeamStat");
      return;
    }

    // Find or create teamStat for the team
    let teamStat = await TeamStat.findOne({ teamId });

    if (!teamStat) {
      // Create new teamStat if it doesn't exist
      teamStat = new TeamStat({
        teamId,
        files: [],
        pending: [],
      });
    }

    // Convert documentId to string
    const docIdString = documentId.toString();

    // Add documentId to files array if not already present
    if (!teamStat.files.includes(docIdString)) {
      teamStat.files.push(docIdString);
    }

    await teamStat.save();
    console.log(`Document ${documentId} added to team stat for team ${teamId}`);
    return teamStat;
  } catch (error) {
    console.error("Error updating team stat with file:", error);
    throw error;
  }
};

const removeFileTeamStat = async (teamId, documentId) => {
  try {
    if (!teamId || !documentId) {
      console.error("Missing required parameters for removeFileTeamStat");
      return;
    }

    // Find teamStat for the team
    const teamStat = await TeamStat.findOne({ teamId });

    if (!teamStat) {
      console.log(`No teamStat found for team ${teamId}`);
      return;
    }

    // Convert documentId to string
    const docIdString = documentId.toString();

    // Remove documentId from files array if present
    const index = teamStat.files.indexOf(docIdString);
    if (index > -1) {
      teamStat.files.splice(index, 1);
      await teamStat.save();
      console.log(
        `Document ${documentId} removed from team stat for team ${teamId}`,
      );
    }

    return teamStat;
  } catch (error) {
    console.error("Error removing file from team stat:", error);
    throw error;
  }
};

const getAllTeamStats = async (req, res) => {
  try {
    // Get user ID from authenticated user
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    // Find all teams where user is a member or leader
    const teams = await Team.find({
      $or: [{ members: userId }, { leaders: userId }],
      deletedAt: null,
    }).select("_id");

    const teamIds = teams.map((team) => team._id);

    if (teamIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          total: 0,
          pending: 0,
        },
      });
    }

    // Get TeamStats for all user's teams
    const teamStats = await TeamStat.find({
      teamId: { $in: teamIds },
    }).select("files pending");

    // Combine all file IDs and pending IDs, remove duplicates
    const allFiles = [];
    const allPending = [];

    teamStats.forEach((stat) => {
      if (stat.files && Array.isArray(stat.files)) {
        allFiles.push(...stat.files);
      }
      if (stat.pending && Array.isArray(stat.pending)) {
        allPending.push(...stat.pending);
      }
    });

    // Remove duplicates using Set
    const uniqueFiles = [...new Set(allFiles)];
    const uniquePending = [...new Set(allPending)];

    return res.status(200).json({
      success: true,
      data: {
        total: uniqueFiles.length,
        pending: uniquePending.length,
      },
    });
  } catch (error) {
    console.error("Error in getAllTeamStats:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get team stats",
      error: error.message,
    });
  }
};

const getTeamStats = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Team ID is required",
      });
    }

    // Find TeamStat for the specified team
    const teamStat = await TeamStat.findOne({ teamId: id });

    if (!teamStat) {
      return res.status(404).json({
        success: false,
        message: "TeamStat not found for this team",
      });
    }

    // Count files and pending
    const totalFiles = teamStat.files ? teamStat.files.length : 0;
    const totalPending = teamStat.pending ? teamStat.pending.length : 0;

    return res.status(200).json({
      success: true,
      data: {
        total: totalFiles,
        pending: totalPending,
      },
    });
  } catch (error) {
    console.error("Error in getTeamStats:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get team stats",
      error: error.message,
    });
  }
};

export {
  postTeamStat,
  createTeamStat,
  putFileTeamStat,
  removeFileTeamStat,
  getAllTeamStats,
  getTeamStats,
};
