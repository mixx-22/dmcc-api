import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { Document } from "../documents/document.model.js";

const NETWORK_PATH = process.env.NETWORK_FILE_PATH;
const SALT_ROUNDS = parseInt(process.env.FILE_HASH_SALT_ROUNDS ?? "12", 10);

if (!NETWORK_PATH) {
  console.warn(
    "NETWORK_FILE_PATH is not set. File storage will fail if uploads are sent."
  );
}

const validateDocumentPayload = (payload = {}) => {
  if (!payload.title || typeof payload.title !== "string" || !payload.title.trim()) {
    return { valid: false, message: "title is required and must be a non-empty string." };
  }

  if (payload.parentId && !mongoose.Types.ObjectId.isValid(String(payload.parentId))) {
    return { valid: false, message: "parentId must be a valid ObjectId." };
  }

  if (payload.Owner) {
    if (typeof payload.Owner !== "object") {
      return { valid: false, message: "Owner must be an object." };
    }
    if (payload.Owner.Id && !mongoose.Types.ObjectId.isValid(String(payload.Owner.Id))) {
      return { valid: false, message: "Owner.Id must be a valid ObjectId." };
    }
  }

  if (payload.privacy) {
    if (typeof payload.privacy !== "object" || Array.isArray(payload.privacy)) {
      return { valid: false, message: "privacy must be an object." };
    }
    const { users, teams, roles } = payload.privacy;
    if (users && !Array.isArray(users)) return { valid: false, message: "privacy.users must be an array." };
    if (teams && !Array.isArray(teams)) return { valid: false, message: "privacy.teams must be an array." };
    if (roles && !Array.isArray(roles)) return { valid: false, message: "privacy.roles must be an array." };
  }

  if (payload.permissionOverrides) {
    if (typeof payload.permissionOverrides !== "object" || Array.isArray(payload.permissionOverrides)) {
      return { valid: false, message: "permissionOverrides must be an object." };
    }
    const { readOnly, restricted } = payload.permissionOverrides;
    if (readOnly !== undefined && typeof readOnly !== "boolean") return { valid: false, message: "permissionOverrides.readOnly must be a boolean." };
    if (restricted !== undefined && typeof restricted !== "boolean") return { valid: false, message: "permissionOverrides.restricted must be a boolean." };
  }

  return { valid: true };
};

const createDocument = async (req, res) => {
  try {
    console.log("createDocument body:", req.body);
    const payload = { ...(req.body ?? {}) };

    const validation = validateDocumentPayload(payload);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    if (req.file) {
      if (!NETWORK_PATH) return res.status(500).json({ message: "Server misconfiguration: NETWORK_FILE_PATH not set." });

      await fs.promises.mkdir(NETWORK_PATH, { recursive: true });

      const timestamp = Date.now();
      const storageName = `${timestamp}-${req.file.originalname}`;
      const targetPath = path.join(NETWORK_PATH, storageName);

      await fs.promises.writeFile(targetPath, req.file.buffer);

      // bcryptjs one-way hash used as encryptedId/token
      const hashedId = await bcrypt.hash(`${targetPath}:${timestamp}`, SALT_ROUNDS);

      payload.file = {
        originalName: req.file.originalname,
        storageName,
        path: targetPath,
        size: req.file.size,
        mimeType: req.file.mimetype,
      };
      payload.encryptedId = hashedId;
      payload.path = targetPath;
    }

    const doc = await Document.create(payload);
    return res.status(201).json({ message: "Document created successfully.", document: doc });
  } catch (error) {
    console.error("createDocument error:", error);
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
};

const listDocuments = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page ?? "1", 10), 1);
    const maxLimit = 100;
    let limit = Math.max(parseInt(req.query.limit ?? "10", 10), 1);
    if (limit > maxLimit) limit = maxLimit;
    const keyword = (req.query.keyword ?? req.query.q ?? "").toString().trim();

    const filter = {};
    if (keyword) {
      const re = new RegExp(keyword, "i");
      filter.$or = [{ title: re }, { description: re }, { type: re }, { status: re }];
    }

    const total = await Document.countDocuments(filter);
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const pageClamped = Math.min(Math.max(page, 1), totalPages);

    const docs = await Document.find(filter)
      .skip((pageClamped - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      data: docs,
      meta: { total, page: pageClamped, limit, totalPages },
    });
  } catch (error) {
    console.error("listDocuments error:", error);
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
};

const getDocument = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid document id." });
    }

    const doc = await Document.findById(id)
      .populate("Owner.Id author privacy.users privacy.teams")
      .lean();

    if (!doc) return res.status(404).json({ message: "Document not found." });

    return res.status(200).json({ document: doc });
  } catch (error) {
    console.error("getDocument error:", error);
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
};

const updateDocument = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid document id." });
    }

    const payload = { ...(req.body ?? {}) };

    // validate partial payload where applicable
    const validation = validateDocumentPayload({ title: payload.title ?? "ok", parentId: payload.parentId, Owner: payload.Owner, privacy: payload.privacy, permissionOverrides: payload.permissionOverrides });
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const updated = await Document.findByIdAndUpdate(id, { $set: payload }, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ message: "Document not found." });

    return res.status(200).json({ message: "Document updated.", document: updated });
  } catch (error) {
    console.error("updateDocument error:", error);
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
};

const deleteDocument = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid document id." });
    }

    const removed = await Document.findByIdAndDelete(id);
    if (!removed) return res.status(404).json({ message: "Document not found." });

    return res.status(200).json({ message: "Document deleted successfully.", documentId: removed._id });
  } catch (error) {
    console.error("deleteDocument error:", error);
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
};

export {
  createDocument,
  listDocuments,
  getDocument,
  updateDocument,
  deleteDocument,
};