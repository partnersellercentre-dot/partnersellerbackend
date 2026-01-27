const axios = require("axios");
const crypto = require("crypto");
const Deposit = require("../models/depositModel");
const User = require("../models/User");
const SystemSettings = require("../models/SystemSettings");
const { processDepositBonus } = require("../utils/bonusUtils");

const SAFEPAY_API_KEY = process.env.SAFEPAY_API_KEY;
const SAFEPAY_SECRET_KEY = process.env.SAFEPAY_SECRET_KEY;
const SAFEPAY_ENVIRONMENT = process.env.SAFEPAY_ENVIRONMENT || "sandbox";

const BASE_API_URL =
  SAFEPAY_ENVIRONMENT === "sandbox"
    ? "https://sandbox.api.getsafepay.com"
    : "https://api.getsafepay.com";

const CHECKOUT_URL =
  SAFEPAY_ENVIRONMENT === "sandbox"
    ? "https://sandbox.getsafepay.com/checkout/pay"
    : "https://getsafepay.com/checkout/pay";

exports.createTracker = async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user.id;

    if (!amount || Number(amount) <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid amount" });
    }

    if (!SAFEPAY_API_KEY) {
      console.error("SAFEPAY_API_KEY is missing in environment variables");
      return res.status(500).json({
        success: false,
        message: "SafePay configuration missing on server",
      });
    }

    // Get PKR rate from settings
    const settings = await SystemSettings.findOne();
    const rate = settings && settings.pkrRate ? settings.pkrRate : 280;
    const pkrAmount = Math.round(Number(amount) * rate);

    console.log(
      `Initializing SafePay tracker for $${amount} (${pkrAmount} PKR) in ${SAFEPAY_ENVIRONMENT} mode`,
    );

    const response = await axios.post(`${BASE_API_URL}/order/v1/init`, {
      client: SAFEPAY_API_KEY,
      amount: pkrAmount,
      currency: "PKR",
      environment: SAFEPAY_ENVIRONMENT,
    });

    // SafePay returns status.message: "success" and data.token on success
    if (
      !response.data ||
      response.data.status?.message !== "success" ||
      !response.data.data?.token
    ) {
      console.error("SafePay API Error:", response.data);
      return res.status(400).json({
        success: false,
        message: "Failed to initialize SafePay session",
        safePayResponse: response.data,
      });
    }

    const token = response.data.data.token;
    const redirectUrl = `${CHECKOUT_URL}?tracker=${token}&source=custom`;

    // Save deposit record
    const orderId = `SP_${Date.now()}`;
    const deposit = new Deposit({
      user: userId,
      orderId: orderId,
      expectedAmount: Number(amount), // Keep in USD (internal app currency)
      system: "SafePay",
      currency: "PKR",
      walletAddress: "SafePay Checkout", // Placeholder
      status: "pending",
      tag: token, // Reusing tag field to store tracker token for webhook lookup
    });
    await deposit.save();

    res.json({ success: true, redirectUrl, tracker: token });
  } catch (error) {
    console.error("SafePay Init Error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      errorResponse: error.response?.data,
      details: error.message,
    });
  }
};

exports.handleWebhook = async (req, res) => {
  try {
    const signature =
      req.headers["x-safepay-signature"] || req.headers["x-sfpy-signature"];
    const body = req.body;

    if (!signature) {
      console.warn("SafePay Webhook: Missing signature");
      return res.status(401).send("Missing signature");
    }

    const expectedSignature = crypto
      .createHmac("sha256", SAFEPAY_SECRET_KEY)
      .update(JSON.stringify(body))
      .digest("hex");

    if (signature !== expectedSignature) {
      console.error("SafePay Webhook signature mismatch");
      return res.status(401).send("Invalid signature");
    }

    const { tracker, state } = body;

    if (state === "TRACKER_COMPLETED") {
      const deposit = await Deposit.findOne({ tag: tracker }).populate("user");
      if (deposit && deposit.status === "pending") {
        deposit.status = "credited";
        await deposit.save();

        const amountToAdd = deposit.expectedAmount;
        deposit.user.balance += amountToAdd;
        await deposit.user.save();

        await processDepositBonus(deposit.user._id, amountToAdd);
        console.log(
          `User ${deposit.user._id} balance updated with $${amountToAdd} via SafePay`,
        );
      }
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("SafePay Webhook Error:", error.message);
    res.status(500).send("Internal Server Error");
  }
};
