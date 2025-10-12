const express = require("express");
const {
  registerAdmin,
  loginAdmin,
  getAdminProfile,
  getAllUsers,
  deleteUserById,
  verifyOrRejectKYC,
  updateUserStatus,
} = require("../controllers/adminController");
const { admin, adminProtect } = require("../middleware/authMiddleware");
const Purchase = require("../models/Purchase"); // Add at top
const WalletTransaction = require("../models/WalletTransaction"); // Add at top
const router = express.Router();

// Register Admin
router.post("/register", registerAdmin);

// Login Admin
router.post("/login", loginAdmin);

router.get("/users", adminProtect, admin, getAllUsers);
router.get("/orders", adminProtect, admin, async (req, res) => {
  try {
    const orders = await Purchase.find();
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

router.get("/revenue", adminProtect, admin, async (req, res) => {
  try {
    // Only approved deposits
    const deposits = await WalletTransaction.find({
      type: "deposit",
      status: "approved",
    });
    const totalRevenue = deposits.reduce((sum, tx) => sum + tx.amount, 0);
    res.json({ totalRevenue });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});
router.put("/verify/:id", adminProtect, admin, verifyOrRejectKYC);

router.get("/admin-profile", adminProtect, admin, getAdminProfile);
router.delete("/users/:id", adminProtect, deleteUserById); // DELETE route to delete a user
router.put("/users/:id/status", adminProtect, admin, updateUserStatus);

module.exports = router;
