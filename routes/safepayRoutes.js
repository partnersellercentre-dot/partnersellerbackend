const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  createTracker,
  handleWebhook,
} = require("../controllers/wpayController");

router.post("/create-tracker", protect, createTracker);
router.post("/webhook", handleWebhook);

module.exports = router;
