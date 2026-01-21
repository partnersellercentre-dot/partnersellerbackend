const mongoose = require("mongoose");

const systemSettingsSchema = new mongoose.Schema(
  {
    signupBonus: {
      type: Number,
      default: 0,
    },
    referralBonus: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("SystemSettings", systemSettingsSchema);
