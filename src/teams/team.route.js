import { Router } from "express";
import {
  postTeam,
  getAllTeams,
  getTeam,
  updateTeam,
  deleteTeam,
} from "./team.controller.js";
import { authenticate } from "../users/user.controller.js";
const router = Router();

router.route("").post(authenticate, postTeam);
router.route("").get(authenticate, getAllTeams);
router.route("/:id").get(authenticate, getTeam);
router
  .route("/:id")
  .put(authenticate, updateTeam)
  .patch(authenticate, updateTeam);
router.route("/:id").delete(authenticate, deleteTeam);

export default router;
