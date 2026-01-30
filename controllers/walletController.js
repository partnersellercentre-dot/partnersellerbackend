const WalletTransaction = require("../models/WalletTransaction");
const Deposit = require("../models/depositModel");
const User = require("../models/User");
const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const SystemSettings = require("../models/SystemSettings");
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

    // Check if 24 hours have passed since purchase
    const now = new Date();
    const created = new Date(txn.purchase.createdAt);
    const secondsPassed = (now - created) / 1000;
    if (secondsPassed < 86400)
      return res.status(400).json({ message: "24 hours not completed yet" });

    if (txn.status === "approved") {
      return res.status(400).json({ message: "Funds already released" });
    }

    txn.status = "approved";
    await txn.save();

    // Add balance to user
    const user = await User.findById(txn.user._id);
    user.balance = Math.round((user.balance + txn.amount) * 100) / 100;
    await user.save();

    // Create a new transaction record for the release/transfer in
    await WalletTransaction.create({
      user: txn.user._id,
      amount: txn.amount,
      type: "transfer",
      status: "approved",
      direction: "in",
      purchase: txn.purchase?._id,
      method: "Transfer",
    });

    res.json({
      success: true,
      message: "Funds transferred to your wallet",
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
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const earnedBalance =
      (user.profitBalance || 0) +
      (user.teamCommissionBalance || 0) +
      (user.referralRechargeBonusBalance || 0) +
      (user.selfRechargeBonusBalance || 0);

    const settings = await SystemSettings.findOne();
    let maxWithdrawable = user.balance;

    if (settings?.restrictWithdrawalToProfits) {
      maxWithdrawable = earnedBalance;
    }

    if (maxWithdrawable < amount) {
      return res.status(400).json({
        message: settings?.restrictWithdrawalToProfits
          ? "Insufficient earned balance"
          : "Insufficient balance",
      });
    }

    const fee = Math.round(amount * 0.038 * 100) / 100; // round to 2 decimals
    const netAmount = Math.round((amount - fee) * 100) / 100;

    // Deduct with priority: Profits/Bonuses first
    let remainingToDeduct = amount;
    const deductions = {
      balance: 0,
      profit: 0,
      teamCommission: 0,
      referralBonus: 0,
      selfBonus: 0,
    };

    const fromProfit = Math.min(user.profitBalance, remainingToDeduct);
    user.profitBalance -= fromProfit;
    user.balance -= fromProfit;
    remainingToDeduct -= fromProfit;
    deductions.profit = fromProfit;

    if (remainingToDeduct > 0) {
      const fromTeam = Math.min(user.teamCommissionBalance, remainingToDeduct);
      user.teamCommissionBalance -= fromTeam;
      user.balance -= fromTeam;
      remainingToDeduct -= fromTeam;
      deductions.teamCommission = fromTeam;
    }

    if (remainingToDeduct > 0) {
      const fromRef = Math.min(
        user.referralRechargeBonusBalance,
        remainingToDeduct,
      );
      user.referralRechargeBonusBalance -= fromRef;
      user.balance -= fromRef;
      remainingToDeduct -= fromRef;
      deductions.referralBonus = fromRef;
    }

    if (remainingToDeduct > 0) {
      const fromSelf = Math.min(
        user.selfRechargeBonusBalance,
        remainingToDeduct,
      );
      user.selfRechargeBonusBalance -= fromSelf;
      user.balance -= fromSelf;
      remainingToDeduct -= fromSelf;
      deductions.selfBonus = fromSelf;
    }

    if (remainingToDeduct > 0) {
      const fromBalance = Math.min(user.balance, remainingToDeduct);
      user.balance -= fromBalance;
      remainingToDeduct -= fromBalance;
      deductions.balance = fromBalance;
    }

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
      deductions,
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

    // Add amount back to user balance categories
    if (transaction.user) {
      const d = transaction.deductions || {};
      transaction.user.balance += transaction.amount;
      transaction.user.profitBalance += d.profit || 0;
      transaction.user.teamCommissionBalance += d.teamCommission || 0;
      transaction.user.referralRechargeBonusBalance += d.referralBonus || 0;
      transaction.user.selfRechargeBonusBalance += d.selfBonus || 0;

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
    const { tab = "account", page = 1, limit = 10 } = req.query;
    const p = parseInt(page);
    const l = parseInt(limit);
    const skip = (p - 1) * l;

    let walletFilter = { user: userId };
    if (tab === "deposit") {
      walletFilter.type = "deposit";
    } else if (tab === "withdrawal") {
      walletFilter.type = "withdraw";
    } else if (tab === "account") {
      // Exclude deposits from account details as they have their own tab
      walletFilter.type = { $ne: "deposit" };
      walletFilter.status = "approved";
    }

    // Fetch WalletTransactions
    const walletTransactions =
      await WalletTransaction.find(walletFilter).lean();

    let mappedDeposits = [];
    if (tab === "deposit") {
      const automatedDeposits = await Deposit.find({ user: userId }).lean();
      mappedDeposits = automatedDeposits.map((d) => ({
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
    }

    // Merge and sort
    let allRecords = [...walletTransactions, ...mappedDeposits].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt) : 0;
      const dateB = b.createdAt ? new Date(b.createdAt) : 0;
      return dateB - dateA;
    });

    const totalRecords = allRecords.length;
    const paginatedRecords = allRecords.slice(skip, skip + l);

    const user = await User.findById(userId).select(
      "balance profitBalance teamCommissionBalance selfRechargeBonusBalance referralRechargeBonusBalance name email",
    );

    const settings = await SystemSettings.findOne();
    const earnedBalance =
      (user.profitBalance || 0) +
      (user.teamCommissionBalance || 0) +
      (user.referralRechargeBonusBalance || 0) +
      (user.selfRechargeBonusBalance || 0);

    let withdrawableBalance = user.balance;

    if (settings?.restrictWithdrawalToProfits) {
      withdrawableBalance = Math.min(earnedBalance, user.balance);
    }

    // Calculate total escrow for the user (all records, not just paginated)
    const escrowTxns = await WalletTransaction.find({
      user: userId,
      type: "escrow",
      status: "pending",
      direction: "out",
    });
    const totalEscrow = escrowTxns.reduce((sum, txn) => sum + txn.amount, 0);

    res.json({
      success: true,
      transactions: paginatedRecords,
      totalRecords,
      totalPages: Math.ceil(totalRecords / l),
      currentPage: p,
      totalEscrow,
      user,
      withdrawableBalance,
      isRestricted: settings?.restrictWithdrawalToProfits || false,
    });
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
