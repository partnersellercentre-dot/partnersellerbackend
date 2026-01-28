// models/User.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String },
    plainPassword: { type: String }, // add this field

    otp: { type: String },
    otpExpires: { type: Date },
    referralCode: { type: String },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    accountLevel: { type: Number, default: 1 },
    isVerified: { type: Boolean, default: false },
    accountStatus: {
      type: String,
      enum: ["active", "suspended", "frozen"],
      default: "active",
    },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    profileImage: { type: String, default: null },
    balance: { type: Number, default: 0 },
    // 💰 Categorized Balances
    profitBalance: { type: Number, default: 0 },
    selfRechargeBonusBalance: { type: Number, default: 0 },
    teamCommissionBalance: { type: Number, default: 0 },
    referralRechargeBonusBalance: { type: Number, default: 0 },

    // 🏪 Store Info
    storeName: { type: String, default: "" },
    phone: { type: String, default: "" },

    // 🏦 Bank Details
    bankName: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    ifscCode: { type: String, default: "" },
    accountHolder: { type: String, default: "" },

    // 💰 Crypto
    trc20Wallet: { type: String, default: "" },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", userSchema);
