import { FileType } from "./fileType.model.js";

const postFileType = async (req, res) => {
  try {
    const {
      name,
      isQualityDocument,
      requiresApproval,
      trackVersioning,
      isDefault,
    } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Name is required." });
    }

    const existingFileType = await FileType.findOne({
      name: name.trim(),
    });
    if (existingFileType) {
      return res.status(400).json({ message: "FileType already exists." });
    }

    const fileType = await FileType.create({
      name: name.trim(),
      isQualityDocument,
      requiresApproval,
      trackVersioning,
      isDefault,
    });

    res.status(201).json({
      message: "FileType created successfully.",
      fileType: {
        id: fileType._id,
        name: fileType.name,
        isQualityDocument: fileType.isQualityDocument,
        requiresApproval: fileType.requiresApproval,
        trackVersioning: fileType.trackVersioning,
        isDefault: fileType.isDefault,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error.", error: error.message });
  }
};

const getAllFileType = async (req, res) => {
  try {
    // pagination
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const maxLimit = 100;
    let limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    if (limit > maxLimit) limit = maxLimit;

    // keyword search
    const keyword = (req.query.keyword ?? req.query.q ?? "").toString().trim();
    const filter = { deletedAt: null };
    if (keyword) {
      const re = new RegExp(keyword, "i");
      filter.name = re;
    }

    const total = await FileType.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const data = await FileType.find(filter)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json({
      data,
      meta: { total, page, limit, totalPages },
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error.",
      error: error.message,
    });
  }
};

const getFileType = async (req, res) => {
  try {
    const data = await FileType.findById(req.params.id);
    if (!data) {
      return res.status(404).json({ message: "FileType not found." });
    }
    res.status(200).json({ data });
  } catch (error) {
    res.status(500).json({
      message: "Server error.",
      error: error.message,
    });
  }
};

const putFileType = async (req, res) => {
  try {
    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: "No data provided for update." });
    }

    const fileType = await FileType.findById(req.params.id);
    if (!fileType) {
      return res.status(404).json({ message: "FileType not found." });
    }

    // apply updatable fields
    Object.keys(req.body).forEach((key) => {
      fileType[key] = req.body[key];
    });

    const saved = await fileType.save();

    res.status(200).json({
      message: "FileType updated successfully.",
      fileType: saved,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error.",
      error: error.message,
    });
  }
};

const deleteFileType = async (req, res) => {
  try {
    const fileType = await FileType.findById(req.params.id);

    if (!fileType || fileType.deletedAt) {
      return res.status(404).json({ message: "FileType not found." });
    }

    const updated = await FileType.findByIdAndUpdate(
      req.params.id,
      { deletedAt: new Date() },
      { new: true },
    );

    res.status(200).json({
      message: "FileType soft-deleted successfully.",
      fileType: updated,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error.",
      error: error.message,
    });
  }
};

export {
  postFileType,
  getAllFileType,
  getFileType,
  putFileType,
  deleteFileType,
};
