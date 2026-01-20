import { AuditTrail } from "./auditTrail.model.js";

const postAuditTrailLog = async (action, entityId, module, summary, userData, log = "") => {
  try {
    // Validate required fields
    if (!action) {
      console.error("[AUDIT TRAIL] Missing action for audit trail log");
      return null;
    }
    if (!entityId) {
      console.error("[AUDIT TRAIL] Missing entityId for audit trail log");
      return null;
    }
    if (!module) {
      console.error("[AUDIT TRAIL] Missing module for audit trail log");
      return null;
    }
    if (!userData || !userData.id || !userData.name) {
      console.error("[AUDIT TRAIL] Missing or invalid userData for audit trail log", userData);
      return null;
    }

    console.log("[AUDIT TRAIL] Creating audit log:", {
      action,
      entityId: entityId.toString(),
      module,
      summary,
      userData: {
        id: userData.id.toString(),
        name: userData.name.toString(),
      },
    });

    // Create new audit trail record
    const auditLog = new AuditTrail({
      action, // C, R, U, D
      entityId: entityId.toString(),
      module,
      summary: summary || "",
      userData: {
        id: userData.id.toString(),
        name: userData.name.toString(),
      },
      log: log || "",
    });

    // Save audit log
    const savedLog = await auditLog.save();
    console.log("[AUDIT TRAIL] Logged successfully:", savedLog._id);
    return savedLog;
  } catch (error) {
    console.error("[AUDIT TRAIL] Error creating audit trail log:", error.message);
    console.error("[AUDIT TRAIL] Error details:", error);
    // Don't throw error to prevent disrupting the main operation
    return null;
  }
};

const getAuditTrails = async (req, res) => {
  try {
    // Query parameters:
    // ?module=USERS|TEAMS|ROLES|DOCUMENTS - Filter by module
    // ?entityId=<id> - Filter by entity ID
    // ?userId=<id> - Filter by user who performed the action
    // ?action=C|R|U|D - Filter by action type
    // ?limit=50 - Number of records per page (default: 50)
    // ?skip=0 - Number of records to skip (default: 0)
    
    const { module, action, entityId, userId, limit = 50, skip = 0 } = req.query;

    // Build filter
    let filter = {};
    if (module) filter.module = module;
    if (action) filter.action = action;
    if (entityId) filter.entityId = entityId;
    if (userId) filter["userData.id"] = userId;

    // Get audit trails with pagination
    const auditTrails = await AuditTrail.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await AuditTrail.countDocuments(filter);

    return res.status(200).json({
      success: true,
      message: "Audit trails retrieved successfully",
      data: auditTrails,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
      },
    });
  } catch (error) {
    console.error("Error in getAuditTrails:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve audit trails",
      error: error.message,
    });
  }
};

export { postAuditTrailLog, getAuditTrails };