const mongoose = require("mongoose");

const RangeSchema = new mongoose.Schema({
  min: { type: Number, required: true },
  max: { type: Number, required: true },
  bonus: { type: Number, required: true },
  isPercentage: { type: Boolean, default: false }, // optional: if bonus is % or flat
});

const LevelSchema = new mongoose.Schema({
  level: { type: Number, required: true }, // 1, 2, 3...
  ranges: [RangeSchema],
});

const SimpleLevelSchema = new mongoose.Schema({
  level: { type: Number, required: true },
  percentage: { type: Number, required: true },
});

const systemSettingsSchema = new mongoose.Schema(
  {
    signupBonus: {
      type: Number,
      default: 0,
    },
    // Deprecated simple referralBonus
    referralBonus: {
      type: Number,
      default: 0,
    },
    // New complex settings
    // referralDepositSettings: [LevelSchema], // Deprecated/Replaced
    referralOrderSettings: [SimpleLevelSchema],

    // New Deposit Bonus Settings
    // depositSelfBonusPercentage: { type: Number, default: 0 },
    // referralFirstDepositBonusPercentage: { type: Number, default: 0 },
    // referralFirstDepositMinAmount: { type: Number, default: 0 },

    // Range-based Deposit Settings
    depositSelfRanges: [RangeSchema],
    referralFirstDepositRanges: [RangeSchema],

    // Social Links
    socialLinks: {
      whatsapp: { type: String, default: "https://wa.me/923166226704" },
      telegram: { type: String, default: "https://t.me/+923166226704" },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("SystemSettings", systemSettingsSchema);
