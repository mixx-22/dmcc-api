import { Document } from "../documents/document.model.js";
import { RecentDocs } from "../documentLogs/recentDocuments/recentDocs.model.js";
import { postAuditTrailLog } from "../documentLogs/auditTrail/auditTrail.controller.js";
import { FileType } from "../fileType/fileType.model.js";
import {
  putFileTeamStat,
  removeFileTeamStat,
} from "../teams/team-stat/teamstat.controller.js";
import Request from "../requests/request.model.js";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const postDocument = async (req, res) => {
  try {
    // Handle both JSON and form-data
    let permissionOverrides, metadata, privacy;

    // If privacy is a string (from form-data), parse it
    if (req.body.privacy) {
      if (typeof req.body.privacy === "string") {
        try {
          privacy = JSON.parse(req.body.privacy);
        } catch (error) {
          return res.status(400).json({
            success: false,
            message:
              'Invalid JSON format for \'privacy\' field. Example: {"users":[],"teams":[],"roles":[]}',
            error: error.message,
          });
        }
      } else {
        privacy = req.body.privacy;
      }
    }

    // If permissionOverrides is a string (from form-data), parse it
    if (req.body.permissionOverrides) {
      if (typeof req.body.permissionOverrides === "string") {
        try {
          permissionOverrides = JSON.parse(req.body.permissionOverrides);
        } catch (error) {
          return res.status(400).json({
            success: false,
            message:
              'Invalid JSON format for \'permissionOverrides\' field. Example: {"readOnly":1,"restricted":1}',
            error: error.message,
          });
        }
      } else {
        permissionOverrides = req.body.permissionOverrides;
      }
    }

    // If metadata is a string (from form-data), parse it
    if (req.body.metadata) {
      if (typeof req.body.metadata === "string") {
        try {
          metadata = JSON.parse(req.body.metadata);
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: "Invalid JSON format for 'metadata' field",
            error: error.message,
          });
        }
      } else {
        metadata = req.body.metadata;
      }
    }

    const { title, description, type, status, parentId } = req.body;

    // Validate required fields
    if (!type) {
      return res.status(400).json({
        success: false,
        message: "Document type is required",
      });
    }

    // Get owner from authenticated user
    const owner = req.user?._id || req.user?.id;
    if (!owner) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    // Validate type enum
    const validTypes = [
      "file",
      "folder",
      "auditSchedule",
      "formTemplate",
      "formResponse",
    ];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
      });
    }

    // If parentId is provided, verify it exists
    if (parentId) {
      const parentDoc = await Document.findById(parentId);
      if (!parentDoc) {
        return res.status(404).json({
          success: false,
          message: "Parent document not found",
        });
      }
      if (parentDoc.type !== "folder") {
        return res.status(400).json({
          success: false,
          message: "Parent document must be of type 'folder'",
        });
      }
    }

    // Use metadata as provided (expects key to be in metadata)
    let finalMetadata = metadata || {};

    console.log(
      "postDocument - finalMetadata:",
      JSON.stringify(finalMetadata, null, 2),
    );

    // Check for duplicate document number if documentNumber exists in metadata
    if (finalMetadata.documentNumber) {
      const documentNumber = finalMetadata.documentNumber.toString().trim();

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

      console.log("Escaped document number:", escapedDocNumber);

      // Check for case-insensitive duplicate document number in Documents
      const existingDocument = await Document.findOne({
        "metadata.documentNumber": {
          $regex: new RegExp(`^${escapedDocNumber}$`, "i"),
        },
        deletedAt: null,
      });

      console.log("Existing document found:", existingDocument?._id);
      if (existingDocument) {
        console.log(
          "Existing document number:",
          existingDocument.metadata?.documentNumber,
        );
      }

      if (existingDocument) {
        console.log("RETURNING 400 ERROR - DUPLICATE FOUND");
        return res.status(400).json({
          success: false,
          message: `Document number(s) already exist in the system: ${existingDocument.metadata?.documentNumber}. Please use unique value.`,
          documentNumber: documentNumber,
          existingDocumentId: existingDocument._id,
          existingDocumentNumber: existingDocument.metadata?.documentNumber,
        });
      }

      console.log("No existing document found, continuing...");

      // Check for case-insensitive duplicate document number in Requests (exclude DISCARD and PUBLISH type)
      const existingRequest = await Request.findOne({
        "metadata.documentNumber": {
          $regex: new RegExp(`^${escapedDocNumber}$`, "i"),
        },
        type: { $nin: ["DISCARD", "PUBLISH"] },
      });

      console.log("Existing request found:", existingRequest?._id);
      if (existingRequest) {
        console.log(
          "Existing request number:",
          existingRequest.metadata?.documentNumber,
        );
        console.log("Existing request type:", existingRequest.type);
      }

      if (existingRequest) {
        return res.status(400).json({
          success: false,
          message: `Document number(s) already exist in the system: ${existingRequest.metadata?.documentNumber}. Please use unique value.`,
          documentNumber: documentNumber,
          existingRequestId: existingRequest._id,
          existingRequestNumber: existingRequest.metadata?.documentNumber,
          existingRequestType: existingRequest.type,
        });
      }

      // Update the document number with trimmed value
      finalMetadata.documentNumber = documentNumber;
      console.log("Document number validation passed");
    } else {
      console.log("No document number provided in metadata");
    }

    // Set default checkedOut value for file type
    if (type === "file" && finalMetadata.checkedOut === undefined) {
      finalMetadata.checkedOut = 1;
    }

    // Set default fileType if not provided for file type
    if (type === "file" && !finalMetadata.fileType) {
      const defaultFileType = await FileType.findOne({
        isDefault: true,
        deletedAt: null,
      });
      if (defaultFileType) {
        finalMetadata.fileType = defaultFileType._id;
      }
    }

    // Create new document
    const newDocument = new Document({
      title,
      description,
      type,
      status:
        type === "file" && (status === undefined || status === 0)
          ? -1
          : status !== undefined
            ? status
            : -1,
      parentId: parentId || null,
      owner,
      privacy: privacy || { users: [], teams: [], roles: [] },
      permissionOverrides: permissionOverrides || {
        readOnly: 1,
        restricted: 1,
      },
      metadata: finalMetadata,
    });

    // Save document
    const savedDocument = await newDocument.save();

    // Log document creation to audit trail
    await postAuditTrailLog(
      "C",
      savedDocument._id,
      "DOCUMENTS",
      `Document created: ${savedDocument.title}`,
      {
        id: owner,
        name: req.user
          ? `${req.user.firstName} ${req.user.lastName}`
          : "Unknown User",
      },
      JSON.stringify({
        title: savedDocument.title,
        type: savedDocument.type,
        key: finalMetadata?.key,
      }),
    );

    // Add document to team stats if privacy.teams exists
    if (
      savedDocument.privacy &&
      savedDocument.privacy.teams &&
      savedDocument.privacy.teams.length > 0
    ) {
      try {
        for (const teamId of savedDocument.privacy.teams) {
          await putFileTeamStat(teamId, savedDocument._id);
        }
      } catch (error) {
        console.error("Error updating team stats:", error);
        // Don't fail the request if team stat update fails
      }
    }

    // Create request entry for the document (only for file type with quality documents)
    if (savedDocument.type === "file" && savedDocument.metadata?.fileType) {
      try {
        const fileType = await FileType.findById(
          savedDocument.metadata.fileType,
        );
        console.log("FileType found:", fileType);
        console.log("isQualityDocument:", fileType?.isQualityDocument);

        if (fileType && fileType.isQualityDocument === true) {
          const newRequest = new Request({
            documentId: savedDocument._id.toString(),
            title: savedDocument.title || "",
            description: savedDocument.description || "",
            metadata: savedDocument.metadata || {},
            type: "UPLOAD",
            status: -1,
            mode: "NEW",
            requestedBy: owner,
          });
          const savedRequest = await newRequest.save();
          console.log("Request created successfully:", savedRequest._id);
        } else {
          console.log("Request not created - isQualityDocument is not true");
        }
      } catch (error) {
        console.error("Error creating request:", error);
        console.error("Error stack:", error.stack);
        // Don't fail the document creation if request creation fails
      }
    } else {
      console.log(
        "Request not created - conditions not met. Type:",
        savedDocument.type,
        "FileType:",
        savedDocument.metadata?.fileType,
      );
    }

    // Return without populating for now to isolate the issue
    return res.status(201).json({
      success: true,
      message: "Document created successfully",
      data: savedDocument,
    });
  } catch (error) {
    console.error("Error in postDocument:", error);

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
      message: "Failed to create document",
      error: error.message,
    });
  }
};

const buildDateFilter = (dateRange, startDate, endDate) => {
  if (!dateRange) return {};

  const startOfDay = (d) => new Date(d.setHours(0, 0, 0, 0));
  const endOfDay = (d) => new Date(d.setHours(23, 59, 59, 999));

  const now = new Date();

  switch (dateRange) {
    case "today":
      return {
        createdAt: {
          $gte: startOfDay(new Date()),
          $lte: endOfDay(new Date()),
        },
      };

    case "last7days":
      return {
        createdAt: {
          $gte: startOfDay(new Date(now.setDate(now.getDate() - 7))),
        },
      };

    case "last30days":
      return {
        createdAt: {
          $gte: startOfDay(new Date(now.setDate(now.getDate() - 30))),
        },
      };

    case "thisYear":
      return {
        createdAt: {
          $gte: new Date(new Date().getFullYear(), 0, 1),
        },
      };

    case "lastYear":
      const y = new Date().getFullYear() - 1;
      return {
        createdAt: {
          $gte: new Date(y, 0, 1),
          $lte: new Date(y, 11, 31, 23, 59, 59, 999),
        },
      };

    case "custom":
      if (!startDate || !endDate) {
        throw new Error("startDate and endDate are required");
      }

      const start = startOfDay(new Date(startDate));
      const end = endOfDay(new Date(endDate));

      if (isNaN(start) || isNaN(end)) {
        throw new Error("Invalid date format");
      }

      if (start > end) {
        throw new Error("startDate must be <= endDate");
      }

      return { createdAt: { $gte: start, $lte: end } };

    default:
      throw new Error("Invalid dateRange");
  }
};

const buildAccessFilter = (user) => {
  if (!user) return { _id: null };

  const userId = user._id;

  const userTeamIds = (user.team || [])
    .map((t) => new mongoose.Types.ObjectId(t.id || t._id))
    .filter(Boolean);

  const userRoleIds = (user.role || [])
    .map(
      (r) =>
        new mongoose.Types.ObjectId(typeof r === "object" ? r.id || r._id : r),
    )
    .filter(Boolean);

  const accessConditions = {
    $or: [
      { owner: userId },
      { "privacy.users": userId },
      { "privacy.teams": { $in: userTeamIds } },
      { "privacy.roles": { $in: userRoleIds } },
    ],
  };

  return {
    $or: [
      // PUBLIC DOCUMENTS
      { "permissionOverrides.restricted": 0 },

      // RESTRICTED DOCUMENTS
      {
        $and: [
          { "permissionOverrides.restricted": 1 },
          {
            $or: [
              accessConditions,

              // fallback: treat empty privacy as public (optional rule)
              {
                $and: [
                  { "privacy.users.0": { $exists: false } },
                  { "privacy.teams.0": { $exists: false } },
                  { "privacy.roles.0": { $exists: false } },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
};

const normalizeFileTypeId = (fileType) => {
  if (!fileType) return null;

  const id =
    typeof fileType === "object" && fileType.id
      ? fileType.id.toString()
      : fileType.toString();

  return mongoose.isValidObjectId(id) ? id : null;
};

const mapFileTypes = (documents, fileTypesMap) =>
  documents.map((doc) => {
    if (doc.type !== "file" || !doc.metadata?.fileType) return doc;

    const id = normalizeFileTypeId(doc.metadata.fileType);

    doc.metadata.fileType = {
      id,
      name: id && fileTypesMap[id] ? fileTypesMap[id].name : "",
    };

    return doc;
  });

const logRecentAccess = async (userId, documentId, type) => {
  if (!userId) return;

  try {
    const existing = await RecentDocs.findOne({ userId, documentId });

    if (existing) {
      existing.accessedAt = new Date();
      existing.count += 1;
      existing.documentType = type;
      return existing.save();
    }

    return new RecentDocs({
      userId,
      documentId,
      documentType: type,
      accessedAt: new Date(),
      count: 1,
    }).save();
  } catch (err) {
    console.error("RecentDocs log failed:", err);
  }
};

const getDocuments = async (req, res) => {
  try {
    const {
      keyword,
      folder,
      type,
      sortBy = "title",
      sortOrder = "asc",
      dateRange,
      startDate,
      endDate,
    } = req.query;

    const accessFilter = buildAccessFilter(req.user);

    const baseFilter = {
      deletedAt: null,
      ...buildDateFilter(dateRange, startDate, endDate),
      ...(type && { type }),

      $and: [
        accessFilter,

        folder
          ? { parentId: new mongoose.Types.ObjectId(folder) }
          : keyword?.trim()
            ? {
                $or: [
                  { title: { $regex: keyword, $options: "i" } },
                  { description: { $regex: keyword, $options: "i" } },
                  {
                    "metadata.fileName": {
                      $regex: keyword,
                      $options: "i",
                    },
                  },
                ],
              }
            : { parentId: null },
      ],
    };

    let folderInfo = null;

    if (folder) {
      folderInfo = await Document.findOne({
        _id: folder,
        deletedAt: null,
      })
        .populate("owner", "firstName lastName email")
        .populate("privacy.users", "firstName lastName email")
        .populate("privacy.teams", "name")
        .populate("privacy.roles", "title")
        .lean();

      if (!folderInfo) {
        return res.status(404).json({
          success: false,
          message: "Folder not found",
        });
      }

      await logRecentAccess(req.user?._id, folder, folderInfo.type);
    }

    let documents = await Document.find(baseFilter)
      .populate("owner", "firstName lastName email")
      .populate("privacy.users", "firstName lastName email")
      .populate("privacy.teams", "name")
      .populate("privacy.roles", "title")
      .lean();

    // SORT (folders first)
    const sortDir = sortOrder === "desc" ? -1 : 1;

    documents.sort((a, b) => {
      if (a.type === "folder" && b.type !== "folder") return -1;
      if (a.type !== "folder" && b.type === "folder") return 1;

      return a[sortBy] < b[sortBy] ? sortDir : -sortDir;
    });

    // FILE TYPE ENRICHMENT
    const fileTypeIds = [
      ...new Set(
        documents
          .map((d) => d.metadata?.fileType)
          .filter(Boolean)
          .map((id) =>
            new mongoose.isValidObjectId(id) ? id.toString() : null,
          )
          .filter(Boolean),
      ),
    ];

    const fileTypes = await FileType.find({
      _id: { $in: fileTypeIds },
    })
      .select("_id name")
      .lean();

    const fileTypeMap = Object.fromEntries(
      fileTypes.map((ft) => [ft._id.toString(), ft]),
    );

    documents = documents.map((doc) => {
      if (doc.type === "file" && doc.metadata?.fileType) {
        const id = doc.metadata.fileType?.toString?.();

        doc.metadata.fileType = {
          id,
          name: fileTypeMap[id]?.name || "",
        };
      }
      return doc;
    });

    return res.status(200).json({
      success: true,
      message: "Documents retrieved successfully",
      data: {
        documents,
        ...(folderInfo && { folder: folderInfo }),
      },
    });
  } catch (error) {
    console.error("getDocuments error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve documents",
    });
  }
};

const getDocument = async (req, res) => {
  try {
    const { id } = req.params;

    // Find document by ID with all fields including metadata (exclude soft-deleted)
    const document = await Document.findOne({
      _id: id,
      deletedAt: null,
    })
      .populate("owner", "firstName lastName email")
      .populate("privacy.users", "firstName lastName email")
      .populate("privacy.teams", "name")
      .populate("privacy.roles", "title");

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Log document access in recent documents
    const userId = req.user?._id || req.user?.id;
    if (userId) {
      try {
        const existingRecord = await RecentDocs.findOne({
          userId,
          documentId: id,
        });

        if (existingRecord) {
          existingRecord.accessedAt = new Date();
          existingRecord.count += 1;
          existingRecord.documentType = document.type;
          await existingRecord.save();
        } else {
          const newRecord = new RecentDocs({
            userId,
            documentId: id,
            documentType: document.type,
            accessedAt: new Date(),
            count: 1,
          });
          await newRecord.save();
        }
      } catch (logError) {
        console.error("Error logging recent document:", logError);
        // Don't fail the request if logging fails
      }
    }

    // If it's a folder, fetch its contents
    let responseData = document.toObject();

    // Transform fileType for file documents
    if (document.type === "file" && responseData.metadata?.fileType) {
      const fileType = responseData.metadata.fileType;
      let fileTypeId;

      // Check if it's already an object with id property
      if (typeof fileType === "object" && fileType.id) {
        fileTypeId = fileType.id.toString();
      } else {
        fileTypeId = fileType.toString();
      }

      // Skip transformation if fileType is "document" (legacy string value)
      if (fileTypeId === "document") {
        responseData.metadata.fileType = {
          id: null,
          name: "document",
          isQualityDocument: false,
          requiresApproval: false,
          trackVersioning: false,
        };
      } else if (mongoose.Types.ObjectId.isValid(fileTypeId)) {
        // Only query if it's a valid ObjectId
        const fileTypeData = await FileType.findById(fileTypeId)
          .select("_id name isQualityDocument requiresApproval trackVersioning")
          .lean();

        if (fileTypeData) {
          responseData.metadata.fileType = {
            id: fileTypeData._id,
            name: fileTypeData.name || "",
            isQualityDocument: fileTypeData.isQualityDocument || false,
            requiresApproval: fileTypeData.requiresApproval || false,
            trackVersioning: fileTypeData.trackVersioning || false,
          };
        } else {
          // FileType not found, try to get default fileType
          const defaultFileType = await FileType.findOne({ isDefault: true })
            .select(
              "_id name isQualityDocument requiresApproval trackVersioning",
            )
            .lean();

          if (defaultFileType) {
            responseData.metadata.fileType = {
              id: defaultFileType._id,
              name: defaultFileType.name || "",
              isQualityDocument: defaultFileType.isQualityDocument || false,
              requiresApproval: defaultFileType.requiresApproval || false,
              trackVersioning: defaultFileType.trackVersioning || false,
            };
          } else {
            responseData.metadata.fileType = {
              id: fileTypeId,
              name: "",
              isQualityDocument: false,
              requiresApproval: false,
              trackVersioning: false,
            };
          }
        }
      } else {
        // Invalid ObjectId, try to get default fileType
        const defaultFileType = await FileType.findOne({ isDefault: true })
          .select("_id name isQualityDocument requiresApproval trackVersioning")
          .lean();

        if (defaultFileType) {
          responseData.metadata.fileType = {
            id: defaultFileType._id,
            name: defaultFileType.name || "",
            isQualityDocument: defaultFileType.isQualityDocument || false,
            requiresApproval: defaultFileType.requiresApproval || false,
            trackVersioning: defaultFileType.trackVersioning || false,
          };
        } else {
          responseData.metadata.fileType = {
            id: null,
            name: "",
            isQualityDocument: false,
            requiresApproval: false,
            trackVersioning: false,
          };
        }
      }
    }

    if (document.type === "folder") {
      const children = await Document.find({
        parentId: document._id,
        deletedAt: null,
      })
        .populate("owner", "firstName lastName email")
        .populate("privacy.users", "firstName lastName email")
        .populate("privacy.teams", "name")
        .populate("privacy.roles", "title")
        .lean();

      // Collect unique fileType IDs from file children
      const fileTypeIds = [
        ...new Set(
          children
            .filter(
              (child) => child.type === "file" && child.metadata?.fileType,
            )
            .map((child) => {
              const fileType = child.metadata.fileType;
              let id;

              // Check if it's already an object with id property
              if (typeof fileType === "object" && fileType.id) {
                id = fileType.id.toString();
              } else {
                id = fileType.toString();
              }

              // Validate ObjectId format
              return mongoose.isValidObjectId(id) ? id : null;
            })
            .filter((id) => id !== null), // Remove invalid IDs
        ),
      ];

      // Fetch all fileTypes in one query
      let fileTypesMap = {};
      if (fileTypeIds.length > 0) {
        const fileTypes = await FileType.find({ _id: { $in: fileTypeIds } })
          .select("_id name isQualityDocument requiresApproval trackVersioning")
          .lean();

        fileTypes.forEach((ft) => {
          fileTypesMap[ft._id.toString()] = ft;
        });
      }

      // Get default fileType for fallback
      const defaultFileType = await FileType.findOne({ isDefault: true })
        .select("_id name isQualityDocument requiresApproval trackVersioning")
        .lean();

      // Transform fileType for file children
      const transformedChildren = children.map((child) => {
        if (child.type === "file" && child.metadata?.fileType) {
          const fileType = child.metadata.fileType;
          let fileTypeId;

          // Check if it's already an object with id property
          if (typeof fileType === "object" && fileType.id) {
            fileTypeId = fileType.id.toString();
          } else {
            fileTypeId = fileType.toString();
          }

          // Skip transformation if fileType is "document" (legacy string value)
          if (fileTypeId === "document") {
            child.metadata.fileType = {
              id: null,
              name: "document",
              isQualityDocument: false,
              requiresApproval: false,
              trackVersioning: false,
            };
          } else if (mongoose.Types.ObjectId.isValid(fileTypeId)) {
            // Only transform if it's a valid ObjectId
            const fileTypeData = fileTypesMap[fileTypeId];

            if (fileTypeData) {
              child.metadata.fileType = {
                id: fileTypeData._id,
                name: fileTypeData.name || "",
                isQualityDocument: fileTypeData.isQualityDocument || false,
                requiresApproval: fileTypeData.requiresApproval || false,
                trackVersioning: fileTypeData.trackVersioning || false,
              };
            } else {
              // FileType not found, use default fileType
              if (defaultFileType) {
                child.metadata.fileType = {
                  id: defaultFileType._id,
                  name: defaultFileType.name || "",
                  isQualityDocument: defaultFileType.isQualityDocument || false,
                  requiresApproval: defaultFileType.requiresApproval || false,
                  trackVersioning: defaultFileType.trackVersioning || false,
                };
              } else {
                child.metadata.fileType = {
                  id: fileTypeId,
                  name: "",
                  isQualityDocument: false,
                  requiresApproval: false,
                  trackVersioning: false,
                };
              }
            }
          } else {
            // Invalid ObjectId, use default fileType
            if (defaultFileType) {
              child.metadata.fileType = {
                id: defaultFileType._id,
                name: defaultFileType.name || "",
                isQualityDocument: defaultFileType.isQualityDocument || false,
                requiresApproval: defaultFileType.requiresApproval || false,
                trackVersioning: defaultFileType.trackVersioning || false,
              };
            } else {
              child.metadata.fileType = {
                id: null,
                name: "",
                isQualityDocument: false,
                requiresApproval: false,
                trackVersioning: false,
              };
            }
          }
        }
        return child;
      });

      responseData.children = transformedChildren;
    }

    // If document has a parent, fetch parent information
    let parentData = null;
    if (document.parentId) {
      const parent = await Document.findOne({
        _id: document.parentId,
        deletedAt: null,
      })
        .select("_id title parentId")
        .lean();

      if (parent) {
        parentData = {
          id: parent._id,
          title: parent.title,
          ParentId: parent.parentId || null,
        };
        // Replace parentId with parentData in response
        responseData.parentData = parentData;
        delete responseData.parentId;
      }
    }

    // Check if there's a request associated with this document
    let requestId = null;
    let mode = null;
    try {
      const request = await Request.findOne({
        documentId: document._id.toString(),
      })
        .select("_id mode")
        .lean();

      if (request) {
        requestId = request._id.toString();
        mode = request.mode || null;
      }
    } catch (requestError) {
      console.error("Error fetching request:", requestError);
      // Don't fail the document retrieval if request lookup fails
    }

    // Add requestData to response
    responseData.requestData = {
      requestId: requestId || "",
      mode: mode || "",
    };

    // Log document retrieval to audit trail
    await postAuditTrailLog(
      "R",
      document._id,
      "DOCUMENTS",
      `Document accessed: ${document.title}`,
      {
        id: req.user?._id || req.user?.id || "Unknown",
        name: req.user
          ? `${req.user.firstName} ${req.user.lastName}`
          : "Unknown User",
      },
      JSON.stringify({
        documentTitle: document.title,
        documentType: document.type,
      }),
    );

    return res.status(200).json({
      success: true,
      message: "Document retrieved successfully",
      data: responseData,
    });
  } catch (error) {
    console.error("Error in getDocument:", error);

    // Handle cast errors (invalid ObjectId)
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid document ID format",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve document",
      error: error.message,
    });
  }
};

const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;

    // Find document by ID (exclude already soft-deleted documents)
    const document = await Document.findOne({ _id: id, deletedAt: null });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Update deletedAt to current date (soft delete)
    document.deletedAt = new Date();
    await document.save();

    // Log document deletion to audit trail
    await postAuditTrailLog(
      "D",
      document._id,
      "DOCUMENTS",
      `Document deleted: ${document.title}`,
      {
        id: req.user?._id || req.user?.id || "Unknown",
        name: req.user
          ? `${req.user.firstName} ${req.user.lastName}`
          : "Unknown User",
      },
      JSON.stringify({
        documentTitle: document.title,
        documentType: document.type,
        deletedAt: document.deletedAt,
      }),
    );

    return res.status(200).json({
      success: true,
      message: "Document deleted successfully",
      data: document,
    });
  } catch (error) {
    console.error("Error in deleteDocument:", error);

    // Handle cast errors (invalid ObjectId)
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid document ID format",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to delete document",
      error: error.message,
    });
  }
};

const updateDocument = async (req, res) => {
  try {
    const { id } = req.params;

    // Find document by ID (exclude soft-deleted documents)
    const document = await Document.findOne({ _id: id, deletedAt: null });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Parse JSON fields from form-data if they exist
    let permissionOverrides, metadata, privacy;

    if (req.body.privacy) {
      if (typeof req.body.privacy === "string") {
        try {
          privacy = JSON.parse(req.body.privacy);
        } catch (error) {
          return res.status(400).json({
            success: false,
            message:
              'Invalid JSON format for \'privacy\' field. Example: {"users":[],"teams":[],"roles":[]}',
            error: error.message,
          });
        }
      } else {
        privacy = req.body.privacy;
      }
    }

    if (req.body.permissionOverrides) {
      if (typeof req.body.permissionOverrides === "string") {
        try {
          permissionOverrides = JSON.parse(req.body.permissionOverrides);
        } catch (error) {
          return res.status(400).json({
            success: false,
            message:
              'Invalid JSON format for \'permissionOverrides\' field. Example: {"readOnly":1,"restricted":1}',
            error: error.message,
          });
        }
      } else {
        permissionOverrides = req.body.permissionOverrides;
      }
    }

    if (req.body.metadata) {
      if (typeof req.body.metadata === "string") {
        try {
          metadata = JSON.parse(req.body.metadata);
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: "Invalid JSON format for 'metadata' field",
            error: error.message,
          });
        }
      } else {
        metadata = req.body.metadata;
      }
    }

    const { title, description, type, status, parentId } = req.body;

    // Capture old teams BEFORE updating document (for team stat tracking)
    const oldTeamIds =
      document.privacy?.teams?.map((id) => id.toString()) || [];

    // Update fields if provided
    if (title !== undefined) document.title = title;
    if (description !== undefined) document.description = description;
    if (type !== undefined) {
      const validTypes = [
        "file",
        "folder",
        "auditSchedule",
        "formTemplate",
        "formResponse",
      ];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          message: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
        });
      }
      document.type = type;
    }
    if (status !== undefined) document.status = status;
    if (parentId !== undefined) {
      if (parentId) {
        const parentDoc = await Document.findById(parentId);
        if (!parentDoc) {
          return res.status(404).json({
            success: false,
            message: "Parent document not found",
          });
        }
        if (parentDoc.type !== "folder") {
          return res.status(400).json({
            success: false,
            message: "Parent document must be of type 'folder'",
          });
        }
      }
      document.parentId = parentId || null;
    }
    if (privacy !== undefined) document.privacy = privacy;
    if (permissionOverrides !== undefined)
      document.permissionOverrides = permissionOverrides;
    if (metadata !== undefined) {
      document.metadata = { ...document.metadata, ...metadata };

      // Set default fileType if type is file and fileType is not in metadata
      if (document.type === "file" && !document.metadata.fileType) {
        const defaultFileType = await FileType.findOne({
          isDefault: true,
          deletedAt: null,
        });
        if (defaultFileType) {
          document.metadata.fileType = defaultFileType._id;
        }
      }
    }

    // Save updated document
    const updatedDocument = await document.save();

    // Log document update to audit trail
    await postAuditTrailLog(
      "U",
      updatedDocument._id,
      "DOCUMENTS",
      `Document updated: ${updatedDocument.title}`,
      {
        id: req.user?._id || req.user?.id || "Unknown",
        name: req.user
          ? `${req.user.firstName} ${req.user.lastName}`
          : "Unknown User",
      },
      JSON.stringify({
        documentTitle: updatedDocument.title,
        documentType: updatedDocument.type,
        updatedFields: Object.keys(req.body),
      }),
    );

    // Update team stats if privacy.teams was changed
    if (privacy !== undefined) {
      try {
        // Use the old teams captured before update
        const newTeamIds =
          updatedDocument.privacy?.teams?.map((id) => id.toString()) || [];

        // Find teams to add (in new but not in old)
        const teamsToAdd = newTeamIds.filter(
          (teamId) => !oldTeamIds.includes(teamId),
        );

        // Find teams to remove (in old but not in new)
        const teamsToRemove = oldTeamIds.filter(
          (teamId) => !newTeamIds.includes(teamId),
        );

        console.log(`[updateDocument] Old teams: ${oldTeamIds.join(", ")}`);
        console.log(`[updateDocument] New teams: ${newTeamIds.join(", ")}`);
        console.log(`[updateDocument] Teams to add: ${teamsToAdd.join(", ")}`);
        console.log(
          `[updateDocument] Teams to remove: ${teamsToRemove.join(", ")}`,
        );

        // Add document to new teams
        for (const teamId of teamsToAdd) {
          await putFileTeamStat(teamId, updatedDocument._id);
        }

        // Remove document from removed teams
        for (const teamId of teamsToRemove) {
          await removeFileTeamStat(teamId, updatedDocument._id);
        }
      } catch (error) {
        console.error("Error updating team stats:", error);
        // Don't fail the request if team stat update fails
      }
    }

    return res.status(200).json({
      success: true,
      message: "Document updated successfully",
      data: updatedDocument,
    });
  } catch (error) {
    console.error("Error in updateDocument:", error);

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
      message: "Failed to update document",
      error: error.message,
    });
  }
};

const downloadFile = async (req, res) => {
  try {
    const { key, fileName } = req.body;

    // Validate required fields
    if (!key) {
      return res.status(400).json({
        success: false,
        message: "File key is required",
      });
    }

    // Get the uploads directory from env
    const uploadsDir =
      process.env.DOCUMENTS_DIR || path.join(__dirname, "../../uploads");

    // Find all files in the directory that start with the hash
    const files = fs.readdirSync(uploadsDir);
    const matchedFile = files.find((file) => file.startsWith(key));

    if (!matchedFile) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    const filePath = path.join(uploadsDir, matchedFile);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    // Set the download filename - use provided fileName or original stored filename
    const downloadFileName = fileName || matchedFile;

    // Log file download to audit trail - use a placeholder ID since we don't have document ID
    const userId = req.user?._id || req.user?.id;
    const userName = req.user
      ? `${req.user.firstName} ${req.user.lastName}`
      : "Unknown User";

    if (userId && userName !== "Unknown User") {
      await postAuditTrailLog(
        "R",
        userId, // Use user ID as entity since we're downloading, not accessing a specific document
        "DOCUMENTS",
        `File downloaded: ${downloadFileName}`,
        {
          id: userId,
          name: userName,
        },
        JSON.stringify({
          fileName: downloadFileName,
          fileKey: key,
        }),
      );
    }

    // Send file as download
    res.download(filePath, downloadFileName, (err) => {
      if (err) {
        console.error("Error downloading file:", err);
        if (!res.headersSent) {
          return res.status(500).json({
            success: false,
            message: "Failed to download file",
            error: err.message,
          });
        }
      }
    });
  } catch (error) {
    console.error("Error in downloadFile:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to download file",
      error: error.message,
    });
  }
};

const uploadFile = async (req, res) => {
  try {
    // Check if file is provided
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "File is required",
      });
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir =
      process.env.DOCUMENTS_DIR || path.join(__dirname, "../../uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Generate hash from file content
    const fileBuffer = req.file.buffer;
    const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

    // Store file with hash as filename
    const fileExtension = path.extname(req.file.originalname);
    const storedFileName = `${hash}${fileExtension}`;
    const filePath = path.join(uploadsDir, storedFileName);

    // Write file to disk
    fs.writeFileSync(filePath, fileBuffer);

    // Return file metadata
    return res.status(200).json({
      success: true,
      message: "File uploaded successfully",
      data: {
        fileName: req.file.originalname,
        size: req.file.size,
        key: hash,
      },
    });
  } catch (error) {
    console.error("Error in uploadFile:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to upload file",
      error: error.message,
    });
  }
};

const previewFile = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the document
    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Get key from document metadata
    const key = document.metadata?.key;
    const fileName = document.metadata?.fileName || document.title;

    // Validate required fields
    if (!key) {
      return res.status(400).json({
        success: false,
        message: "File key not found in document metadata",
      });
    }

    // Get the uploads directory from env
    const uploadsDir =
      process.env.DOCUMENTS_DIR || path.join(__dirname, "../../uploads");

    // Find all files in the directory that start with the hash
    const files = fs.readdirSync(uploadsDir);
    const matchedFile = files.find((file) => file.startsWith(key));

    if (!matchedFile) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    const filePath = path.join(uploadsDir, matchedFile);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    // Get file extension
    const fileExtension = path.extname(matchedFile).toLowerCase();

    // Define allowed preview formats
    const allowedFormats = [".pdf", ".jpg", ".jpeg", ".png", ".mp3", ".mp4"];

    // Check if file format is supported for preview
    if (!allowedFormats.includes(fileExtension)) {
      return res.status(400).json({
        success: false,
        message: `Preview is not available for this file format. Only PDF, JPG, PNG, MP3, and MP4 files can be previewed.`,
        fileFormat: fileExtension,
        supportedFormats: allowedFormats,
      });
    }

    // Set appropriate content type
    let contentType;
    switch (fileExtension) {
      case ".pdf":
        contentType = "application/pdf";
        break;
      case ".jpg":
      case ".jpeg":
        contentType = "image/jpeg";
        break;
      case ".png":
        contentType = "image/png";
        break;
      case ".mp3":
        contentType = "audio/mpeg";
        break;
      case ".mp4":
        contentType = "video/mp4";
        break;
      default:
        contentType = "application/octet-stream";
    }

    // Log file preview to audit trail
    const userId = req.user?._id || req.user?.id;
    const userName = req.user
      ? `${req.user.firstName} ${req.user.lastName}`
      : "Unknown User";

    if (userId && userName !== "Unknown User") {
      await postAuditTrailLog(
        "R",
        userId,
        "DOCUMENTS",
        `File previewed: ${fileName || matchedFile}`,
        {
          id: userId,
          name: userName,
        },
        JSON.stringify({
          fileName: fileName || matchedFile,
          fileKey: key,
          fileFormat: fileExtension,
        }),
      );
    }

    // Set headers for inline viewing
    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${fileName || matchedFile}"`,
    );

    // Send file
    res.sendFile(filePath);
  } catch (error) {
    console.error("Error in previewDocument:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to preview file",
      error: error.message,
    });
  }
};

const getQualityDocument = async (req, res) => {
  try {
    // pagination
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const maxLimit = 100;
    let limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    if (limit > maxLimit) limit = maxLimit;

    // keyword search
    const keyword = (req.query.keyword ?? req.query.q ?? "").toString().trim();

    // documentNumber search
    const documentNumber = (req.query.documentNumber ?? "").toString().trim();

    // teamId filter
    const teamId = (req.query.teamId ?? "").toString().trim();

    // published filter (0 or 1)
    const published = req.query.published;

    // First, get all FileTypes where isQualityDocument is true
    const qualityFileTypes = await FileType.find({
      isQualityDocument: true,
      deletedAt: null,
    }).select("_id");

    const qualityFileTypeIds = qualityFileTypes.map((ft) => ft._id);

    if (qualityFileTypeIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        meta: { total: 0, page, limit, totalPages: 0 },
      });
    }

    // Build filter for quality documents
    // Handle both ObjectId and string formats for fileType
    const qualityFileTypeIdsStrings = qualityFileTypeIds.map((id) =>
      id.toString(),
    );

    const filter = {
      type: "file",
      deletedAt: null,
      status: 2,
    };

    // Add fileType filter with $or to handle both ObjectId and string
    const fileTypeFilter = {
      $or: [
        { "metadata.fileType": { $in: qualityFileTypeIds } },
        { "metadata.fileType": { $in: qualityFileTypeIdsStrings } },
      ],
    };

    // Add documentNumber search if provided (exact match)
    if (documentNumber) {
      const escapedDocNumber = documentNumber.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );
      filter.$and = [
        fileTypeFilter,
        {
          "metadata.documentNumber": {
            $regex: new RegExp(`^${escapedDocNumber}$`, "i"),
          },
        },
      ];
    } else if (keyword) {
      const re = new RegExp(keyword, "i");
      // Combine fileType filter with keyword search
      filter.$and = [
        fileTypeFilter,
        {
          $or: [
            { title: re },
            { description: re },
            { "metadata.filename": re },
          ],
        },
      ];
    } else {
      // Just use fileType filter
      Object.assign(filter, fileTypeFilter);
    }

    // Filter by teamId if provided
    if (teamId) {
      if (mongoose.Types.ObjectId.isValid(teamId)) {
        filter["metadata.team"] = teamId;
      }
    }

    // Filter by published status
    if (published !== undefined) {
      const publishedValue = parseInt(published, 10);
      if (publishedValue === 0) {
        // status=2 AND checkedOut=0
        filter.status = 2;
        filter["metadata.checkedOut"] = 0;
      } else if (publishedValue === 1) {
        // status=2 AND checkedOut=1
        filter.status = 2;
        filter["metadata.checkedOut"] = 1;
      }
    }

    const total = await Document.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const documents = await Document.find(filter)
      .populate("owner", "firstName lastName email")
      .populate("parentId", "title type")
      .populate("privacy.users", "firstName lastName email")
      .populate("privacy.teams", "name")
      .populate("privacy.roles", "title")
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();

    // Manually populate fileType from metadata (since metadata is Mixed type)
    const fileTypeIds = documents
      .map((doc) => doc.metadata?.fileType)
      .filter(Boolean);

    const fileTypes = await FileType.find({
      _id: { $in: fileTypeIds },
    }).lean();

    const fileTypeMap = new Map(fileTypes.map((ft) => [ft._id.toString(), ft]));

    // Transform fileType in metadata to the desired structure
    const data = documents.map((doc) => {
      if (doc.metadata && doc.metadata.fileType) {
        const fileTypeId = doc.metadata.fileType.toString();
        const fileType = fileTypeMap.get(fileTypeId);
        doc.metadata.fileType = {
          id: fileTypeId,
          name: fileType?.name || "",
        };
      }
      return doc;
    });

    return res.status(200).json({
      success: true,
      message: "Quality documents retrieved successfully",
      data,
      meta: { total, page, limit, totalPages },
    });
  } catch (error) {
    console.error("Error in getQualityDocument:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve quality documents",
      error: error.message,
    });
  }
};

export {
  postDocument,
  getDocuments,
  getDocument,
  updateDocument,
  deleteDocument,
  downloadFile,
  uploadFile,
  previewFile,
  getQualityDocument,
};
