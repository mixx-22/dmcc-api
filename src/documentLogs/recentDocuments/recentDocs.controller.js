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

const buildAccessFilter = (user) => {
  if (!user) return { _id: null };

  const userId = user._id;

  const userTeamIds = (user.team || []).map((t) => t.id || t._id);
  const userRoleIds = (user.role || []).map((r) => r.id || r._id);

  return {
    $or: [
      // PUBLIC
      { "permissionOverrides.restricted": 0 },

      // RESTRICTED WITH ACCESS RULES
      {
        $and: [
          { "permissionOverrides.restricted": 1 },
          {
            $or: [
              { owner: userId },
              { "privacy.users": userId },
              { "privacy.teams": { $in: userTeamIds } },
              { "privacy.roles": { $in: userRoleIds } },
            ],
          },
        ],
      },
    ],
  };
};

const getRecentDocsLog = async (req, res) => {
  try {
    const { user, type } = req.query;

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      100,
    );

    const filter = {
      ...(user && { userId: user }),
      ...(type && { documentType: type }),
    };

    const total = await RecentDocs.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const recentDocs = await RecentDocs.find(filter)
      .sort({ accessedAt: -1, count: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    if (!recentDocs.length) {
      return res.status(200).json({
        success: true,
        message: "No recent documents found",
        data: [],
        meta: { total, page, limit, totalPages },
      });
    }

    const documentIds = recentDocs.map((d) => d.documentId);

    // 🔐 APPLY PRIVACY FILTER HERE
    const accessFilter = buildAccessFilter(req.user);

    const documents = await Document.find({
      _id: { $in: documentIds },
      deletedAt: null,
      $and: [accessFilter],
    })
      .populate("owner", "firstName lastName email")
      .populate("privacy.users", "firstName lastName email")
      .populate("privacy.teams", "name")
      .populate("privacy.roles", "title")
      .lean();

    const documentsMap = Object.fromEntries(
      documents.map((doc) => [doc._id.toString(), doc]),
    );

    // FILE TYPES
    const fileTypeIds = [
      ...new Set(
        documents
          .map((doc) => doc.metadata?.fileType)
          .filter(Boolean)
          .map((id) => (mongoose.isValidObjectId(id) ? id.toString() : null))
          .filter(Boolean),
      ),
    ];

    const fileTypes = fileTypeIds.length
      ? await FileType.find({ _id: { $in: fileTypeIds } })
          .select("_id name")
          .lean()
      : [];

    const fileTypeMap = Object.fromEntries(
      fileTypes.map((ft) => [ft._id.toString(), ft]),
    );

    const result = recentDocs
      .map((recent) => {
        const doc = documentsMap[recent.documentId.toString()];
        if (!doc) return null;

        // Normalize fileType
        if (doc.type === "file" && doc.metadata?.fileType) {
          const fileTypeId = doc.metadata.fileType?.toString?.();

          doc.metadata.fileType = {
            id: fileTypeId,
            name: fileTypeMap[fileTypeId]?.name || "",
          };
        }

        return {
          ...doc,
          accessedAt: recent.accessedAt,
          accessCount: recent.count,
        };
      })
      .filter(Boolean);

    return res.status(200).json({
      success: true,
      message: "Recent documents retrieved successfully",
      data: result,
      meta: { total, page, limit, totalPages },
    });
  } catch (error) {
    console.error("Error in getRecentDocsLog:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve recent documents",
    });
  }
};

export { postRecentDocsLog, getRecentDocsLog };
