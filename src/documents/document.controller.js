import Document from "../documents/document.model.js";
import { RecentDocs } from "../documentLogs/recentDocuments/recentDocs.model.js";
import { postAuditTrailLog } from "../documentLogs/auditTrail/auditTrail.controller.js";
import Approval from "../approvals/approval.model.js";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const postDocument = async (req, res) => {
  try {
    // Handle both JSON and form-data
    let permissionOverrides, metadata, docPath, privacy;

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

    // Handle path - should be an array
    if (req.body.path !== undefined) {
      if (Array.isArray(req.body.path)) {
        docPath = req.body.path;
      } else if (typeof req.body.path === "string") {
        // If it's a JSON string representing an array, parse it
        if (req.body.path.startsWith("[")) {
          try {
            docPath = JSON.parse(req.body.path);
          } catch (error) {
            return res.status(400).json({
              success: false,
              message:
                "Invalid JSON format for 'path' field. Path should be an array like []",
              error: error.message,
            });
          }
        } else {
          // If it's a plain string, convert to array with that string
          docPath = req.body.path ? [req.body.path] : [];
        }
      } else {
        return res.status(400).json({
          success: false,
          message: "Path should be an array.",
        });
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

    // Set default checkedOut value for file type
    if (type === "file" && finalMetadata.checkedOut === undefined) {
      finalMetadata.checkedOut = 1;
    }

    // Create new document
    const newDocument = new Document({
      title,
      description,
      type,
      status: status !== undefined ? status : 0,
      parentId: parentId || null,
      path: docPath || [],
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

const getDocuments = async (req, res) => {
  try {
    const {
      keyword,
      folder,
      type,
      sortBy = "title",
      sortOrder = "asc",
    } = req.query;

    console.log("Received keyword:", keyword);
    console.log("Received folder:", folder);
    console.log("Received type:", type);
    console.log("Full query params:", req.query);

    // Build the filter object
    let filter = { deletedAt: null };
    let folderInfo = null;

    // Filter by type if provided
    if (type) {
      filter.type = type;
    }

    if (folder) {
      // If folder is provided, get folder information
      folderInfo = await Document.findOne({ _id: folder, deletedAt: null })
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

      // Log folder access in recent documents
      const userId = req.user?._id || req.user?.id;
      if (userId) {
        try {
          const existingRecord = await RecentDocs.findOne({
            userId,
            documentId: folder,
          });

          if (existingRecord) {
            existingRecord.accessedAt = new Date();
            existingRecord.count += 1;
            existingRecord.documentType = folderInfo.type;
            await existingRecord.save();
          } else {
            const newRecord = new RecentDocs({
              userId,
              documentId: folder,
              documentType: folderInfo.type,
              accessedAt: new Date(),
              count: 1,
            });
            await newRecord.save();
          }
        } catch (logError) {
          console.error("Error logging document access:", logError);
          // Don't fail the request if logging fails
        }
      }

      // Filter by parentId
      filter.parentId = folder;
    } else if (keyword && keyword.trim() !== "") {
      // If keyword is provided, search in title, description, and owner fields
      filter.$or = [
        { title: { $regex: keyword.trim(), $options: "i" } },
        { description: { $regex: keyword.trim(), $options: "i" } },
        { "metadata.fileName": { $regex: keyword.trim(), $options: "i" } },
      ];
    } else {
      // If no keyword or folder, filter by parentId: null
      filter.parentId = null;
    }

    console.log("Filter being used:", JSON.stringify(filter, null, 2));

    // Build sort object - folders first, then by specified field
    const sortDirection = sortOrder === "desc" ? -1 : 1;
    const sortOptions = [
      { type: 1 }, // Always sort by type first (folder comes before file alphabetically)
      { [sortBy]: sortDirection }, // Then sort by specified field
    ];

    // Find documents with all fields
    let documents = await Document.find(filter)
      .populate("owner", "firstName lastName email")
      .populate("privacy.users", "firstName lastName email")
      .populate("privacy.teams", "name")
      .populate("privacy.roles", "title")
      .lean();

    // Sort documents: folders first, then apply custom sort
    documents.sort((a, b) => {
      // First, ensure folders come first
      if (a.type === "folder" && b.type !== "folder") return -1;
      if (a.type !== "folder" && b.type === "folder") return 1;

      // Then sort by the specified field
      const aValue = a[sortBy];
      const bValue = b[sortBy];

      if (aValue < bValue) return sortDirection;
      if (aValue > bValue) return -sortDirection;
      return 0;
    });

    // Prepare response data
    const responseData = {
      documents,
      ...(folderInfo && { folder: folderInfo }),
    };

    // If folder is provided, fetch parent information
    let parentData = null;
    if (folderInfo && folderInfo.parentId) {
      const parent = await Document.findOne({
        _id: folderInfo.parentId,
        deletedAt: null,
      })
        .select("_id title parentId")
        .lean();

      if (parent) {
        parentData = {
          id: parent._id,
          title: parent.title,
          parentId: parent.parentId || null,
        };
        // Replace parentId with parentData in folderInfo
        folderInfo.parentData = parentData;
        delete folderInfo.parentId;
      }
    }

    return res.status(200).json({
      success: true,
      message: keyword
        ? "Documents retrieved successfully"
        : folder
          ? "Folder contents retrieved successfully"
          : "Root documents retrieved successfully",
      data: responseData,
    });
  } catch (error) {
    console.error("Error in getDocument:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve documents",
      error: error.message,
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

      responseData.children = children;
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
    let permissionOverrides, metadata, docPath, privacy;

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
      try {
        permissionOverrides = JSON.parse(req.body.permissionOverrides);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Invalid JSON format for 'permissionOverrides' field",
          error: error.message,
        });
      }
    }

    if (req.body.metadata) {
      try {
        metadata = JSON.parse(req.body.metadata);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Invalid JSON format for 'metadata' field",
          error: error.message,
        });
      }
    }

    if (req.body.path) {
      try {
        docPath = JSON.parse(req.body.path);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid JSON format for 'path' field. Path should be an array.",
          error: error.message,
        });
      }
    }

    const { title, description, type, status, parentId } = req.body;

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
    if (docPath !== undefined) document.path = docPath;
    if (privacy !== undefined) document.privacy = privacy;
    if (permissionOverrides !== undefined)
      document.permissionOverrides = permissionOverrides;
    if (metadata !== undefined)
      document.metadata = { ...document.metadata, ...metadata };

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

const submitDocument = async (req, res) => {
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

    // Check if document is a file
    if (document.type !== "file") {
      return res.status(400).json({
        success: false,
        message: "Only file type documents can be submitted",
      });
    }

    // Update document status and metadata
    document.status = 1;
    if (!document.metadata) {
      document.metadata = {};
    }
    document.metadata.checkedOut = 0;

    await document.save();

    // Get user information
    const userId = req.user?._id || req.user?.id;
    const userName = req.user
      ? `${req.user.firstName} ${req.user.lastName}`
      : "Unknown User";

    // Create approval with type: "submit"
    const newApproval = new Approval({
      title: `Submission: ${document.title}`,
      description: `Document submitted for approval`,
      metadata: document.metadata,
      entityId: document._id,
      requestedBy: userId,
      type: "submit",
      status: 0, // Under Review
    });

    await newApproval.save();

    // Log document submission to audit trail
    await postAuditTrailLog(
      "U",
      document._id,
      "DOCUMENTS",
      `Document submitted: ${document.title}`,
      {
        id: userId,
        name: userName,
      },
      JSON.stringify({
        status: 1,
        checkedOut: 0,
        approvalId: newApproval._id,
      }),
    );

    return res.status(200).json({
      success: true,
      message: "Document submitted successfully",
      data: {
        document,
        approval: newApproval,
      },
    });
  } catch (error) {
    console.error("Error in submitDocument:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit document",
      error: error.message,
    });
  }
};

const rejectDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { approvalId } = req.body;

    // Validate approvalId
    if (!approvalId) {
      return res.status(400).json({
        success: false,
        message: "Approval ID is required",
      });
    }

    // Find the document
    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Find the approval
    const approval = await Approval.findById(approvalId);
    if (!approval) {
      return res.status(404).json({
        success: false,
        message: "Approval not found",
      });
    }

    // Update document status and metadata
    document.status = 0;
    if (!document.metadata) {
      document.metadata = {};
    }
    document.metadata.checkedOut = 1;

    await document.save();

    // Update approval
    approval.type = "reject";
    approval.mode = "Department";
    approval.status = 2; // Rejected

    await approval.save();

    // Get user information
    const userId = req.user?._id || req.user?.id;
    const userName = req.user
      ? `${req.user.firstName} ${req.user.lastName}`
      : "Unknown User";

    // Log document rejection to audit trail
    await postAuditTrailLog(
      "U",
      document._id,
      "DOCUMENTS",
      `Document rejected: ${document.title}`,
      {
        id: userId,
        name: userName,
      },
      JSON.stringify({
        status: 0,
        checkedOut: 1,
        approvalId: approval._id,
      }),
    );

    return res.status(200).json({
      success: true,
      message: "Document rejected successfully",
      data: {
        document,
        approval,
      },
    });
  } catch (error) {
    console.error("Error in rejectDocument:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reject document",
      error: error.message,
    });
  }
};

const discardDocument = async (req, res) => {
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

    // Update document status and metadata
    document.status = 0;
    if (!document.metadata) {
      document.metadata = {};
    }
    document.metadata.checkedOut = 0;

    await document.save();

    // Get user information
    const userId = req.user?._id || req.user?.id;
    const userName = req.user
      ? `${req.user.firstName} ${req.user.lastName}`
      : "Unknown User";

    // Log document discard to audit trail
    await postAuditTrailLog(
      "U",
      document._id,
      "DOCUMENTS",
      `Document discarded: ${document.title}`,
      {
        id: userId,
        name: userName,
      },
      JSON.stringify({
        status: 0,
        checkedOut: 0,
      }),
    );

    return res.status(200).json({
      success: true,
      message: "Document discarded successfully",
      data: document,
    });
  } catch (error) {
    console.error("Error in discardDocument:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to discard document",
      error: error.message,
    });
  }
};

const approveDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { approvalId } = req.body;

    // Validate approvalId
    if (!approvalId) {
      return res.status(400).json({
        success: false,
        message: "Approval ID is required",
      });
    }

    // Find the document
    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Find the approval
    const approval = await Approval.findById(approvalId);
    if (!approval) {
      return res.status(404).json({
        success: false,
        message: "Approval not found",
      });
    }

    // Update document status and metadata
    document.status = 1;
    if (!document.metadata) {
      document.metadata = {};
    }
    document.metadata.checkedOut = 0;

    await document.save();

    // Update approval
    approval.type = "approved";
    approval.mode = "Document Controller";
    approval.status = 0; // Under Review

    await approval.save();

    // Get user information
    const userId = req.user?._id || req.user?.id;
    const userName = req.user
      ? `${req.user.firstName} ${req.user.lastName}`
      : "Unknown User";

    // Log document approval to audit trail
    await postAuditTrailLog(
      "U",
      document._id,
      "DOCUMENTS",
      `Document approved: ${document.title}`,
      {
        id: userId,
        name: userName,
      },
      JSON.stringify({
        status: 1,
        checkedOut: 0,
        approvalId: approval._id,
      }),
    );

    return res.status(200).json({
      success: true,
      message: "Document approved successfully",
      data: {
        document,
        approval,
      },
    });
  } catch (error) {
    console.error("Error in approveDocument:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to approve document",
      error: error.message,
    });
  }
};

const publishDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { approvalId } = req.body;

    // Validate approvalId
    if (!approvalId) {
      return res.status(400).json({
        success: false,
        message: "Approval ID is required",
      });
    }

    // Find the document
    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Find the approval
    const approval = await Approval.findById(approvalId);
    if (!approval) {
      return res.status(404).json({
        success: false,
        message: "Approval not found",
      });
    }

    // Update document status and metadata
    document.status = 2;
    if (!document.metadata) {
      document.metadata = {};
    }
    document.metadata.checkedOut = 0;

    await document.save();

    // Update approval
    approval.mode = "Document Controller";
    approval.status = 1; // Approved

    await approval.save();

    // Get user information
    const userId = req.user?._id || req.user?.id;
    const userName = req.user
      ? `${req.user.firstName} ${req.user.lastName}`
      : "Unknown User";

    // Log document publication to audit trail
    await postAuditTrailLog(
      "U",
      document._id,
      "DOCUMENTS",
      `Document published: ${document.title}`,
      {
        id: userId,
        name: userName,
      },
      JSON.stringify({
        status: 2,
        checkedOut: 0,
        approvalId: approval._id,
      }),
    );

    return res.status(200).json({
      success: true,
      message: "Document published successfully",
      data: {
        document,
        approval,
      },
    });
  } catch (error) {
    console.error("Error in publishDocument:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to publish document",
      error: error.message,
    });
  }
};

const reviseDocument = async (req, res) => {
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

    // Update document status and metadata
    document.status = 0;
    if (!document.metadata) {
      document.metadata = {};
    }
    document.metadata.checkedOut = 1;

    await document.save();

    // Get user information
    const userId = req.user?._id || req.user?.id;
    const userName = req.user
      ? `${req.user.firstName} ${req.user.lastName}`
      : "Unknown User";

    // Log document request to audit trail
    await postAuditTrailLog(
      "U",
      document._id,
      "DOCUMENTS",
      `Document requested: ${document.title}`,
      {
        id: userId,
        name: userName,
      },
      JSON.stringify({
        status: 0,
        checkedOut: 1,
      }),
    );

    return res.status(200).json({
      success: true,
      message: "Document requested successfully",
      data: document,
    });
  } catch (error) {
    console.error("Error in requestDocument:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to request document",
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
  submitDocument,
  rejectDocument,
  discardDocument,
  approveDocument,
  publishDocument,
  reviseDocument,
  previewFile,
};
