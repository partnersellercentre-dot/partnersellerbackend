const express = require("express");
const router = express.Router();
const walletController = require("../controllers/walletController");
const {
  protect,
  adminProtect,
  admin,
} = require("../middleware/authMiddleware");

// ------------------ USER ------------------
router.post("/deposit", protect, walletController.depositRequest);
router.post("/withdraw", protect, walletController.withdrawRequest);
router.post("/transfer", protect, walletController.transferFunds);

// ------------------ ADMIN ------------------
router.post(
  "/deposit/approve",
  adminProtect,
  admin,
  walletController.approveDeposit,
);
router.post(
  "/deposit/reject",
  adminProtect,
  admin,
  walletController.rejectDeposit,
);

router.post(
  "/withdraw/approve",
  adminProtect,
  admin,
  walletController.approveWithdraw,
);
router.post(
  "/withdraw/reject",
  adminProtect,
  admin,
  walletController.rejectWithdraw,
);

router.get("/my-transactions", protect, walletController.getMyTransactions);
router.get(
  "/transactions",
  adminProtect,
  admin,
  walletController.getAllTransactions,
);

router.delete(
  "/transactions/:transactionId",
  adminProtect,
  admin,
  walletController.deleteTransaction,
);

router.post(
  "/release-buyer-escrow",
  protect,
  walletController.releaseBuyerEscrow,
);

module.exports = router;
