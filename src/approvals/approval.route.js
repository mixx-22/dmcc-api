import express from "express";
import {
  postApproval,
  getAllApprovals,
  getApproval,
} from "./approval.controller.js";
import { authenticate } from "../users/user.controller.js";

const router = express.Router();

// POST /api/approvals - Create a new approval
router.post("/", authenticate, postApproval);

// GET /api/approvals - Get all approvals with filters and pagination
router.get("/", authenticate, getAllApprovals);

// GET /api/approvals/:id - Get a specific approval by ID
router.get("/:id", authenticate, getApproval);

export default router;
