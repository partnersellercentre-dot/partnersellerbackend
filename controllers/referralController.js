const User = require("../models/User");
const KYC = require("../models/KYC");

// Get users referred by the current user
const getMyReferrals = async (req, res) => {
  try {
    const referrals = await User.find({ referredBy: req.user.id })
      .select(
        "name email createdAt referralCode storeName accountLevel accountStatus isVerified"
      )
      .sort({ createdAt: -1 });

    // Add KYC status to each referral
    const referralsWithKyc = await Promise.all(
      referrals.map(async (referral) => {
        const kyc = await KYC.findOne({ user: referral._id });
        const isKycApproved = kyc && kyc.status === "approved";
        return { ...referral.toObject(), isKycApproved };
      })
    );

    res.json({ referrals: referralsWithKyc });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

module.exports = { getMyReferrals };
