import { Router } from "express";
import {
  postRole,
  getAllRoles,
  getRole,
  putRole,
} from "../roles/role.controller.js";
const router = Router();

router.route("/register-role").post(postRole);
router.route("/get-role").get(getAllRoles);
router.route("/get-role/:id").get(getRole);
router.route("/update-role/:id").patch(putRole);

export default router;
