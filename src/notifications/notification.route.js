import { Router } from "express";
import { authenticate } from "../users/user.controller.js";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "./notification.controller.js";

const router = Router();

router.get("/", authenticate, getNotifications);
router.get("/unread-count", authenticate, getUnreadCount);
router.patch("/read-all", authenticate, markAllAsRead);
router.patch("/:id/read", authenticate, markAsRead);
router.delete("/:id", authenticate, deleteNotification);

export default router;
