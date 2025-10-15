const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },

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
    stock: { type: Number, required: true }, // <-- add this line
    rating: { type: Number, default: 0 }, // <-- add this line
  },
  { timestamps: true }
);

const Product = mongoose.model("Product", productSchema);

module.exports = Product;
