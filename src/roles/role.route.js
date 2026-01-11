import { Router } from "express";
import {
  postRole,
  getAllRoles,
  getRole,
  putRole,
  deleteRole,
} from "../roles/role.controller.js";
const router = Router();

router.use((req, res, next) => {
  console.log(`[roles route] ${req.method} ${req.originalUrl}`);
  next();
});

router.all("/:id", (req, res, next) => {
  console.log(`[roles route matched /:id] ${req.method} id=${req.params.id}`);
  next();
});

router.route("").post(postRole);
router.route("").get(getAllRoles);
router.route("/:id").get(getRole);
router.route("/:id").put(putRole).patch(putRole);
router.route("/:id").delete(deleteRole);

export default router;
