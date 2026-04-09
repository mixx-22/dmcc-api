import { Router } from "express";
import {
  postSchedule,
  getAllSchedule,
  getSchedule,
  putSchedule,
  deleteSchedule,
  getAvailableYears,
} from "./schedule.controller.js";
import {
  getAuditKpis,
  getLatestAuditKpis,
  getSystemWideKpis,
} from "./auditKpi.controller.js";
import { authenticate } from "../../users/user.controller.js";

const router = Router();

router.route("").post(authenticate, postSchedule);
router.route("").get(authenticate, getAllSchedule);

// Special routes - must come before /:id to avoid path conflicts
router.route("/years").get(authenticate, getAvailableYears);
router.route("/kpis/system").get(authenticate, getSystemWideKpis);
router.route("/latest/kpis").get(authenticate, getLatestAuditKpis);
router.route("/:auditScheduleId/kpis").get(authenticate, getAuditKpis);

router.route("/:id").get(authenticate, getSchedule);
router
  .route("/:id")
  .put(authenticate, putSchedule)
  .patch(authenticate, putSchedule);
router.route("/:id").delete(authenticate, deleteSchedule);

export default router;
