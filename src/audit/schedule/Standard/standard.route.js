import { Router } from "express";
import {
  postStandard,
  getAllStandard,
  getStandard,
  putStandard,
  deleteStandard,
} from "./standard.controller.js";
import { authenticate } from "../../../users/user.controller.js";

const router = Router();

router.route("").post(authenticate, postStandard);
router.route("").get(authenticate, getAllStandard);
router.route("/:id").get(authenticate, getStandard);
router
  .route("/:id")
  .put(authenticate, putStandard)
  .patch(authenticate, putStandard);
router.route("/:id").delete(authenticate, deleteStandard);

export default router;
