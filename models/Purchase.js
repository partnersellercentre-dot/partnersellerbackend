const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    amount: { type: Number, required: true }, // product price at purchase time
    status: {
      type: String,
      enum: ["to_be_paid", "paid", "cancelled"],
      default: "to_be_paid",
    },
    paymentClaimedAt: { type: Date }, // When profit was claimed
  },
  { timestamps: true }
);

module.exports = mongoose.model("Purchase", purchaseSchema);
