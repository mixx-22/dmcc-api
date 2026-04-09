import { Router } from "express";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "./notification.controller.js";
import { authenticate } from "../users/user.controller.js";

const router = Router();

router.route("").get(authenticate, getNotifications);
router.route("/unread-count").get(authenticate, getUnreadCount);
router.route("/read-all").patch(authenticate, markAllAsRead);
router.route("/:id/read").patch(authenticate, markAsRead);
router.route("/:id").delete(authenticate, deleteNotification);

export default router;
