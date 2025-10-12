const User = require("../models/User");

const getSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "storeName email phone bankName accountNumber ifscCode accountHolder trc20Wallet"
    );

    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

const updateSettings = async (req, res) => {
  try {
    const {
      storeName,
      email,
      phone,
      bankName,
      accountNumber,
      ifscCode,
      accountHolder,
      trc20Wallet,
    } = req.body;

    if (
      !storeName ||
      !email ||
      !phone ||
      !bankName ||
      !accountNumber ||
      !ifscCode ||
      !accountHolder ||
      !trc20Wallet
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await User.findById(req.user._id);

    if (!user) return res.status(404).json({ message: "User not found" });

    // 🚫 Prevent update if settings already exist
    const alreadyUpdated =
      user.storeName && user.bankName && user.accountNumber && user.trc20Wallet;

    if (alreadyUpdated) {
      return res
        .status(403)
        .json({ message: "Settings already updated and locked." });
    }

    // ✅ First-time update allowed
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        storeName,
        email,
        phone,
        bankName,
        accountNumber,
        ifscCode,
        accountHolder,
        trc20Wallet,
      },
      { new: true }
    ).select("-passwordHash");

    res.json({
      message: "Settings updated successfully and now locked.",
      user: updatedUser,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

module.exports = { getSettings, updateSettings };
