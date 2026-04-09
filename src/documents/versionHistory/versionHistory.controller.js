import { VersionHistory } from "./versionHistory.model.js";

const postVersionHistory = async (req, res) => {
  try {
    const { documentId, versionHistory } = req.body;

    if (!documentId) {
      return res.status(400).json({
        success: false,
        message: "Document ID is required.",
      });
    }

    // Check if version history already exists for this document
    const existingVersionHistory = await VersionHistory.findOne({
      documentId,
      deletedAt: null,
    });

    if (existingVersionHistory) {
      return res.status(400).json({
        success: false,
        message: "Version history already exists for this document.",
      });
    }

    // Create new version history
    const newVersionHistory = await VersionHistory.create({
      documentId,
      versionHistory: versionHistory || [],
    });

    res.status(201).json({
      success: true,
      message: "Version history created successfully.",
      data: newVersionHistory,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error.",
      error: error.message,
    });
  }
};

const getAllVersionHistory = async (req, res) => {
  try {
    // pagination
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const maxLimit = 100;
    let limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    if (limit > maxLimit) limit = maxLimit;

    // keyword search (for documentId)
    const keyword = (req.query.keyword ?? req.query.q ?? "").toString().trim();
    const filter = { deletedAt: null };

    if (keyword) {
      filter.documentId = keyword;
    }

    const total = await VersionHistory.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const data = await VersionHistory.find(filter)
      .populate("documentId", "title description")
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data,
      meta: { total, page, limit, totalPages },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error.",
      error: error.message,
    });
  }
};

const getVersionHistory = async (req, res) => {
  try {
    const data = await VersionHistory.findById(req.params.id)
      .populate("documentId", "title description")
      .populate("versionHistory.ownerData.userId", "name email");

    if (!data || data.deletedAt) {
      return res.status(404).json({
        success: false,
        message: "Version history not found.",
      });
    }

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error.",
      error: error.message,
    });
  }
};

const putVersionHistory = async (req, res) => {
  try {
    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No data provided for update.",
      });
    }

    const versionHistory = await VersionHistory.findById(req.params.id);

    if (!versionHistory || versionHistory.deletedAt) {
      return res.status(404).json({
        success: false,
        message: "Version history not found.",
      });
    }

    // Apply updatable fields
    Object.keys(req.body).forEach((key) => {
      if (key !== "_id" && key !== "createdAt") {
        versionHistory[key] = req.body[key];
      }
    });

    const saved = await versionHistory.save();

    res.status(200).json({
      success: true,
      message: "Version history updated successfully.",
      data: saved,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error.",
      error: error.message,
    });
  }
};

const deleteVersionHistory = async (req, res) => {
  try {
    const versionHistory = await VersionHistory.findById(req.params.id);

    if (!versionHistory || versionHistory.deletedAt) {
      return res.status(404).json({
        success: false,
        message: "Version history not found.",
      });
    }

    const updated = await VersionHistory.findByIdAndUpdate(
      req.params.id,
      { deletedAt: new Date() },
      { new: true },
    );

    res.status(200).json({
      success: true,
      message: "Version history soft-deleted successfully.",
      data: updated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error.",
      error: error.message,
    });
  }
};

export {
  postVersionHistory,
  getAllVersionHistory,
  getVersionHistory,
  putVersionHistory,
  deleteVersionHistory,
};
