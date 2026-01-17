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

const router = express.Router();

// Configure multer to store file in memory
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/documents - Create a new document
router.post("", upload.single("file"), postDocument);
router.get("", getDocuments);
router.get("/:id", getDocument);
router.put("/:id", upload.single("file"), updateDocument);
router.delete("/:id", deleteDocument);
router.post("/download", downloadFile);

export default router;
