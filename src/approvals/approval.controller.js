import Approval from "./approval.model.js";

const postApproval = async (req, res) => {
  try {
    const {
      title,
      description,
      metadata,
      entityId,
      applicationId,
      requestedBy,
      requestedFor,
      status,
      mode,
      remarks,
      otherRemarks,
      approvalDate_DEPARTMENT,
      approvalDate_CONTROLLER,
      approvedBy,
    } = req.body;

    // Validate required fields
    if (!title || !entityId || !requestedBy) {
      return res.status(400).json({
        success: false,
        message: "Title, entityId, and requestedBy are required fields",
      });
    }

    // Create new approval
    const newApproval = new Approval({
      title,
      description,
      metadata: metadata || {},
      entityId,
      applicationId,
      requestedBy,
      requestedFor,
      status: status !== undefined ? status : -1, // Default to -1 (Working)
      mode: mode || "Department", // Default to Department
      remarks,
      otherRemarks,
      approvalDate_DEPARTMENT,
      approvalDate_CONTROLLER,
      approvedBy,
    });

    // Save to database
    const savedApproval = await newApproval.save();

    // Populate references if needed
    const populatedApproval = await Approval.findById(savedApproval._id)
      .populate("entityId")
      .populate("requestedBy")
      .populate("requestedFor")
      .populate("approvedBy");

    return res.status(201).json({
      success: true,
      message: "Approval created successfully",
      data: populatedApproval,
    });
  } catch (error) {
    console.error("Error creating approval:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create approval",
      error: error.message,
    });
  }
};

const getAllApprovals = async (req, res) => {
  try {
    // Pagination
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const maxLimit = 100;
    let limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    if (limit > maxLimit) limit = maxLimit;

    // Keyword search (title OR description)
    const keyword = (req.query.keyword ?? req.query.q ?? "").toString().trim();
    const filter = {};
    if (keyword) {
      const re = new RegExp(keyword, "i");
      filter.$or = [{ title: re }, { description: re }];
    }

    // Filter by status if provided
    if (req.query.status !== undefined) {
      filter.status = parseInt(req.query.status, 10);
    }

    // Filter by mode if provided
    if (req.query.mode) {
      filter.mode = req.query.mode;
    }

    // Filter by requestedBy if provided
    if (req.query.requestedBy) {
      filter.requestedBy = req.query.requestedBy;
    }

    // Filter by entityId if provided
    if (req.query.entityId) {
      filter.entityId = req.query.entityId;
    }

    // Filter by requestedFor if provided
    if (req.query.requestedFor) {
      filter.requestedFor = req.query.requestedFor;
    }

    const total = await Approval.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const data = await Approval.find(filter)
      .populate({
        path: "entityId",
        select: "title description type status",
      })
      .populate({
        path: "requestedBy",
        select:
          "fullname fullName name firstName lastName middleName employeeId",
      })
      .populate({
        path: "requestedFor",
        select: "name",
      })
      .populate({
        path: "approvedBy",
        select:
          "fullname fullName name firstName lastName middleName employeeId",
      })
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: data,
      meta: { total, page, limit, totalPages },
    });
  } catch (error) {
    console.error("Error fetching approvals:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch approvals",
      error: error.message,
    });
  }
};

const getApproval = async (req, res) => {
  try {
    const data = await Approval.findById(req.params.id)
      .populate({
        path: "entityId",
        select: "title description type status",
      })
      .populate({
        path: "requestedBy",
        select: "firstName lastName middleName employeeId team",
        populate: {
          path: "team",
          select: "name",
        },
      })
      .populate({
        path: "requestedFor",
        select: "name",
      })
      .populate({
        path: "approvedBy",
        select: "firstName lastName middleName employeeId team",
        populate: {
          path: "team",
          select: "name",
        },
      });

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Approval not found",
      });
    }

    // Format the response
    const approval = data.toObject ? data.toObject() : { ...data };

    // Format requestedBy
    if (approval.requestedBy) {
      const user = approval.requestedBy;
      const name = [user.firstName, user.lastName].filter(Boolean).join(" ");

      // Get the first team if user has teams
      const userTeam =
        Array.isArray(user.team) && user.team.length > 0 ? user.team[0] : null;

      approval.requestedBy = {
        userId: user._id,
        name: name || "",
        team: userTeam
          ? {
              teamId: userTeam._id,
              name: userTeam.name || "",
            }
          : null,
      };
    }

    // Format requestedFor
    if (approval.requestedFor) {
      const team = approval.requestedFor;
      approval.requestedFor = {
        teamId: team._id,
        name: team.name || "",
      };
    }

    // Format approvedBy
    if (approval.approvedBy) {
      const user = approval.approvedBy;
      const name = [user.firstName, user.lastName].filter(Boolean).join(" ");

      // Get the first team if user has teams
      const userTeam =
        Array.isArray(user.team) && user.team.length > 0 ? user.team[0] : null;

      approval.approvedBy = {
        userId: user._id,
        name: name || "",
        team: userTeam
          ? {
              teamId: userTeam._id,
              name: userTeam.name || "",
            }
          : null,
      };
    }

    return res.status(200).json({
      success: true,
      data: approval,
    });
  } catch (error) {
    console.error("Error fetching approval:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch approval",
      error: error.message,
    });
  }
};

export { postApproval, getAllApprovals, getApproval };
