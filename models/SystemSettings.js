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
    referralDepositSettings: [LevelSchema],
    referralOrderSettings: [LevelSchema],
  },
  { timestamps: true },
);

module.exports = mongoose.model("SystemSettings", systemSettingsSchema);
