const User = require("../models/User");
const SystemSettings = require("../models/SystemSettings");
const WalletTransaction = require("../models/WalletTransaction");
const Notification = require("../models/Notification");

/**
 * Process referral bonuses for a given user and amount.
 * @param {string} userId - The ID of the user who triggered the event (User B).
 * @param {number} amount - The base amount (Deposit amount or Order profit/amount).
 * @param {string} type - 'deposit' or 'order'.
 */
const processReferralBonus = async (userId, amount, type) => {
  try {
    const settings = await SystemSettings.findOne();
    if (!settings) return;

    let levelSettings = [];
    if (type === "deposit") {
      levelSettings = settings.referralDepositSettings || [];
    } else if (type === "order") {
      levelSettings = settings.referralOrderSettings || [];
    }

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

      if (currentLevelSetting && currentLevelSetting.ranges) {
        // Find matching range
        const range = currentLevelSetting.ranges.find(
          (r) => amount >= r.min && amount <= r.max,
        );

        if (range) {
          let bonusAmount = range.bonus;
          if (range.isPercentage) {
            bonusAmount = (amount * range.bonus) / 100;
          }

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
      }

      // Move up
      currentUser = referrer;
      currentLevel++;
    }
  } catch (error) {
    console.error(`Error processing ${type} referral bonus:`, error);
  }
};

module.exports = { processReferralBonus };
