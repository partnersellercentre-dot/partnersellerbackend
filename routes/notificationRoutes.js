const express = require("express");
const router = express.Router();
const {
  createNotification,
  getAllNotifications,
  markAsRead,
} = require("../controllers/notificationController");
const { adminProtect, admin } = require("../middleware/authMiddleware");

// ✅ Get all notifications (Admin only)
router.get("/", adminProtect, admin, getAllNotifications);

// ✅ Mark a notification as read
router.put("/:id/read", adminProtect, admin, markAsRead);

module.exports = router;
