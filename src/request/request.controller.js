import Approval from "./request.model.js";
import { Document } from "../documents/document.model.js";

const postRequest = async (req, res) => {
  try {
    const { ...approvalData } = req.body;

    // Get userId from token
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found",
      });
    }

    // Validate required fields
    if (!approvalData.title) {
      return res.status(400).json({
        success: false,
        message: "Title is required",
      });
    }

    // Create approval with UPLOAD type and status -1
    const newApproval = new Approval({
      ...approvalData,
      type: "UPLOAD",
      status: -1,
      mode: "",
      requestedBy: userId,
    });

    await newApproval.save();

    // Populate the saved approval
    const populatedApproval = await Approval.findById(newApproval._id)
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
        path: "reviewedBy",
        select:
          "fullname fullName name firstName lastName middleName employeeId",
      })
      .populate({
        path: "publishedBy",
        select:
          "fullname fullName name firstName lastName middleName employeeId",
      });

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

const putRequestSubmit = async (req, res) => {
  try {
    const { id } = req.params;
    const { ...updateData } = req.body;

    // Find the approval
    const approval = await Approval.findById(id);

    if (!approval) {
      return res.status(404).json({
        success: false,
        message: "Approval not found",
      });
    }

    // Update all fields from request body
    Object.keys(updateData).forEach((key) => {
      approval[key] = updateData[key];
    });

    // Set required fields for submission
    approval.type = "SUBMIT";
    approval.status = 0;
    approval.mode = "TEAM";

    await approval.save();

    // Populate the updated approval
    const populatedApproval = await Approval.findById(id)
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
        path: "reviewedBy",
        select:
          "fullname fullName name firstName lastName middleName employeeId",
      })
      .populate({
        path: "publishedBy",
        select:
          "fullname fullName name firstName lastName middleName employeeId",
      });

    return res.status(200).json({
      success: true,
      message: "Approval submitted successfully",
      data: populatedApproval,
    });
  } catch (error) {
    console.error("Error submitting approval:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit approval",
      error: error.message,
    });
  }
};

const getAllRequest = async (req, res) => {
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

    // Filter by type if provided
    if (req.query.type) {
      filter.type = req.query.type;
    }

    // Filter by mode if provided
    if (req.query.mode) {
      filter.mode = req.query.mode;
    }

    // Filter by requestedBy if provided
    if (req.query.requestedBy) {
      filter.requestedBy = req.query.requestedBy;
    }

    // Filter by requestedFor if provided
    if (req.query.requestedFor) {
      filter.requestedFor = req.query.requestedFor;
    }

    // Filter by parentId if provided
    if (req.query.parentId) {
      filter.parentId = req.query.parentId;
    }

    const total = await Approval.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const data = await Approval.find(filter)
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
        path: "reviewedBy",
        select:
          "fullname fullName name firstName lastName middleName employeeId",
      })
      .populate({
        path: "publishedBy",
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

const getRequest = async (req, res) => {
  try {
    const { id } = req.params;

    // Get approval by ID
    const approval = await Approval.findById(id)
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
        path: "reviewedBy",
        select:
          "fullname fullName name firstName lastName middleName employeeId",
      })
      .populate({
        path: "publishedBy",
        select:
          "fullname fullName name firstName lastName middleName employeeId",
      });

    if (!approval) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    // Get document data using parentId
    let documentData = {};
    if (approval.parentId) {
      const document = await Document.findById(approval.parentId);
      if (document) {
        documentData = {
          title: document.title || "",
          description: document.description || "",
          metadata: document.metadata || {},
        };
      }
    }

    // Combine data with approval taking priority
    const combinedData = {
      ...approval.toObject(),
      title: approval.title || documentData.title || "",
      description: approval.description || documentData.description || "",
      metadata: {
        ...documentData.metadata,
        ...approval.metadata,
      },
    };

    return res.status(200).json({
      success: true,
      data: combinedData,
    });
  } catch (error) {
    console.error("Error fetching request:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch request",
      error: error.message,
    });
  }
};

const putRequestApproved = async (req, res) => {
  try {
    const { id } = req.params;

    // Get userId from token
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found",
      });
    }

    // Find the approval
    const approval = await Approval.findById(id);

    if (!approval) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    // Update with approval fields
    approval.type = "APPROVED";
    approval.status = 1;
    approval.mode = "CONTROLLER";
    approval.reviewedBy = userId;
    approval.reviewedDate = new Date();

    await approval.save();

    // Populate the updated approval
    const populatedApproval = await Approval.findById(id)
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
        path: "reviewedBy",
        select:
          "fullname fullName name firstName lastName middleName employeeId",
      })
      .populate({
        path: "publishedBy",
        select:
          "fullname fullName name firstName lastName middleName employeeId",
      });

    return res.status(200).json({
      success: true,
      message: "Request approved successfully",
      data: populatedApproval,
    });
  } catch (error) {
    console.error("Error approving request:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to approve request",
      error: error.message,
    });
  }
};

const putRequestReject = async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;

    // Get userId from token
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found",
      });
    }

    // Find the approval
    const approval = await Approval.findById(id);

    if (!approval) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    // Update with rejection fields
    approval.type = "REJECT";
    approval.status = -1;
    approval.mode = "TEAM";
    approval.reviewedBy = userId;
    approval.reviewedDate = new Date();
    if (remarks !== undefined) {
      approval.remarks = remarks;
    }

    await approval.save();

    // Populate the updated approval
    const populatedApproval = await Approval.findById(id)
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
        path: "reviewedBy",
        select:
          "fullname fullName name firstName lastName middleName employeeId",
      })
      .populate({
        path: "publishedBy",
        select:
          "fullname fullName name firstName lastName middleName employeeId",
      });

    return res.status(200).json({
      success: true,
      message: "Request rejected successfully",
      data: populatedApproval,
    });
  } catch (error) {
    console.error("Error rejecting request:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reject request",
      error: error.message,
    });
  }
};

const putRequestDiscard = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the approval
    const approval = await Approval.findById(id);

    if (!approval) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    // Update with discard fields
    approval.type = "DISCARD";
    approval.status = -2;
    approval.mode = "";
    approval.deletedAt = new Date();

    await approval.save();

    // Populate the updated approval
    const populatedApproval = await Approval.findById(id)
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
        path: "reviewedBy",
        select:
          "fullname fullName name firstName lastName middleName employeeId",
      })
      .populate({
        path: "publishedBy",
        select:
          "fullname fullName name firstName lastName middleName employeeId",
      });

    return res.status(200).json({
      success: true,
      message: "Request discarded successfully",
      data: populatedApproval,
    });
  } catch (error) {
    console.error("Error discarding request:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to discard request",
      error: error.message,
    });
  }
};

const putRequestPublish = async (req, res) => {
  try {
    const { id } = req.params;

    // Get userId from token
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found",
      });
    }

    // Find the approval
    const approval = await Approval.findById(id);

    if (!approval) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    // Update with publish fields
    approval.type = "PUBLISH";
    approval.status = 2;
    approval.mode = "";
    approval.publishedBy = userId;
    approval.publishedDate = new Date();

    await approval.save();

    // Populate the updated approval
    const populatedApproval = await Approval.findById(id)
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
        path: "reviewedBy",
        select:
          "fullname fullName name firstName lastName middleName employeeId",
      })
      .populate({
        path: "publishedBy",
        select:
          "fullname fullName name firstName lastName middleName employeeId",
      });

    return res.status(200).json({
      success: true,
      message: "Request published successfully",
      data: populatedApproval,
    });
  } catch (error) {
    console.error("Error publishing request:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to publish request",
      error: error.message,
    });
  }
};

export {
  postRequest,
  putRequestSubmit,
  getAllRequest,
  getRequest,
  putRequestApproved,
  putRequestReject,
  putRequestDiscard,
  putRequestPublish,
};
