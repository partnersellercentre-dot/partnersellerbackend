const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const upload = require("../middleware/multer"); // Import multer middleware
const { adminProtect, admin } = require("../middleware/authMiddleware");

// Create Product (Admin only)
router.post(
  "/create",
  adminProtect,
  admin,
  upload.single("image"),
  productController.createProduct,
);
router.put(
  "/:id",
  adminProtect,
  admin,
  upload.single("image"),
  productController.updateProduct,
);

// Get all products
router.get("/", productController.getProducts);

router.get("/category/:category", productController.getProductsByCategory);
// Get a product by ID
router.get("/:id", productController.getProductById);

// Delete Product (Admin only)
router.delete("/:id", adminProtect, admin, productController.deleteProduct);

module.exports = router;
