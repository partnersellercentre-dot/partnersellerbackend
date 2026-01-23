const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const { protect, adminProtect } = require("../middleware/authMiddleware");

// User routes
router.get("/", protect, chatController.getUserMessages);
router.post("/", protect, chatController.sendMessageToAdmin);

// Admin routes
router.get("/admin/users", adminProtect, chatController.getChatUsers);
router.get("/admin/:userId", adminProtect, chatController.getAdminUserMessages);
router.post("/admin/:userId/reply", adminProtect, chatController.replyToUser);

module.exports = router;
