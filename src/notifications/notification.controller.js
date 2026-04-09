import { Notification } from "./notification.model.js";
import mongoose from "mongoose";

const getNotifications = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const maxLimit = 100;
    let limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
    if (limit > maxLimit) limit = maxLimit;

    const filter = { recipient: userId };
    if (req.query.read !== undefined) {
      filter.read = req.query.read === "true";
    }

    const total = await Notification.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const data = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      read: false,
    });

    return res.status(200).json({
      success: true,
      data,
      unreadCount,
      meta: { total, page, limit, totalPages },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
};

const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      read: false,
    });
    return res.status(200).json({ success: true, unreadCount });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
};

const markAsRead = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid notification ID." });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient: userId },
      { read: true },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found." });
    }

    return res.status(200).json({ success: true, notification });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
};

const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    const result = await Notification.updateMany(
      { recipient: userId, read: false },
      { read: true },
    );

    return res.status(200).json({
      success: true,
      message: `${result.modifiedCount} notification(s) marked as read.`,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
};

const deleteNotification = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid notification ID." });
    }

    const notification = await Notification.findOneAndDelete({
      _id: id,
      recipient: userId,
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found." });
    }

    return res
      .status(200)
      .json({ success: true, message: "Notification deleted." });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error.", error: error.message });
  }
};

export {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
