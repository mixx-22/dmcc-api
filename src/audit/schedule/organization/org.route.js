import { Router } from "express";
import {
  postOrganization,
  getAllOrganization,
  getOrganization,
  putOrganization,
  deleteOrganization,
} from "./org.controller.js";
import { authenticate } from "../../../users/user.controller.js";

const router = Router();

router.route("").post(authenticate, postOrganization);
router.route("").get(authenticate, getAllOrganization);
router.route("/:id").get(authenticate, getOrganization);
router
  .route("/:id")
  .put(authenticate, putOrganization)
  .patch(authenticate, putOrganization);
router.route("/:id").delete(authenticate, deleteOrganization);

export default router;
