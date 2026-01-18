import { Settings } from "../systemSettings/settings.model.js";

const postSetting = async (req, res) => {
  try {
    const { teamLeaderRole } = req.body;

    // Validate required fields
    if (!teamLeaderRole || !Array.isArray(teamLeaderRole)) {
      return res.status(400).json({
        success: false,
        message: "teamLeaderRole is required and must be an array",
      });
    }

    // Create new setting
    const newSettings = new Settings({
      teamLeaderRole,
    });

    // Save setting
    const savedSettings = await newSettings.save();

    // Populate role information
    await savedSettings.populate("teamLeaderRole", "_id title");

    // Format teamLeaderRole with id and title
    const formattedSettings = {
      ...savedSettings.toObject(),
      teamLeaderRole: savedSettings.teamLeaderRole.map((role) => ({
        id: role._id,
        title: role.title,
      })),
    };

    return res.status(201).json({
      success: true,
      message: "Setting created successfully",
      data: formattedSettings,
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
    const settings = await Settings.findOne()
      .sort({ createdAt: -1 })
      .populate("teamLeaderRole", "_id title")
      .lean();

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: "Settings not found",
      });
    }

    // Format teamLeaderRole with id and title
    const formattedSettings = {
      ...settings,
      teamLeaderRole: settings.teamLeaderRole.map((role) => ({
        id: role._id,
        title: role.title,
      })),
    };

    return res.status(200).json({
      success: true,
      message: "Settings retrieved successfully",
      data: formattedSettings,
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

export { postSetting, getSettings };
