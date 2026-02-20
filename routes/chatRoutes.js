const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const { protect, adminProtect } = require("../middleware/authMiddleware");
const upload = require("../middleware/multer");

// User routes
router.get("/", protect, chatController.getUserMessages);
router.post(
  "/",
  protect,
  upload.single("image"),
  chatController.sendMessageToAdmin,
);

// Admin routes
router.get("/psc/users", adminProtect, chatController.getChatUsers);
router.get("/psc/:userId", adminProtect, chatController.getAdminUserMessages);
router.post(
  "/psc/:userId/reply",
  adminProtect,
  upload.single("image"),
  chatController.replyToUser,
);

module.exports = router;
