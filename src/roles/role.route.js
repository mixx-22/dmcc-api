import { Router } from "express";
import {
  postRole,
  getAllRoles,
  getRole,
  putRole,
  deleteRole,
} from "../roles/role.controller.js";
const router = Router();

router.route("").post(postRole);
router.route("").get(getAllRoles);
router.route("/:id").get(getRole);
router.route("/:id").patch(putRole);
router.route("/:id").delete(deleteRole);

export default router;
