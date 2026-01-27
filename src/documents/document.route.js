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
  previewFile,
  submitDocument,
  rejectDocument,
  discardDocument,
  approveDocument,
  publishDocument,
  getQualityDocument,
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
router.get("/quality", authenticate, getQualityDocument);
router.get("/preview/:id", authenticate, previewFile);
router.get("/:id", authenticate, getDocument);

// PUT /api/documents/:id - Update document (no file upload)
router.put("/:id", authenticate, updateDocument);
router.delete("/:id", authenticate, deleteDocument);
router.post("/download", authenticate, downloadFile);

// Document workflow routes
router.post("/submit/:id", authenticate, submitDocument); // Submit
router.post("/reject/:id", authenticate, rejectDocument); // Reject
router.post("/discard/:id", authenticate, discardDocument); // Discard
router.post("/approve/:id", authenticate, approveDocument); // Approve
router.post("/publish/:id", authenticate, publishDocument); // Publish

export default router;

// documents/submit/:id
// documents/reject/:id
// documents/discard/:id
// documents/approve/:id
// documents/publish/:id
// documents/revise/:id
