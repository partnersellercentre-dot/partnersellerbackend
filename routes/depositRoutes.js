const express = require("express");
const router = express.Router();
const depositCtrl = require("../controllers/depositController");

// Public / authenticated route to init deposit
router.post("/init", depositCtrl.initDeposit);

// IPN callback route (no auth, Paykassa posts)
router.post("/ipn", express.raw({ type: "*/*" }), depositCtrl.handleIpn);

// Query status
router.get("/status", depositCtrl.getDepositStatus);

// Transaction notify route
router.post(
  "/transaction-notify",
  express.raw({ type: "*/*" }),
  depositCtrl.handleTransactionNotification
);

if (process.env.NODE_ENV !== "production") {
  router.post("/mock-payment", depositCtrl.mockDepositPayment);
}
module.exports = router;
