import express from "express";
import multer from "multer";
import {
  postDocument,
  getDocuments,
  getDocument,
  updateDocument,
  deleteDocument,
  downloadFile,
} from "./document.controller.js";
import { authenticate } from "../users/user.controller.js";

const router = express.Router();

// Configure multer to store file in memory with 50MB size limit
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// POST /api/documents - Create a new document
router.post("/", authenticate, upload.single("file"), postDocument);
router.get("/", authenticate, getDocuments);
router.get("/:id", authenticate, getDocument);
router.put("/:id", authenticate, upload.single("file"), updateDocument);
router.delete("/:id", authenticate, deleteDocument);
router.post("/download", authenticate, downloadFile);

export default router;
