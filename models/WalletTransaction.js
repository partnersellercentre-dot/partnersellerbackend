// models/WalletTransaction.js
const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    type: {
      type: String,
      enum: [
        "deposit",
        "withdraw",
        "escrow",
        "bonus",
        "deposit_bonus_self",
        "referral_bonus",
        "referral_recharge_bonus",
        "team_commission",
        "profit",
        "transfer",
      ],
      required: true,
    },
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: "Purchase" }, // <-- add this line
    method: {
      type: String,
      enum: [
        "Bank Transfer",
        "Easypaisa",
        "JazzCash",
        "Bkash",
        "Nagad",
        "UPI",
        "Escrow",
        "USDT (TRC20)",
        "USDT (BEP20)",
        "Signup Bonus",
        "Referral Bonus",
        "Team Commission",
        "Referral Recharge Bonus",
        "Bonus",
        "Profit",
        "Transfer",
      ],
      required: function () {
        return (
          this.type !== "escrow" &&
          this.type !== "bonus" &&
          this.type !== "profit" &&
          this.type !== "transfer"
        );
      },
      default: function () {
        if (this.type === "escrow") return "Escrow";
        if (this.type === "bonus") return "Bonus";
        if (this.type === "profit") return "Profit";
        if (this.type === "transfer") return "Transfer";
        return undefined;
      },
    },
    direction: { type: String, enum: ["in", "out"], default: "out" }, // <-- ADD THIS LINE

    accountName: { type: String }, // ✅ added
    accountNumber: { type: String }, // ✅ added
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    fee: { type: Number, default: 0 }, // <-- add this
    netAmount: { type: Number, default: 0 }, // <-- add this
    // Track which sub-balances were deducted for withdrawals/purchases
    deductions: {
      balance: { type: Number, default: 0 },
      profit: { type: Number, default: 0 },
      selfBonus: { type: Number, default: 0 },
      teamCommission: { type: Number, default: 0 },
      referralBonus: { type: Number, default: 0 },
      signupBonus: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
