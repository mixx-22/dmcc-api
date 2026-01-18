import { Router } from "express";
import {
  postRole,
  getAllRoles,
  getRole,
  putRole,
  deleteRole,
} from "../roles/role.controller.js";
import { authenticate } from "../users/user.controller.js";
const router = Router();

router.use((req, res, next) => {
  console.log(`[roles route] ${req.method} ${req.originalUrl}`);
  next();
});

router.all("/:id", (req, res, next) => {
  console.log(`[roles route matched /:id] ${req.method} id=${req.params.id}`);
  next();
});

router.route("").post(authenticate, postRole);
router.route("").get(authenticate, getAllRoles);
router.route("/:id").get(authenticate, getRole);
router.route("/:id").put(authenticate, putRole).patch(authenticate, putRole);
router.route("/:id").delete(authenticate, deleteRole);

export default router;
