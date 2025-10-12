const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { getMyReferrals } = require("../controllers/referralController");

router.get("/my-referrals", protect, getMyReferrals);

module.exports = router;
