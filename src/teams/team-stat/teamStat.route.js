import express from "express";
import {
  postTeamStat,
  getAllTeamStats,
  getTeamStats,
} from "./teamstat.controller.js";
import { authenticate } from "../../users/user.controller.js";

const router = express.Router();

// GET /api/team-stats - Get combined team stats for user
router.get("/all", authenticate, getAllTeamStats);

// GET /api/team-stats/:id - Get team stats for specific team
router.get("/:id", authenticate, getTeamStats);

// POST /api/team-stats - Create a new team stat
router.post("/", authenticate, postTeamStat);

export default router;
