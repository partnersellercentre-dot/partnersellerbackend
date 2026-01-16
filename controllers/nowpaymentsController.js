const axios = require("axios");
const crypto = require("crypto");
const Deposit = require("../models/depositModel");
const User = require("../models/User");

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;
const NOWPAYMENTS_SANDBOX = process.env.NOWPAYMENTS_SANDBOX === "true";
const BASE_URL = NOWPAYMENTS_SANDBOX
  ? "https://api-sandbox.nowpayments.io/v1"
  : "https://api.nowpayments.io/v1";

exports.createPayment = async (req, res) => {
  try {
    const { amount, currency, pay_currency } = req.body;
    const userId = req.user.id;
    const orderId = `NP_${Date.now()}`;

    // backend url for IPN
    const backendUrl =
      process.env.BACKEND_URL || "https://partnersellerbackend.vercel.app";

    const response = await axios.post(
      `${BASE_URL}/payment`,
      {
        price_amount: amount,
        price_currency: currency || "usd",
        pay_currency: pay_currency || "usdttrc20",
        ipn_callback_url: `${backendUrl}/api/nowpayments/ipn`,
        order_id: orderId,
        order_description: `Deposit for user ${userId}`,
      },
      {
        headers: {
          "x-api-key": NOWPAYMENTS_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    const paymentData = response.data;

    // Save to Deposit model
    const deposit = new Deposit({
      user: userId,
      orderId: orderId,
      expectedAmount: amount,
      system: "NOWPayments",
      currency: pay_currency || "usdttrc20",
      walletAddress: paymentData.pay_address,
      status: "pending",
    });
    await deposit.save();

    res.status(200).json({
      success: true,
      data: paymentData,
    });
  } catch (error) {
    console.error(
      "NOWPayments Create Error:",
      error.response?.data || error.message
    );
    res.status(500).json({
      success: false,
      message: error.response?.data?.message || "Failed to create payment",
    });
  }
};

exports.handleIPN = async (req, res) => {
  try {
    const receivedSig = req.headers["x-nowpayments-sig"];
    const payload = req.body;

    if (!receivedSig) {
      console.warn("NOWPayments IPN: Missing signature");
      return res.status(400).send("Missing Signature");
    }

    // Sort keys alphabetically
    const sortedPayload = Object.keys(payload)
      .sort()
      .reduce((obj, key) => {
        obj[key] = payload[key];
        return obj;
      }, {});

    const hmac = crypto.createHmac("sha512", NOWPAYMENTS_IPN_SECRET);
    hmac.update(JSON.stringify(sortedPayload));
    const expectedSig = hmac.digest("hex");

    if (receivedSig !== expectedSig) {
      console.error("NOWPayments IPN signature mismatch");
      // Note: In development/sandbox sometimes there might be issues,
      // but for production this check is crucial.
      return res.status(400).send("Invalid Signature");
    }

    const { payment_status, order_id, pay_amount, payment_id, price_amount } =
      payload;

    if (payment_status === "finished") {
      const deposit = await Deposit.findOne({ orderId: order_id }).populate(
        "user"
      );
      if (deposit && deposit.status === "pending") {
        deposit.status = "credited";
        deposit.receivedAmount = pay_amount;
        deposit.txid = payment_id;
        await deposit.save();

        // Update user balance
        // We use price_amount from payload (USD) or deposit.expectedAmount
        const amountToAdd = Number(price_amount) || deposit.expectedAmount;
        deposit.user.balance += amountToAdd;
        await deposit.user.save();

        console.log(
          `User ${deposit.user._id} balance updated with $${amountToAdd} via NOWPayments`
        );
      }
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("NOWPayments IPN Error:", error.message);
    res.status(500).send("Internal Server Error");
  }
};
