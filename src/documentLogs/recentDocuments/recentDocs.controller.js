import { RecentDocs } from "./recentDocs.model.js";
import Document from "../../documents/document.model.js";

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
    const { type, page = 1, limit = 10 } = req.query;

    // Parse and validate pagination parameters
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (pageNum < 1 || limitNum < 1) {
      return res.status(400).json({
        success: false,
        message: "Page and limit must be positive numbers",
      });
    }

    // Build filter
    const filter = {};
    if (type) {
      filter.documentType = type;
    }

    // Calculate skip value for pagination
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination metadata
    const totalCount = await RecentDocs.countDocuments(filter);

    // Find recent document logs with filter and pagination
    const logs = await RecentDocs.find(filter)
      .populate("userId", "firstName lastName")
      .populate("documentId", "title type")
      .sort({ accessedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Format the response
    const formattedLogs = logs.map((log) => ({
      _id: log._id,
      userData: {
        userId: log.userId?._id || null,
        name: log.userId
          ? `${log.userId.firstName} ${log.userId.lastName}`
          : null,
      },
      documentData: {
        documentId: log.documentId?._id || null,
        title: log.documentId?.title || null,
        documentType: log.documentType || log.documentId?.type || null,
      },
      accessedAt: log.accessedAt,
      count: log.count,
    }));

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    return res.status(200).json({
      success: true,
      message: "Recent document logs retrieved successfully",
      data: formattedLogs,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        limit: limitNum,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    console.error("Error in getRecentDocsLog:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve recent document logs",
      error: error.message,
    });
  }
};

export { postRecentDocsLog, getRecentDocsLog };
