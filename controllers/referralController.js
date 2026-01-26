const User = require("../models/User");
const KYC = require("../models/KYC");
const Deposit = require("../models/depositModel");
const WalletTransaction = require("../models/WalletTransaction");

// Get users referred by the current user
const getMyReferrals = async (req, res) => {
  try {
    const referrals = await User.find({ referredBy: req.user.id })
      .select(
        "name email createdAt referralCode storeName accountLevel accountStatus isVerified",
      )
      .sort({ createdAt: -1 });

    // Add KYC status and deposition status to each referral
    const referralsWithKyc = await Promise.all(
      referrals.map(async (referral) => {
        const kyc = await KYC.findOne({ user: referral._id });
        const isKycApproved = kyc && kyc.status === "approved";

        // Check for any successful deposit
        const hasDeposited = await Deposit.exists({
          user: referral._id,
          status: "credited",
        });

        // Also check WalletTransaction for manual deposits
        const hasManualDeposit = await WalletTransaction.exists({
          user: referral._id,
          type: "deposit",
          status: "approved",
        });

        const isActive = !!(hasDeposited || hasManualDeposit);

        return { ...referral.toObject(), isKycApproved, isActive };
      }),
    );

    res.json({ referrals: referralsWithKyc });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

module.exports = { getMyReferrals };
