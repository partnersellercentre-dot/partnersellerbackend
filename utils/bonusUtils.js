const User = require("../models/User");
const SystemSettings = require("../models/SystemSettings");
const WalletTransaction = require("../models/WalletTransaction");
const Notification = require("../models/Notification");
const Deposit = require("../models/depositModel");

/**
 * Process bonuses for a deposit.
 * @param {string} userId - The ID of the user who deposited.
 * @param {number} amount - The deposit amount.
 */
const processDepositBonus = async (userId, amount) => {
  try {
    const settings = await SystemSettings.findOne();
    if (!settings) return;

    const user = await User.findById(userId);
    if (!user) return;

    // 1. Self Bonus (Range based)
    const selfRanges = settings.depositSelfRanges || [];
    const selfRange = selfRanges.find(
      (r) => amount >= r.min && amount <= r.max,
    );

    if (selfRange) {
      const selfBonus = selfRange.bonus; // Exact amount now
      if (selfBonus > 0) {
        user.balance = (user.balance || 0) + selfBonus;
        await user.save();

        await WalletTransaction.create({
          user: user._id,
          amount: selfBonus,
          type: "deposit_bonus_self",
          status: "approved",
          description: `Bonus ($${selfBonus}) for your deposit of $${amount}`,
          method: "System",
          direction: "in",
        });
      }
    }

    // 2. Referrer Bonus (First Deposit Only, Range based)
    if (user.referredBy) {
      // Check if this is the first credited deposit (checking both automated and manual)
      const depositCount = await Deposit.countDocuments({
        user: userId,
        status: "credited",
      });
      const manualDepositCount = await WalletTransaction.countDocuments({
        user: userId,
        type: "deposit",
        status: "approved",
      });

      if (depositCount + manualDepositCount === 1) {
        // Find matching range for this amount
        const referralRanges = settings.referralFirstDepositRanges || [];
        const referralRange = referralRanges.find(
          (r) => amount >= r.min && amount <= r.max,
        );

        if (referralRange) {
          const referrer = await User.findById(user.referredBy);
          if (referrer) {
            const refBonus = referralRange.bonus; // Exact amount (user requested "ranges")
            if (refBonus > 0) {
              referrer.balance = (referrer.balance || 0) + refBonus;
              await referrer.save();

              await WalletTransaction.create({
                user: referrer._id,
                amount: refBonus,
                type: "referral_bonus",
                status: "approved",
                description: `First deposit referral bonus ($${refBonus}) from ${user.name}'s deposit of $${amount}`,
                method: "System",
                direction: "in",
              });

              await Notification.create({
                user: referrer._id,
                title: "Referral Bonus Received",
                message: `You received a first-deposit referral bonus of $${refBonus}.`,
              });
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Error processing deposit bonus:", error);
  }
};

/**
 * Process referral bonuses for orders.
 * @param {string} userId - The ID of the user who triggered the event (User B).
 * @param {number} amount - The base amount (Order profit/amount).
 */
const processReferralBonus = async (userId, amount, type) => {
  // Only handling 'order' type here now as 'deposit' is handled separately
  if (type !== "order") return;

  try {
    const settings = await SystemSettings.findOne();
    if (!settings) return;

    let levelSettings = settings.referralOrderSettings || [];

    if (!levelSettings.length) return;

    // Sort settings by level just in case
    levelSettings.sort((a, b) => a.level - b.level);
    const maxLevel = levelSettings[levelSettings.length - 1].level;

    let currentUser = await User.findById(userId);
    if (!currentUser) return;

    // Traverse up the chain
    let currentLevel = 1;

    while (currentUser.referredBy && currentLevel <= maxLevel) {
      const referrer = await User.findById(currentUser.referredBy);
      if (!referrer) break;

      // Find settings for this level
      const currentLevelSetting = levelSettings.find(
        (s) => s.level === currentLevel,
      );

      if (currentLevelSetting && currentLevelSetting.percentage > 0) {
        const bonusAmount = (amount * currentLevelSetting.percentage) / 100;

        if (bonusAmount > 0) {
          // Apply bonus
          referrer.balance = (referrer.balance || 0) + bonusAmount;
          await referrer.save();

          // Record transaction
          await WalletTransaction.create({
            user: referrer._id,
            amount: bonusAmount,
            type: "referral_bonus",
            status: "approved",
            description: `Referral bonus (Level ${currentLevel}) from ${type} of ${amount} by user ${userId}`,
            method: "System",
            direction: "in",
          });

          // Notify
          await Notification.create({
            user: referrer._id,
            title: "Referral Bonus Received",
            message: `You received a ${type} referral bonus of $${bonusAmount} from a Level ${currentLevel} referral.`,
          });
          console.log(
            `Applied level ${currentLevel} ${type} bonus of ${bonusAmount} to ${referrer.email}`,
          );
        }
      }

      // Move up
      currentUser = referrer;
      currentLevel++;
    }
  } catch (error) {
    console.error(`Error processing ${type} referral bonus:`, error);
  }
};

module.exports = { processReferralBonus, processDepositBonus };
