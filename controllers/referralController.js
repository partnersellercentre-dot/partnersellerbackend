const User = require("../models/User");

// Get users referred by the current user
const getMyReferrals = async (req, res) => {
  try {
    const referrals = await User.find({ referredBy: req.user.id })
      .select("name email createdAt referralCode")
      .sort({ createdAt: -1 });

    res.json({ referrals });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

module.exports = { getMyReferrals };
