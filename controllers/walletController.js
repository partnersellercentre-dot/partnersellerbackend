const WalletTransaction = require("../models/WalletTransaction");
const Deposit = require("../models/depositModel");
const User = require("../models/User");
const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const { processDepositBonus } = require("../utils/bonusUtils");
// ------------------ DEPOSIT ------------------

// User initiates deposit
exports.depositRequest = async (req, res) => {
  try {
    const { amount, method, screenshot } = req.body;
    const userId = req.user.id; // from auth middleware

    const transaction = await WalletTransaction.create({
      user: userId,
      amount,
      method,
      type: "deposit",
      direction: "in",
      screenshot: screenshot || null,
      status: "pending",
    });

    await Notification.create({
      title: "New Deposit Request",
      message: `${req.user.name} requested a deposit of $${amount}.`,
      user: req.user._id,
    });

    res.status(201).json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin approves deposit
exports.approveDeposit = async (req, res) => {
  try {
    const { transactionId, amount } = req.body;

    const transaction =
      await WalletTransaction.findById(transactionId).populate("user");
    if (!transaction)
      return res.status(404).json({ message: "Transaction not found" });

    if (transaction.status !== "pending") {
      return res.status(400).json({ message: "Transaction already processed" });
    }

    // If admin provided a new amount, update it
    if (amount && typeof amount === "number" && amount > 0) {
      transaction.amount = amount;
    }

    // Update status
    transaction.status = "approved";
    await transaction.save();

    // Add balance to user
    transaction.user.balance += transaction.amount;
    await transaction.user.save();

    // Trigger Deposit Bonus (Self + Referral First Time)
    await processDepositBonus(transaction.user._id, transaction.amount);

    res.json({ success: true, message: "Deposit approved", transaction });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin rejects deposit
exports.rejectDeposit = async (req, res) => {
  try {
    const { transactionId } = req.body;

    const transaction = await WalletTransaction.findById(transactionId);
    if (!transaction)
      return res.status(404).json({ message: "Transaction not found" });

    if (transaction.status !== "pending") {
      return res.status(400).json({ message: "Transaction already processed" });
    }

    transaction.status = "rejected";
    await transaction.save();

    res.json({ success: true, message: "Deposit rejected" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.releaseBuyerEscrow = async (req, res) => {
  try {
    const { transactionId } = req.body;
    const txn =
      await WalletTransaction.findById(transactionId).populate("user purchase");
    if (
      !txn ||
      txn.type !== "escrow" ||
      (txn.direction && txn.direction !== "out")
    )
      return res.status(404).json({ message: "Escrow transaction not found" });

    // Check if 48 hours have passed since purchase
    const now = new Date();
    const created = new Date(txn.purchase.createdAt);
    const secondsPassed = (now - created) / 1000;
    if (secondsPassed < 172800)
      return res.status(400).json({ message: "48 hours not completed yet" });

    if (txn.status === "approved") {
      return res.status(400).json({ message: "Funds already released" });
    }

    txn.status = "approved";
    await txn.save();
    txn.user.balance += txn.amount;
    await txn.user.save();

    res.json({
      success: true,
      message: "Funds released to your wallet",
      transaction: txn,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
// ------------------ WITHDRAW ------------------

exports.withdrawRequest = async (req, res) => {
  try {
    const { amount, method, accountName, accountNumber } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user || user.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const fee = Math.round(amount * 0.038 * 100) / 100; // round to 2 decimals
    const netAmount = Math.round((amount - fee) * 100) / 100;

    // Deduct amount from user balance (amount already includes fee)
    user.balance -= amount;
    await user.save();

    const transaction = await WalletTransaction.create({
      user: userId,
      amount, // original amount requested
      fee, // store fee
      netAmount, // store net amount user will receive
      method,
      accountName,
      accountNumber,
      type: "withdraw",
      status: "pending",
    });
    await Notification.create({
      title: "New Withdraw Request",
      message: `${req.user.name} requested a withdrawal of $${amount}. Net payout after 3.8% fee: $${netAmount}.`,
      user: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: "Withdraw request submitted",
      transaction,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveWithdraw = async (req, res) => {
  try {
    const { transactionId } = req.body;

    const transaction =
      await WalletTransaction.findById(transactionId).populate("user");

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    if (transaction.status !== "pending") {
      return res.status(400).json({ message: "Transaction already processed" });
    }

    // No need to deduct balance here, already deducted on request

    // Update transaction status
    transaction.status = "approved";
    await transaction.save();

    res.json({ success: true, message: "Withdraw approved", transaction });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.rejectWithdraw = async (req, res) => {
  try {
    const { transactionId } = req.body;

    // Find transaction and populate user
    const transaction =
      await WalletTransaction.findById(transactionId).populate("user");
    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    if (transaction.status !== "pending") {
      return res.status(400).json({ message: "Transaction already processed" });
    }

    // Add amount back to user balance
    if (transaction.user) {
      transaction.user.balance += transaction.amount;
      await transaction.user.save();
    }

    transaction.status = "rejected";
    await transaction.save();

    res.json({
      success: true,
      message: "Withdraw rejected and amount refunded",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyTransactions = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;

    const walletTransactions = await WalletTransaction.find({
      user: userId,
    }).lean();

    const automatedDeposits = await Deposit.find({
      user: userId,
    }).lean();

    // Map automated deposits to match WalletTransaction structure
    const mappedDeposits = automatedDeposits.map((d) => ({
      _id: d._id,
      amount: d.receivedAmount || d.expectedAmount || 0,
      type: "deposit",
      method: d.system ? `${d.system} (${d.currency || ""})` : "Automated",
      status:
        d.status === "credited"
          ? "approved"
          : d.status === "failed"
            ? "rejected"
            : "pending",
      createdAt: d.createdAt || new Date(),
      isAutomated: true,
      orderId: d.orderId,
      txid: d.txid,
    }));

    // Merge and sort
    const transactions = [...walletTransactions, ...mappedDeposits].sort(
      (a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt) : 0;
        const dateB = b.createdAt ? new Date(b.createdAt) : 0;
        return dateB - dateA;
      },
    );

    const user = await User.findById(userId).select("balance name email");

    res.json({ success: true, transactions, user });
  } catch (error) {
    console.error("getMyTransactions Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin transactions
exports.getAllTransactions = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const transactions = await WalletTransaction.find(filter)
      .populate("user")
      .sort({ createdAt: -1 });
    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
