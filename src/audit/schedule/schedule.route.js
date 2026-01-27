import { Router } from "express";
import {
  postSchedule,
  getAllSchedule,
  getSchedule,
  putSchedule,
  deleteSchedule,
} from "./schedule.controller.js";
import { authenticate } from "../../users/user.controller.js";

const router = Router();

router.route("").post(authenticate, postSchedule);
router.route("").get(authenticate, getAllSchedule);
router.route("/:id").get(authenticate, getSchedule);
router
  .route("/:id")
  .put(authenticate, putSchedule)
  .patch(authenticate, putSchedule);
router.route("/:id").delete(authenticate, deleteSchedule);

export default router;
