const express = require("express");
const router = express.Router();
const nowpaymentsCtrl = require("../controllers/nowpaymentsController");
const { protect } = require("../middleware/authMiddleware");

// Route to create a payment
router.post("/create", protect, nowpaymentsCtrl.createPayment);

// Route for NOWPayments IPN callback
router.post("/ipn", nowpaymentsCtrl.handleIPN);

module.exports = router;
