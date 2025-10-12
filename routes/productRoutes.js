const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const upload = require("../middleware/multer"); // Import multer middleware

// Create Product (Admin only)
router.post("/create", upload.single("image"), productController.createProduct);
router.put("/:id", upload.single("image"), productController.updateProduct);

// Get all products
router.get("/", productController.getProducts);

router.get("/category/:category", productController.getProductsByCategory);
// Get a product by ID
router.get("/:id", productController.getProductById);

// Delete Product (Admin only)
router.delete("/:id", productController.deleteProduct);

module.exports = router;
