import Document from "../documents/document.model.js";

const postDocument = async (req, res) => {
  try {
    const {
      title,
      description,
      type,
      status,
      parentId,
      path,
      owner,
      privacy,
      permissionOverrides,
      metadata,
    } = req.body;

    // Validate required fields
    if (!type) {
      return res.status(400).json({
        success: false,
        message: "Document type is required",
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

    // Create new document
    const newDocument = new Document({
      title,
      description,
      type,
      status: status !== undefined ? status : 0,
      parentId: parentId || null,
      path: path || "",
      owner,
      privacy: privacy || { users: [], teams: [], roles: [] },
      permissionOverrides: permissionOverrides || {
        readOnly: 1,
        restricted: 1,
      },
      metadata: metadata || {},
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
        { "owner.firstName": { $regex: keyword.trim(), $options: "i" } },
        { "owner.lastName": { $regex: keyword.trim(), $options: "i" } },
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

export { postDocument, getDocuments, getDocument };
