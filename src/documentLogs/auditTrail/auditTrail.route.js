import express from "express";
import {
  getAuditTrails,
} from "./auditTrail.controller.js";
import { authenticate } from "../../users/user.controller.js";

const router = express.Router();

// Get all audit trails with optional filters
router.get("/", authenticate, getAuditTrails);

export default router;
