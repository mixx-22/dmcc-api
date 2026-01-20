import express from "express";
import multer from "multer";
import {
  postDocument,
  getDocuments,
  getDocument,
  updateDocument,
  deleteDocument,
  downloadFile,
  uploadFile,
} from "./document.controller.js";
import { authenticate } from "../users/user.controller.js";

const router = express.Router();

// Configure multer to store file in memory with 50MB size limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// POST /api/documents/upload - Upload file only (returns metadata)
router.post("/upload", authenticate, upload.single("file"), uploadFile);

// POST /api/documents - Create a new document (no file upload)
router.post("/", authenticate, postDocument);
router.get("/", authenticate, getDocuments);
router.get("/:id", authenticate, getDocument);

// PUT /api/documents/:id - Update document (no file upload)
router.put("/:id", authenticate, updateDocument);
router.delete("/:id", authenticate, deleteDocument);
router.post("/download", authenticate, downloadFile);

export default router;
