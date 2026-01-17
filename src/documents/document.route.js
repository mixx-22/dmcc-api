import express from "express";
import {
  postDocument,
  getDocuments,
  getDocument,
} from "./document.controller.js";

const router = express.Router();

// POST /api/documents - Create a new document
router.post("", postDocument);
router.get("", getDocuments);
router.get("/:id", getDocument);

export default router;
