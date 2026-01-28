import Request from "./request.model.js";
import { Document } from "../documents/document.model.js";
import { VersionHistory } from "../documents/versionHistory/versionHistory.model.js";
import { User } from "../users/user.model.js";

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

    // Create request with UPLOAD type and status -1
    const newRequest = new Request({
      ...approvalData,
      type: "UPLOAD",
      status: -1,
      mode: "",
      requestedBy: userId,
    });

    await newRequest.save();

    // Populate the saved request
    const populatedRequest = await Request.findById(newRequest._id)
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
      message: "Request created successfully",
      data: populatedRequest,
    });
  } catch (error) {
    console.error("Error creating request:", error);
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

    // Find the request
    const request = await Request.findById(id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    // Update all fields from request body
    Object.keys(updateData).forEach((key) => {
      request[key] = updateData[key];
    });

    // Set required fields for submission
    request.type = "SUBMIT";
    request.status = 0;
    request.mode = "TEAM";

    await request.save();

    // Update the parent document if parentId exists
    if (request.parentId && request.parentId.trim()) {
      try {
        console.log("Looking for document with parentId:", request.parentId);

        // Use findByIdAndUpdate to directly update the document
        const updatedDoc = await Document.findByIdAndUpdate(
          request.parentId,
          {
            $set: {
              status: 0,
              "metadata.checkedOut": 0,
            },
          },
          { new: true, runValidators: false },
        );

        if (updatedDoc) {
          console.log("Document updated successfully:", updatedDoc.metadata);
        } else {
          console.log("Document not found for parentId:", request.parentId);
        }
      } catch (docError) {
        console.error("Error updating document:", docError);
        // Don't fail the request submission if document update fails
      }
    } else {
      console.log("No valid parentId found in request");
    }

    // Populate the updated request
    const populatedRequest = await Request.findById(id)
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
      message: "Request submitted successfully",
      data: populatedRequest,
    });
  } catch (error) {
    console.error("Error submitting request:", error);
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

    const total = await Request.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const data = await Request.find(filter)
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

    // Merge document data with each request
    const mergedData = await Promise.all(
      data.map(async (request) => {
        const requestObj = request.toObject();
        let documentData = {};

        // Fetch document data if parentId exists
        if (request.parentId && request.parentId.trim()) {
          try {
            const document = await Document.findById(request.parentId);
            if (document) {
              documentData = {
                title: document.title || "",
                description: document.description || "",
                metadata: document.metadata || {},
              };
            }
          } catch (err) {
            console.error(
              "Error fetching document for request:",
              request._id,
              err,
            );
          }
        }

        // Merge data: use request data if available, otherwise use document data
        return {
          ...requestObj,
          requestId: requestObj._id,
          mode: requestObj.mode || "",
          title: requestObj.title || documentData.title || "",
          description: requestObj.description || documentData.description || "",
          metadata: {
            ...documentData.metadata,
            ...requestObj.metadata,
          },
        };
      }),
    );

    return res.status(200).json({
      success: true,
      data: mergedData,
      meta: { total, page, limit, totalPages },
    });
  } catch (error) {
    console.error("Error fetching requests:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch requests",
      error: error.message,
    });
  }
};

const getRequest = async (req, res) => {
  try {
    const { id } = req.params;

    // Get request by ID
    const request = await Request.findById(id)
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

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    // Get document data using parentId
    let documentData = {};
    if (request.parentId && request.parentId.trim()) {
      try {
        const document = await Document.findById(request.parentId);
        if (document) {
          documentData = {
            title: document.title || "",
            description: document.description || "",
            metadata: document.metadata || {},
          };
        }
      } catch (err) {
        console.error("Error fetching document:", err);
      }
    }

    // Combine data with request data taking priority, but use document data if request data is blank
    const requestObj = request.toObject();
    const combinedData = {
      ...requestObj,
      requestId: requestObj._id,
      mode: requestObj.mode || "",
      title: requestObj.title || documentData.title || "",
      description: requestObj.description || documentData.description || "",
      metadata: {
        ...documentData.metadata,
        ...requestObj.metadata,
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

    // Find the request
    const request = await Request.findById(id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    // Update with approval fields
    request.type = "APPROVED";
    request.status = 1;
    request.mode = "CONTROLLER";
    request.reviewedBy = userId;
    request.reviewedDate = new Date();

    await request.save();

    // Update the parent document if parentId exists
    if (request.parentId) {
      try {
        const document = await Document.findById(request.parentId);
        if (document) {
          document.status = 0;
          if (!document.metadata) {
            document.metadata = {};
          }
          document.metadata.checkedOut = 0;
          document.markModified("metadata");
          await document.save();
        }
      } catch (docError) {
        console.error("Error updating document:", docError);
        // Don't fail the request approval if document update fails
      }
    }

    // Populate the updated request
    const populatedRequest = await Request.findById(id)
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
      data: populatedRequest,
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

    // Find the request
    const request = await Request.findById(id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    // Update with rejection fields
    request.type = "REJECT";
    request.status = -1;
    request.mode = "TEAM";
    request.reviewedBy = userId;
    request.reviewedDate = new Date();
    if (remarks !== undefined) {
      request.remarks = remarks;
    }

    await request.save();

    // Update the parent document if parentId exists
    if (request.parentId) {
      try {
        const document = await Document.findById(request.parentId);
        if (document) {
          document.status = -1;
          if (!document.metadata) {
            document.metadata = {};
          }
          document.metadata.checkedOut = 1;
          document.markModified("metadata");
          await document.save();
        }
      } catch (docError) {
        console.error("Error updating document:", docError);
        // Don't fail the request rejection if document update fails
      }
    }

    // Populate the updated request
    const populatedRequest = await Request.findById(id)
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
      data: populatedRequest,
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

    // Find the request
    const request = await Request.findById(id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    // Update with discard fields
    request.type = "DISCARD";
    request.status = -2;
    request.mode = "";
    request.deletedAt = new Date();

    await request.save();

    // Update the parent document if parentId exists
    if (request.parentId) {
      try {
        const document = await Document.findById(request.parentId);
        if (document) {
          document.status = 2;
          if (!document.metadata) {
            document.metadata = {};
          }
          document.metadata.checkedOut = 0;
          document.markModified("metadata");
          await document.save();
        }
      } catch (docError) {
        console.error("Error updating document:", docError);
        // Don't fail the request discard if document update fails
      }
    }

    // Populate the updated request
    const populatedRequest = await Request.findById(id)
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
      data: populatedRequest,
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

    // Find the request
    const request = await Request.findById(id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    // Check if request has parentId (document to update)
    if (!request.parentId) {
      return res.status(400).json({
        success: false,
        message: "Request does not have a parent document",
      });
    }

    // Find the parent document
    const document = await Document.findById(request.parentId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Parent document not found",
      });
    }

    // Get requester user data
    const requester = await User.findById(request.requestedBy);
    const requesterName = requester
      ? requester.fullname ||
        requester.fullName ||
        requester.name ||
        `${requester.firstName || ""} ${requester.lastName || ""}`.trim()
      : "";

    // Create version history entry with current document data
    const versionEntry = {
      title: document.title,
      description: document.description,
      metadata: document.metadata || {},
      ownerData: {
        userId: document.owner,
        name: requesterName,
      },
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };

    // Find or create version history for this document
    let versionHistory = await VersionHistory.findOne({
      documentId: request.parentId,
    });

    if (versionHistory) {
      // Add new version to existing history
      versionHistory.versionHistory.push(versionEntry);
      await versionHistory.save();
    } else {
      // Create new version history
      versionHistory = new VersionHistory({
        documentId: request.parentId,
        versionHistory: [versionEntry],
      });
      await versionHistory.save();
    }

    // Update the document with request data
    document.title = request.title || document.title;
    document.description = request.description || document.description;
    document.metadata = request.metadata || document.metadata;
    document.owner = request.requestedBy; // Update owner to the requester
    document.updatedAt = new Date();

    // Mark metadata as modified if it's a Mixed type
    if (document.metadata) {
      document.markModified("metadata");
    }

    await document.save();

    // Update request with publish fields
    request.type = "PUBLISH";
    request.status = 2;
    request.mode = "";
    request.publishedBy = userId;
    request.publishedDate = new Date();

    await request.save();

    // Populate the updated request
    const populatedRequest = await Request.findById(id)
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
      data: populatedRequest,
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
