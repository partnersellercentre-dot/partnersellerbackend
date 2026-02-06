const express = require("express");
const {
  registerAdmin,
  loginAdmin,
  getAdminProfile,
  getAllUsers,
  deleteUserById,
  verifyOrRejectKYC,
  updateUserStatus,
  addBalanceToUser,
  getSystemSettings,
  updateSystemSettings,
  getAllAdmins,
  deleteAdmin,
  updateAdmin,
} = require("../controllers/adminController");
const { admin, adminProtect } = require("../middleware/authMiddleware");
const Purchase = require("../models/Purchase"); // Add at top
const WalletTransaction = require("../models/WalletTransaction"); // Add at top
const SystemSettings = require("../models/SystemSettings"); // Add this import
const router = express.Router();

// Register Admin
router.post("/register", adminProtect, admin, registerAdmin);

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
router.post("/users/:id/add-balance", adminProtect, admin, addBalanceToUser);

// Admins Management
router.get("/all-admins", adminProtect, admin, getAllAdmins);
router.delete("/admins/:id", adminProtect, admin, deleteAdmin);
router.put("/admins/:id", adminProtect, admin, updateAdmin);

// System Settings
router.get("/settings", adminProtect, admin, getSystemSettings);
router.put("/settings", adminProtect, admin, updateSystemSettings);

// Public: Get Social Links
router.get("/social-links", async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = await SystemSettings.create({
        socialLinks: {
          whatsapp: "https://whatsapp.com/channel/0029ValL7m9BvvsfXZRk0Q3K",
          telegram: "https://t.me/partnersellercentre",
        },
      });
    }
    res.json({ socialLinks: settings.socialLinks });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

module.exports = router;
