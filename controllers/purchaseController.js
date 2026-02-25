const User = require("../models/User");
const Product = require("../models/Product");
const Purchase = require("../models/Purchase");
const Notification = require("../models/Notification");
const WalletTransaction = require("../models/WalletTransaction");
const { processReferralBonus } = require("../utils/bonusUtils");

exports.buyProduct = async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.user.id;

    // 1. Find product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // 2. Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 3. Check balance (Recharge only)
    if ((user.balances?.recharge || 0) < product.price) {
      return res.status(400).json({ message: "Insufficient recharge balance" });
    }

    // 4. Deduct from Recharge Balance only
    const deductions = {
      balance: product.price,
      profit: 0,
      teamCommission: 0,
      referralBonus: 0,
      selfBonus: 0,
      signupBonus: 0,
    };

    user.balances.recharge -= product.price;
    user.balance -= product.price;

    await user.save();

    // 5. Record purchase
    const purchase = await Purchase.create({
      user: userId,
      product: productId,
      amount: product.price,
    });

    await Notification.create({
      title: "New Purchase",
      message: `${req.user.name} purchased ${product.name}.`,
      user: req.user._id,
    });

    // 6. Create escrow transaction for buyer only
    const buyerEscrowTxn = await WalletTransaction.create({
      user: userId,
      amount: product.price,
      type: "escrow",
      status: "pending",
      purchase: purchase._id,
      method: "Escrow",
      direction: "out",
      deductions,
    });

    res.status(201).json({
      success: true,
      message: "Product purchased successfully",
      purchase,
      balance: user.balance,
      buyerEscrowTransactionId: buyerEscrowTxn._id,
    });
  } catch (error) {
    console.error("Buy product error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.getMyPurchases = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const p = parseInt(page);
    const l = parseInt(limit);
    const skip = (p - 1) * l;

    const totalPurchases = await Purchase.countDocuments({ user: req.user.id });
    const purchases = await Purchase.find({ user: req.user.id })
      .populate("product")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(l);

    const purchasesWithEscrow = await Promise.all(
      purchases.map(async (purchase) => {
        const buyerEscrowTxn = await WalletTransaction.findOne({
          purchase: purchase._id,
          type: "escrow",
          user: req.user.id,
          direction: "out",
        });
        return {
          ...purchase.toObject(),
          buyerEscrowTransactionId: buyerEscrowTxn ? buyerEscrowTxn._id : null,
          escrowStatus: buyerEscrowTxn ? buyerEscrowTxn.status : null,
        };
      }),
    );

    res.json({
      success: true,
      purchases: purchasesWithEscrow,
      totalPages: Math.ceil(totalPurchases / l),
      currentPage: p,
      totalPurchases,
    });
  } catch (error) {
    console.error("getMyPurchases error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Admin: get all purchases
exports.getAllPurchases = async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};

    if (search) {
      // Find matching users
      const users = await User.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }).select("_id");
      const userIds = users.map((u) => u._id);

      // Find matching products
      const products = await Product.find({
        name: { $regex: search, $options: "i" },
      }).select("_id");
      const productIds = products.map((p) => p._id);

      query = {
        $or: [
          { user: { $in: userIds } },
          { product: { $in: productIds } },
          { _id: search.match(/^[0-9a-fA-F]{24}$/) ? search : null }, // Support search by full ID
        ].filter((q) => q._id !== null), // Remove null entry if ID doesn't match
      };
    }

    const purchases = await Purchase.find(query)
      .populate("user")
      .populate("product")
      .sort({ createdAt: -1 });
    res.json({ success: true, purchases });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.claimProfit = async (req, res) => {
  try {
    const { purchaseId } = req.body;
    const userId = req.user.id;

    // Find purchase
    const purchase = await Purchase.findById(purchaseId).populate("product");
    if (!purchase) {
      return res.status(404).json({ message: "Purchase not found" });
    }
    if (purchase.user.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }
    if (purchase.status !== "to_be_paid") {
      return res.status(400).json({ message: "Profit already claimed" });
    }
    // Check if 24 hours seconds have passed (for testing)
    const purchaseTime = new Date(purchase.createdAt);
    const now = new Date();
    const secondsSincePurchase = (now - purchaseTime) / 1000; // convert ms to seconds

    if (secondsSincePurchase < 86400) {
      return res.status(400).json({
        message: `Profit can only be claimed after 24 hours. Please wait ${Math.ceil(
          (86400 - secondsSincePurchase) / 3600,
        )} more hour(s).`,
      });
    }

    // Calculate profit (e.g., 2.2%)
    const profitPercent = 2.2;
    const profitAmount =
      Math.round(((purchase.product.price * profitPercent) / 100) * 100) / 100;

    // Add profit to user's wallet
    const user = await User.findById(userId);
    user.balance = Math.round((user.balance + profitAmount) * 100) / 100;
    user.balances.profit =
      Math.round(((user.balances.profit || 0) + profitAmount) * 100) / 100;
    await user.save();

    // Create a transaction record for the profit
    await WalletTransaction.create({
      user: userId,
      amount: profitAmount,
      type: "profit",
      status: "approved",
      direction: "in",
      purchase: purchase._id,
      method: "Profit",
    });

    // Trigger Referral Bonus (Order Type)
    // We pass profitAmount as the base for calculation
    await processReferralBonus(userId, profitAmount, "order");

    // Update purchase status
    purchase.status = "paid";
    purchase.paymentClaimedAt = new Date();
    await purchase.save();

    res.json({
      success: true,
      message: "Profit claimed",
      profitAmount,
      balance: user.balance,
      purchase,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.deletePurchase = async (req, res) => {
  try {
    const { id } = req.params;
    const purchase = await Purchase.findById(id);
    if (!purchase) {
      return res.status(404).json({ message: "Purchase not found" });
    }
    await Purchase.findByIdAndDelete(id);
    res.json({ success: true, message: "Purchase deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
