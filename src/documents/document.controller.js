import Document from "../documents/document.model.js";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const postDocument = async (req, res) => {
  try {
    // Parse JSON fields from form-data
    let owner, privacy, permissionOverrides, metadata;

    try {
      owner = req.body.owner ? JSON.parse(req.body.owner) : null;
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid JSON format for 'owner' field",
        error: error.message,
      });
    }

    try {
      privacy = req.body.privacy ? JSON.parse(req.body.privacy) : null;
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid JSON format for 'privacy' field",
        error: error.message,
      });
    }

    try {
      permissionOverrides = req.body.permissionOverrides
        ? JSON.parse(req.body.permissionOverrides)
        : null;
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid JSON format for 'permissionOverrides' field",
        error: error.message,
      });
    }

    try {
      metadata = req.body.metadata ? JSON.parse(req.body.metadata) : null;
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid JSON format for 'metadata' field",
        error: error.message,
      });
    }

    const {
      title,
      description,
      type,
      status,
      parentId,
      path: docPath,
    } = req.body;

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

    if (!owner || !owner.id || !owner.firstName || !owner.lastName) {
      return res.status(400).json({
        success: false,
        message:
          "Owner information is required (id, firstName, lastName, type, team)",
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
      path: docPath || "",
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
    const { keyword, folder } = req.query;

    console.log("Received keyword:", keyword);
    console.log("Received folder:", folder);
    console.log("Full query params:", req.query);

    // Build the filter object
    let filter = {};

    if (folder) {
      // If folder is provided, filter by parentId
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

    // Find documents with specific fields
    const documents = await Document.find(filter)
      .select(
        "title description type status parentId path owner privacy permissionOverrides",
      )
      .populate("privacy.users", "firstName lastName")
      .populate("privacy.teams", "name")
      .populate("privacy.roles", "title");

    return res.status(200).json({
      success: true,
      message: keyword
        ? "Documents retrieved successfully"
        : "Root documents retrieved successfully",
      data: documents,
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

    // Find document by ID with all fields including metadata
    const document = await Document.findById(id)
      .populate("privacy.users", "firstName lastName")
      .populate("privacy.teams", "name")
      .populate("privacy.roles", "title");

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Document retrieved successfully",
      data: document,
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

export { postDocument, getDocuments, getDocument, downloadFile };
