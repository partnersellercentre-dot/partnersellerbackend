// models/WalletTransaction.js
const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    type: {
      type: String,
      enum: ["deposit", "withdraw", "escrow"],
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
      ],
      required: function () {
        return this.type !== "escrow";
      },
      default: function () {
        return this.type === "escrow" ? "Escrow" : undefined;
      },
    },
    direction: { type: String, enum: ["out"], default: "out" }, // <-- ADD THIS LINE

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
  { timestamps: true }
);

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
