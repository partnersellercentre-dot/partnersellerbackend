// models/WalletTransaction.js
const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    type: {
      type: String,
      enum: ["deposit", "withdraw", "escrow", "bonus"],
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
        "Bonus",
      ],
      required: function () {
        return this.type !== "escrow" && this.type !== "bonus";
      },
      default: function () {
        if (this.type === "escrow") return "Escrow";
        if (this.type === "bonus") return "Bonus";
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
  },
  { timestamps: true },
);

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
