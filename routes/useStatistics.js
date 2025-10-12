const express = require("express");
const router = express.Router();
const { getBasicStats } = require("../controllers/getBasicStats");
const { protect } = require("../middleware/authMiddleware"); // Use the correct exported middleware

router.get("/basic", protect, getBasicStats);

module.exports = router;
