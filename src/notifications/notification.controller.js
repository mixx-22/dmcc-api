import { Notification } from "./notification.model.js";

// ---------------------------------------------------------------------------
// GET /notifications  — list notifications for the authenticated user
// ---------------------------------------------------------------------------
const getNotifications = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const maxLimit = 100;
    let limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
    if (limit > maxLimit) limit = maxLimit;

    const filter = { recipient: userId };

    // Optional: filter by read status
    if (req.query.read === "true") filter.read = true;
    if (req.query.read === "false") filter.read = false;

    // Optional: filter by roleType
    if (req.query.roleType) filter.roleType = req.query.roleType;

    const total = await Notification.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const data = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.status(200).json({
      success: true,
      message: "Notifications retrieved successfully",
      data,
      meta: { total, page, limit, totalPages },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve notifications",
      error: error.message,
    });
  }
};

// ---------------------------------------------------------------------------
// GET /notifications/unread-count
// ---------------------------------------------------------------------------
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const count = await Notification.countDocuments({
      recipient: userId,
      read: false,
    });

    return res.status(200).json({ success: true, count });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to get unread count",
      error: error.message,
    });
  }
};

// ---------------------------------------------------------------------------
// PATCH /notifications/:id/read  — mark a single notification as read
// ---------------------------------------------------------------------------
const markAsRead = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: userId },
      { read: true, readAt: new Date() },
      { new: true },
    );

    if (!notif) {
      return res.status(404).json({ message: "Notification not found." });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read",
      data: notif,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to mark notification as read",
      error: error.message,
    });
  }
};

// ---------------------------------------------------------------------------
// PATCH /notifications/read-all  — mark all notifications as read
// ---------------------------------------------------------------------------
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    const result = await Notification.updateMany(
      { recipient: userId, read: false },
      { read: true, readAt: new Date() },
    );

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to mark all as read",
      error: error.message,
    });
  }
};

// ---------------------------------------------------------------------------
// DELETE /notifications/:id  — delete a single notification
// ---------------------------------------------------------------------------
const deleteNotification = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const notif = await Notification.findOneAndDelete({
      _id: req.params.id,
      recipient: userId,
    });

    if (!notif) {
      return res.status(404).json({ message: "Notification not found." });
    }

    return res.status(200).json({
      success: true,
      message: "Notification deleted",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete notification",
      error: error.message,
    });
  }
};

export {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
