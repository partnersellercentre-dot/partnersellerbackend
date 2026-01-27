const User = require("../models/User");
const Purchase = require("../models/Purchase");
const WalletTransaction = require("../models/WalletTransaction");
const SystemSettings = require("../models/SystemSettings");

exports.getBasicStats = async (req, res) => {
  try {
    const userId = req.user?._id; // Use _id, since protect sets req.user as a User document

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get current user
    const user = await User.findById(userId).select(
      "-passwordHash -otp -otpExpires",
    );

    const settings = await SystemSettings.findOne();

    // User's total sales (sum of all their purchases' amount)
    const userTotalSalesAgg = await Purchase.aggregate([
      { $match: { user: user._id } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const userTotalSales = userTotalSalesAgg[0]?.total || 0;

    // Profit Ratio
    const profitPercent = 4.2;

    // Current month sales for user
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const userCurrentMonthSalesAgg = await Purchase.aggregate([
      { $match: { user: user._id, createdAt: { $gte: firstDayOfMonth } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const userCurrentMonthSales = userCurrentMonthSalesAgg[0]?.total || 0;

    const userLastMonthSalesAgg = await Purchase.aggregate([
      {
        $match: {
          user: user._id,
          createdAt: { $gte: lastMonth, $lt: firstDayOfMonth },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const userLastMonthSales = userLastMonthSalesAgg[0]?.total || 0;

    // User's available balance
    const availableBalance = user.balance || 0;

    // User's in transaction (pending deposits/withdrawals)
    const userInTransactionAgg = await WalletTransaction.aggregate([
      { $match: { user: user._id, status: "pending" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const inTransaction = userInTransactionAgg[0]?.total || 0;

    // Calculate Withdrawable Balance if restricted
    let withdrawableBalance = availableBalance;
    if (settings?.restrictWithdrawalToProfits) {
      // Sum of all profits and bonuses received
      const totalProfitsAndBonusesAgg = await WalletTransaction.aggregate([
        {
          $match: {
            user: user._id,
            status: "approved",
            type: {
              $in: ["profit", "deposit_bonus_self", "referral_bonus", "bonus"],
            },
            direction: "in",
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);
      const totalProfitsAndBonuses = totalProfitsAndBonusesAgg[0]?.total || 0;

      // Sum of all withdrawals (pending or approved)
      const totalWithdrawnAgg = await WalletTransaction.aggregate([
        {
          $match: {
            user: user._id,
            status: { $in: ["pending", "approved"] },
            type: "withdraw",
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);
      const totalWithdrawn = totalWithdrawnAgg[0]?.total || 0;

      withdrawableBalance = Math.max(
        0,
        totalProfitsAndBonuses - totalWithdrawn,
      );
      // It should not exceed current balance
      withdrawableBalance = Math.min(withdrawableBalance, availableBalance);
    }

    // User's total profit (sum of all claimed profits * profitPercent)
    const userTotalProfitAgg = await Purchase.aggregate([
      { $match: { user: user._id, status: "paid" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalProfit = Math.round(
      ((userTotalProfitAgg[0]?.total || 0) * profitPercent) / 100,
    );

    // User's profit for the month
    const userProfitThisMonthAgg = await Purchase.aggregate([
      {
        $match: {
          user: user._id,
          status: "paid",
          paymentClaimedAt: { $gte: firstDayOfMonth },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const profitThisMonth = Math.round(
      ((userProfitThisMonthAgg[0]?.total || 0) * profitPercent) / 100,
    );

    const userProfitLastMonthAgg = await Purchase.aggregate([
      {
        $match: {
          user: user._id,
          status: "paid",
          paymentClaimedAt: { $gte: lastMonth, $lt: firstDayOfMonth },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const profitLastMonth = Math.round(
      ((userProfitLastMonthAgg[0]?.total || 0) * profitPercent) / 100,
    );

    // User's total number of orders
    const totalOrders = await Purchase.countDocuments({ user: user._id });
    const ordersThisMonth = await Purchase.countDocuments({
      user: user._id,
      createdAt: { $gte: firstDayOfMonth },
    });
    const ordersLastMonth = await Purchase.countDocuments({
      user: user._id,
      createdAt: { $gte: lastMonth, $lt: firstDayOfMonth },
    });

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        referralCode: user.referralCode,
        accountLevel: user.accountLevel,
        role: user.role,
        balance: user.balance,
      },
      totalSales: userTotalSales,
      currentMonthSales: userCurrentMonthSales,
      lastMonthSales: userLastMonthSales,
      availableBalance,
      withdrawableBalance,
      restrictWithdrawalToProfits: !!settings?.restrictWithdrawalToProfits,
      inTransaction,
      complaints: 0,
      totalProfit,
      profitThisMonth,
      profitLastMonth,
      totalOrders,
      ordersThisMonth,
      ordersLastMonth,
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to fetch statistics", details: err.message });
  }
};
