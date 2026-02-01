import Request from "./request.model.js";
import { Document } from "../documents/document.model.js";
import { VersionHistory } from "../documents/versionHistory/versionHistory.model.js";
import { User } from "../users/user.model.js";
import { FileType } from "../fileType/fileType.model.js";
import mongoose from "mongoose";

const postRequest = async (req, res) => {
  try {
    const { documentId, ...approvalData } = req.body;

    // Get userId from token
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Unauthorized: User not found",
      });
    }

    console.log(
      "postRequest - approvalData:",
      JSON.stringify(approvalData, null, 2),
    );

    // Check for duplicate document number if documentNumber exists in metadata
    if (approvalData.metadata?.documentNumber) {
      const documentNumber = approvalData.metadata.documentNumber
        .toString()
        .trim();

      console.log("Checking for duplicate document number:", documentNumber);

      if (!documentNumber) {
        return res.status(400).json({
          success: false,
          message: "Document number cannot be empty",
        });
      }

      // Escape special regex characters
      const escapedDocNumber = documentNumber.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );

      // Check for case-insensitive duplicate document number in Documents
      const existingDocument = await Document.findOne({
        "metadata.documentNumber": {
          $regex: new RegExp(`^${escapedDocNumber}$`, "i"),
        },
        deletedAt: null,
      });

      console.log("Existing document found:", existingDocument?._id);

      if (existingDocument) {
        return res.status(400).json({
          success: false,
          message: "Document number already exists in documents",
          documentNumber: documentNumber,
          existingDocumentId: existingDocument._id,
        });
      }

      // Check for case-insensitive duplicate document number in Requests (exclude DISCARD type)
      const existingRequest = await Request.findOne({
        "metadata.documentNumber": {
          $regex: new RegExp(`^${escapedDocNumber}$`, "i"),
        },
        type: { $ne: "DISCARD" },
      });

      console.log("Existing request found:", existingRequest?._id);

      if (existingRequest) {
        return res.status(400).json({
          success: false,
          message: "Document number already exists in pending requests",
          documentNumber: documentNumber,
          existingRequestId: existingRequest._id,
          existingRequestStatus: existingRequest.status,
          existingRequestType: existingRequest.type,
        });
      }

      // Update the document number with trimmed value
      approvalData.metadata.documentNumber = documentNumber;
    }

    // Create request with UPLOAD type and status -1
    const newRequest = new Request({
      ...approvalData,
      documentId: documentId || "",
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

    console.log("putRequestSubmit - Request ID:", id);

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request ID format",
      });
    }

    // Try to find the request by ID first, then by documentId
    let request = await Request.findById(id);

    // If not found by _id, try finding by documentId
    if (!request) {
      console.log("Request not found by _id, trying documentId...");
      request = await Request.findOne({ documentId: id });
    }

    console.log("putRequestSubmit - Request found:", request ? "Yes" : "No");

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

    // Update the parent document if documentId exists
    if (request.documentId && request.documentId.trim()) {
      try {
        console.log(
          "Looking for document with documentId:",
          request.documentId,
        );

        // Use findByIdAndUpdate to directly update the document
        const updatedDoc = await Document.findByIdAndUpdate(
          request.documentId,
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
          console.log("Document not found for documentId:", request.documentId);
        }
      } catch (docError) {
        console.error("Error updating document:", docError);
        // Don't fail the request submission if document update fails
      }
    } else {
      console.log("No valid documentId found in request");
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

    // Build filter
    const filter = {};

    // Check if type is "history" - if so, show all statuses and include DISCARD
    const isHistoryView = req.query.type === "history";

    // Filter by status (default to 0 and -1, unless history view)
    if (req.query.status !== undefined) {
      const statusParam = req.query.status;

      // Map string status to numeric values
      if (statusParam === "pending-approval") {
        filter.status = 0;
      } else if (statusParam === "approved") {
        filter.status = 1;
      } else if (statusParam === "draft" || statusParam === "rejected") {
        filter.status = -1;
      } else if (statusParam === "published") {
        filter.status = 2;
      } else {
        // Try to parse as number
        const parsedStatus = parseInt(statusParam, 10);
        if (!isNaN(parsedStatus)) {
          filter.status = parsedStatus;
        } else {
          // If not a valid string or number, use default
          filter.status = { $in: [0, -1, 1] };
        }
      }
    } else if (!isHistoryView) {
      // Only apply default status filter if not history view
      filter.status = { $in: [0, -1, 1] };
    }

    // Filter by type if provided, but exclude DISCARD unless history view
    if (req.query.type && req.query.type !== "history") {
      filter.type = req.query.type;
    } else if (!isHistoryView) {
      filter.type = { $ne: "DISCARD" };
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

    // Get total count
    const total = await Request.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    // Get requests with pagination
    const requests = await Request.find(filter)
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

    // Transform requests to include OwnerData and teamData
    const transformedRequests = await Promise.all(
      requests.map(async (request) => {
        const requestObj = request.toObject();
        let ownerData = null;
        let documentData = {
          id: "",
          title: "",
        };

        // Get document and owner data if documentId exists
        if (requestObj.documentId && requestObj.documentId.trim()) {
          try {
            const document = await Document.findById(
              requestObj.documentId,
            ).select("owner metadata title");

            if (document) {
              // Set documentData
              documentData = {
                id: document._id.toString(),
                title: document.title || "",
              };

              // Get owner data
              if (document.owner) {
                const owner = await User.findById(document.owner).select(
                  "fullname fullName name firstName lastName",
                );

                if (owner) {
                  const ownerName =
                    owner.fullname ||
                    owner.fullName ||
                    owner.name ||
                    `${owner.firstName || ""} ${owner.lastName || ""}`.trim();

                  ownerData = {
                    id: owner._id.toString(),
                    name: ownerName || "",
                  };
                }
              }

              // Transform metadata.team to teamData if it exists
              if (document.metadata?.team) {
                const team = document.metadata.team;
                let teamId;

                // Check if it's already an object with id property
                if (typeof team === "object" && team.id) {
                  teamId = team.id.toString();
                } else {
                  teamId = team.toString();
                }

                // Only transform if it's a valid ObjectId
                if (mongoose.Types.ObjectId.isValid(teamId)) {
                  const { Team } = await import("../teams/team.model.js");
                  const teamData =
                    await Team.findById(teamId).select("_id name");

                  if (teamData) {
                    requestObj.metadata = requestObj.metadata || {};
                    requestObj.metadata.teamData = {
                      id: teamData._id.toString(),
                      name: teamData.name || "",
                    };
                    // Remove the original team field
                    delete requestObj.metadata.team;
                  } else {
                    requestObj.metadata = requestObj.metadata || {};
                    requestObj.metadata.teamData = {
                      id: teamId,
                      name: "",
                    };
                    delete requestObj.metadata.team;
                  }
                } else {
                  // If invalid, set to null or empty object
                  requestObj.metadata = requestObj.metadata || {};
                  requestObj.metadata.teamData = {
                    id: null,
                    name: "",
                  };
                  delete requestObj.metadata.team;
                }
              }
            }
          } catch (err) {
            console.error("Error fetching document data:", err);
          }
        }

        // Remove documentId and add documentData
        const { documentId, ...restObj } = requestObj;

        return {
          ...restObj,
          documentData,
          OwnerData: ownerData,
        };
      }),
    );

    return res.status(200).json({
      success: true,
      message: "Requests retrieved successfully",
      data: transformedRequests,
      meta: { total, page, limit, totalPages },
    });
  } catch (error) {
    console.error("Error in getAllRequest:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve requests",
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

    // Get document data using documentId
    let documentData = {};
    if (request.documentId && request.documentId.trim()) {
      try {
        const document = await Document.findById(request.documentId);
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

    // Update the parent document if documentId exists
    if (request.documentId) {
      try {
        const document = await Document.findById(request.documentId);
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
    request.mode = "REJECT";
    request.reviewedBy = userId;
    request.reviewedDate = new Date();
    if (remarks !== undefined) {
      request.remarks = remarks;
    }

    await request.save();

    // Update the parent document if documentId exists
    if (request.documentId) {
      try {
        const document = await Document.findById(request.documentId);
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
    request.status = -1;
    request.mode = "DISCARD";
    request.deletedAt = new Date();

    await request.save();

    // Update the parent document if documentId exists
    if (request.documentId) {
      try {
        const document = await Document.findById(request.documentId);
        if (document) {
          // Find default fileType
          const defaultFileType = await FileType.findOne({
            isDefault: true,
          }).select("_id");

          document.status = -1;
          if (!document.metadata) {
            document.metadata = {};
          }
          document.metadata.checkedOut = 1;
          if (defaultFileType) {
            document.metadata.fileType = defaultFileType._id;
          }
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

    // Check if request has documentId (document to update)
    if (!request.documentId || request.documentId.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Request does not have a parent document",
      });
    }

    // Find the parent document
    const document = await Document.findById(request.documentId);

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
      documentId: request.documentId,
    });

    if (versionHistory) {
      // Add new version to existing history
      versionHistory.versionHistory.push(versionEntry);
      await versionHistory.save();
    } else {
      // Create new version history
      versionHistory = new VersionHistory({
        documentId: request.documentId,
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
