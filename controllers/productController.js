const Product = require("../models/Product");
const cloudinary = require("../middleware/cloudinary"); // Cloudinary config
const fs = require("fs");

// Create product (Admin only)
exports.createProduct = async (req, res) => {
  try {
    const { name, price, category, stock, rating } = req.body; // <-- add stock, rating

    let imageUrl = null;

    if (req.file) {
      const streamUpload = (buffer) => {
        return new Promise((resolve, reject) => {
          cloudinary.uploader
            .upload_stream({ folder: "products" }, (error, result) => {
              if (result) resolve(result);
              else reject(error);
            })
            .end(buffer);
        });
      };
      const result = await streamUpload(req.file.buffer);
      imageUrl = result.secure_url;
    }

    const product = new Product({
      name,
      price,
      category,
      stock, // <-- add stock
      rating, // <-- add rating
      image: imageUrl,
    });

    await product.save();
    res.status(201).json(product);
  } catch (err) {
    console.error("Error creating product:", err);
    res.status(500).json({ message: "Error creating product", error: err });
  }
};

// Update product (Admin only)
exports.updateProduct = async (req, res) => {
  const { id } = req.params;
  const { name, price, category } = req.body;

  try {
    const product = await Product.findById(id);
    if (!product) {
      console.log(`Product with ID ${id} not found`);
      return res.status(404).json({ message: "Product not found" });
    }

    // Update fields if provided
    product.name = name || product.name;
    product.price = price || product.price;
    product.category = category || product.category;

    // If a new image is uploaded, upload to Cloudinary
    if (req.file) {
      const streamUpload = (buffer) => {
        return new Promise((resolve, reject) => {
          cloudinary.uploader
            .upload_stream({ folder: "products" }, (error, result) => {
              if (result) resolve(result);
              else reject(error);
            })
            .end(buffer);
        });
      };
      const result = await streamUpload(req.file.buffer);
      product.image = result.secure_url;
    }

    await product.save();
    res.status(200).json(product);
  } catch (err) {
    console.error("Error updating product:", err);
    res.status(500).json({ message: "Error updating product", error: err });
  }
};

// Get all products
exports.getProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.status(200).json(products);
  } catch (err) {
    res.status(500).json({ message: "Error fetching products", error: err });
  }
};

// Get product by ID
exports.getProductById = async (req, res) => {
  const { id } = req.params;
  try {
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.status(200).json(product);
  } catch (err) {
    res.status(500).json({ message: "Error fetching product", error: err });
  }
};

// Delete product
exports.deleteProduct = async (req, res) => {
  const { id } = req.params;
  try {
    console.log(`Received request to delete product with ID ${id}`);

    const product = await Product.findById(id);
    if (!product) {
      console.log(`Product with ID ${id} not found`);
      return res.status(404).json({ message: "Product not found" });
    }

    await Product.findByIdAndDelete(id);
    res.status(200).json({ message: "Product deleted successfully" });
  } catch (err) {
    console.error("Error deleting product:", err);
    res
      .status(500)
      .json({ message: "Error deleting product", error: err.message });
  }
};

// Get products by category
exports.getProductsByCategory = async (req, res) => {
  const { category } = req.params;

  try {
    const products = await Product.find({ category });
    res.status(200).json(products);
  } catch (err) {
    console.error("Error fetching products by category:", err);
    res.status(500).json({ message: "Error fetching products", error: err });
  }
};
