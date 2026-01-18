import express from "express";
import {
  postRecentDocsLog,
  getRecentDocsLog,
} from "./recentDocs.controller.js";
import { authenticate } from "../../users/user.controller.js";

const router = express.Router();

router.post("", authenticate, postRecentDocsLog);
router.get("", authenticate, getRecentDocsLog);

export default router;
