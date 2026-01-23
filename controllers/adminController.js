const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const KYC = require("../models/KYC"); // ✅ Add this import
const SystemSettings = require("../models/SystemSettings");

// Generate JWT Token (include role)
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// Register Admin
const registerAdmin = async (req, res) => {
  const { username, password } = req.body;

  try {
    const adminExists = await Admin.findOne({ username });
    if (adminExists) {
      return res.status(400).json({ error: "Admin already exists" });
    }

    const admin = new Admin({ username, password });
    await admin.save();

    const token = generateToken(admin._id, "admin");

    res.status(201).json({
      message: "Admin registered successfully",
      token,
      admin: {
        _id: admin._id,
        username: admin.username,
        role: admin.role,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Admin Login
const loginAdmin = async (req, res) => {
  const { username, password } = req.body;

  try {
    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(400).json({ error: "Admin does not exist" });
    }

    const isMatch = await admin.matchPassword(password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = generateToken(admin._id, "admin");

    res.status(200).json({
      message: "Login successful",
      token,
      admin: {
        _id: admin._id,
        username: admin.username,
        role: admin.role,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Admin Profile
const getAdminProfile = async (req, res) => {
  try {
    const admin = req.admin;
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }
    res.json({
      _id: admin._id,
      username: admin.username,
      role: admin.role,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}, "+plainPassword").lean(); // ✅ lean ensures plain JS
    // Add KYC status to each user
    const usersWithKyc = await Promise.all(
      users.map(async (user) => {
        const kyc = await KYC.findOne({ user: user._id });
        const isKycApproved = kyc && kyc.status === "approved";
        return { ...user, isKycApproved };
      }),
    );
    res.json({ users: usersWithKyc });
  } catch (err) {
    console.error("Get all users error:", err.message);
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // status: "active", "suspended", "frozen"
    if (!["active", "suspended", "frozen"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.accountStatus = status;
    user.isVerified = status === "active";
    await user.save();

    res.status(200).json({ message: `User ${status} successfully`, user });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

// Delete user
const deleteUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("Delete user error:", err.message);
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

// ✅ Admin Verify or Reject KYC
const verifyOrRejectKYC = async (req, res) => {
  try {
    const { status, reason } = req.body; // status = "approved" or "rejected"
    const kycId = req.params.id;

    // Ensure valid status
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const kyc = await KYC.findById(kycId);
    if (!kyc) {
      return res.status(404).json({ error: "KYC not found" });
    }

    // Update status and rejection reason if applicable
    kyc.status = status;
    if (status === "rejected" && reason) {
      kyc.rejectionReason = reason;
    }

    await kyc.save();

    res.status(200).json({
      message: `KYC ${
        status === "approved" ? "approved ✅" : "rejected ❌"
      } successfully`,
      kyc,
    });
  } catch (err) {
    console.error("Error verifying/rejecting KYC:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};

// --- System Settings ---
const getSystemSettings = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = await SystemSettings.create({
        signupBonus: 0,
        referralBonus: 0,
      });
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

const updateSystemSettings = async (req, res) => {
  try {
    const {
      signupBonus,
      referralBonus,
      referralDepositSettings,
      referralOrderSettings,
    } = req.body;
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = new SystemSettings({
        signupBonus,
        referralBonus,
        referralDepositSettings,
        referralOrderSettings,
      });
    } else {
      if (signupBonus !== undefined) settings.signupBonus = signupBonus;
      if (referralBonus !== undefined) settings.referralBonus = referralBonus;
      if (referralDepositSettings !== undefined)
        settings.referralDepositSettings = referralDepositSettings;
      if (referralOrderSettings !== undefined)
        settings.referralOrderSettings = referralOrderSettings;
    }
    await settings.save();
    res.json({ message: "Settings updated successfully", settings });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

module.exports = {
  registerAdmin,
  loginAdmin,
  getAdminProfile,
  getAllUsers,
  deleteUserById,
  updateUserStatus, // <-- add this

  verifyOrRejectKYC, // ✅ add this line
  getSystemSettings,
  updateSystemSettings,
};
