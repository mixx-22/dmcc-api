import { RecentDocs } from "./recentDocs.model.js";
import { Document } from "../../documents/document.model.js";
import { FileType } from "../../fileType/fileType.model.js";
import mongoose from "mongoose";

const postRecentDocsLog = async (req, res) => {
  try {
    const { documentId } = req.body;
    const userId = req.user?._id || req.user?.id;

    // Validate required fields
    if (!documentId) {
      return res.status(400).json({
        success: false,
        message: "documentId is required",
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Get document to retrieve type
    const document = await Document.findById(documentId).select("type");
    const documentType = document?.type || "";

    // Check if record already exists for this user and document
    const existingRecord = await RecentDocs.findOne({
      userId,
      documentId,
    });

    if (existingRecord) {
      // Update existing record: update accessedAt and increment count
      existingRecord.accessedAt = new Date();
      existingRecord.count += 1;
      existingRecord.documentType = documentType;
      await existingRecord.save();

      return res.status(200).json({
        success: true,
        message: "Recent document log updated",
        data: existingRecord,
      });
    } else {
      // Create new record with count = 1
      const newRecord = new RecentDocs({
        userId,
        documentId,
        documentType,
        accessedAt: new Date(),
        count: 1,
      });

      await newRecord.save();

      return res.status(201).json({
        success: true,
        message: "Recent document log created",
        data: newRecord,
      });
    }
  } catch (error) {
    console.error("Error in postRecentDocsLog:", error);

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
      message: "Failed to log recent document",
      error: error.message,
    });
  }
};

const getRecentDocsLog = async (req, res) => {
  try {
    const { user, type } = req.query;

    // Pagination
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const maxLimit = 100;
    let limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    if (limit > maxLimit) limit = maxLimit;

    // Build filter
    const filter = {};

    // Filter by user if provided
    if (user) {
      filter.userId = user;
    }

    // Filter by document type if provided
    if (type) {
      filter.documentType = type;
    }

    // Get total count for pagination
    const total = await RecentDocs.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    // Get recent documents sorted by accessedAt (desc) and count (desc)
    const recentDocs = await RecentDocs.find(filter)
      .sort({ accessedAt: -1, count: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    if (recentDocs.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No recent documents found",
        data: [],
        meta: { total, page, limit, totalPages },
      });
    }

    // Extract document IDs
    const documentIds = recentDocs.map((doc) => doc.documentId);

    // Fetch full document details
    const documents = await Document.find({
      _id: { $in: documentIds },
      deletedAt: null,
    })
      .populate("owner", "firstName lastName email")
      .populate("privacy.users", "firstName lastName email")
      .populate("privacy.teams", "name")
      .populate("privacy.roles", "title")
      .lean();

    // Create a map of documents by ID for quick lookup
    const documentsMap = {};
    documents.forEach((doc) => {
      documentsMap[doc._id.toString()] = doc;
    });

    // Collect unique fileType IDs from file documents
    const fileTypeIds = [
      ...new Set(
        documents
          .filter((doc) => doc.type === "file" && doc.metadata?.fileType)
          .map((doc) => {
            const fileType = doc.metadata.fileType;
            let id;

            // Check if it's already an object with id property
            if (typeof fileType === "object" && fileType.id) {
              id = fileType.id.toString();
            } else {
              id = fileType.toString();
            }

            // Validate ObjectId format
            return mongoose.Types.ObjectId.isValid(id) ? id : null;
          })
          .filter((id) => id !== null), // Remove invalid IDs
      ),
    ];

    // Fetch all fileTypes in one query
    let fileTypesMap = {};
    if (fileTypeIds.length > 0) {
      const fileTypes = await FileType.find({ _id: { $in: fileTypeIds } })
        .select("_id name")
        .lean();

      fileTypes.forEach((ft) => {
        fileTypesMap[ft._id.toString()] = ft;
      });
    }

    // Combine document data with accessedAt from recentDocs
    const result = recentDocs
      .map((recentDoc) => {
        const document = documentsMap[recentDoc.documentId.toString()];
        if (!document) return null; // Skip if document not found or deleted

        // Transform fileType for file documents
        if (document.type === "file" && document.metadata?.fileType) {
          const fileType = document.metadata.fileType;
          let fileTypeId;

          // Check if it's already an object with id property
          if (typeof fileType === "object" && fileType.id) {
            fileTypeId = fileType.id.toString();
          } else {
            fileTypeId = fileType.toString();
          }

          // Only transform if it's a valid ObjectId
          if (mongoose.Types.ObjectId.isValid(fileTypeId)) {
            const fileTypeData = fileTypesMap[fileTypeId];

            if (fileTypeData) {
              document.metadata.fileType = {
                id: fileTypeData._id,
                name: fileTypeData.name || "",
              };
            } else {
              document.metadata.fileType = {
                id: fileTypeId,
                name: "",
              };
            }
          } else {
            // Invalid ObjectId, set to null
            document.metadata.fileType = {
              id: null,
              name: "",
            };
          }
        }

        return {
          ...document,
          accessedAt: recentDoc.accessedAt,
          accessCount: recentDoc.count,
        };
      })
      .filter((doc) => doc !== null); // Remove null entries

    return res.status(200).json({
      success: true,
      message: "Recent documents retrieved successfully",
      data: result,
      meta: { total, page, limit, totalPages },
    });
  } catch (error) {
    console.error("Error in getRecentDocsLog:", error);

    // Handle cast errors (invalid ObjectId)
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve recent documents",
      error: error.message,
    });
  }
};

export { postRecentDocsLog, getRecentDocsLog };
