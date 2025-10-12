const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "Gadgets",
        "Electronics",
        "Watches",
        "Women's fashion",
        "Hoodies & shirts",
        "Toys",
        "Shoes",
        "Shirts",
        "Books",
        "Home Decores",
        "Health & Wellness",
      ],
    },
    image: { type: String },
  },
  { timestamps: true }
);

const Product = mongoose.model("Product", productSchema);

module.exports = Product;
