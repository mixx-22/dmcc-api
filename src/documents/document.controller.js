import Document from "../documents/document.model.js";
import { RecentDocs } from "../logs/recentDocuments/recentDocs.model.js";
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

    // Validate file is provided when type is "file"
    if (type === "file" && !req.file) {
      return res.status(400).json({
        success: false,
        message: "File is required when document type is 'file'",
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

    // Handle file upload for type "file"
    let finalMetadata = metadata || {};
    if (type === "file" && req.file) {
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

      // Merge existing metadata with file metadata
      finalMetadata = {
        ...finalMetadata,
        key: hash,
        fileName: req.file.originalname,
        storedFileName: storedFileName,
        filePath: filePath,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      };
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

    // Handle file upload if a new file is provided
    if (req.file) {
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

      // Update metadata with new file information
      document.metadata = {
        ...document.metadata,
        key: hash,
        fileName: req.file.originalname,
        storedFileName: storedFileName,
        filePath: filePath,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      };
    }

    // Save updated document
    const updatedDocument = await document.save();

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

export {
  postDocument,
  getDocuments,
  getDocument,
  updateDocument,
  deleteDocument,
  downloadFile,
};
