const mongoose = require("mongoose");

const depositSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  orderId: { type: String, required: true, unique: true }, // invoice id from Paykassa
  expectedAmount: { type: Number, required: true },
  system: { type: String, required: true }, // e.g. 'TRON_TRC20' etc
  currency: { type: String, required: true }, // e.g. 'USDT'
  walletAddress: { type: String, required: true },
  tag: { type: String }, // optional
  status: {
    type: String,
    enum: ["pending", "credited", "failed"],
    default: "pending",
  },
  txid: { type: String },
  receivedAmount: { type: Number },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
});

depositSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Deposit", depositSchema);
