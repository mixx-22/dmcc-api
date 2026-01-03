import { Router } from "express";
import {
  postTeam,
  getAllTeams,
  getTeam,
  updateTeam,
  deleteTeam,
} from "./team.controller.js";
const router = Router();

router.route("").post(postTeam);
router.route("").get(getAllTeams);
router.route("/:id").get(getTeam);
router.route("/:id").patch(updateTeam);
router.route("/:id").delete(deleteTeam);

export default router;
