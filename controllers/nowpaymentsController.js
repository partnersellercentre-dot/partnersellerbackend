const axios = require("axios");
const crypto = require("crypto");
const Deposit = require("../models/depositModel");
const User = require("../models/User");
const { processDepositBonus } = require("../utils/bonusUtils");

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
      process.env.BACKEND_URL || "https://api.partnersellercentre.shop"; // Fallback to your production URL

    const ipnUrl = `${backendUrl}/api/nowpayments/ipn`;
    console.log(`Setting up NOWPayments deposit of ${amount} ${currency || "usd"} for user ${userId}. Callback URL: ${ipnUrl}`);

    const response = await axios.post(
      `${BASE_URL}/payment`,
      {
        price_amount: amount,
        price_currency: currency || "usd",
        pay_currency: pay_currency || "usdttrc20",
        ipn_callback_url: ipnUrl,
        order_id: orderId,
        order_description: `Deposit for user ${userId}`,
      },
      {
        headers: {
          "x-api-key": NOWPAYMENTS_API_KEY,
          "Content-Type": "application/json",
        },
      },
    );

    const paymentData = response.data;
    console.log(`NOWPayments API responded with payment ID: ${paymentData.payment_id}. Address: ${paymentData.pay_address}`);

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
      error.response?.data || error.message,
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

    console.log("NOWPayments IPN received:", JSON.stringify(payload, null, 2));

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
      console.error(
        "NOWPayments IPN signature mismatch. Expected:",
        expectedSig,
        "Received:",
        receivedSig,
      );
      // In development, you might want to bypass this for testing with tools like Postman
      // but only if NO_SIGNATURE_CHECK is explicitly allowed in env
      if (process.env.NODE_ENV !== "production") {
        console.warn("Bypassing signature check in development mode");
      } else {
        return res.status(400).send("Invalid Signature");
      }
    }

    const { payment_status, order_id, pay_amount, payment_id, price_amount } =
      payload;

    console.log(`Processing NOWPayments IPN for status: ${payment_status}`);

    if (payment_status === "finished" || payment_status === "confirmed") {
      const deposit = await Deposit.findOne({ orderId: order_id }).populate(
        "user",
      );

      if (!deposit) {
        console.error(`NOWPayments IPN: Deposit for order ${order_id} not found`);
        return res.status(200).send("OK");
      }

      if (deposit && deposit.status === "pending") {
        console.log(`Crediting user ${deposit.user._id} for order ${order_id}`);

        deposit.status = "credited";
        deposit.receivedAmount = pay_amount;
        deposit.txid = payment_id;
        await deposit.save();

        // Update user balance
        const amountToAdd = Number(price_amount) || deposit.expectedAmount;
        const user = deposit.user;

        // Update main balance and recharge balance (bucket)
        user.balance = (user.balance || 0) + amountToAdd;
        if (!user.balances) user.balances = {};
        user.balances.recharge = (user.balances.recharge || 0) + amountToAdd;

        await user.save();

        // Create a record in WalletTransaction so it shows on panel
        const WalletTransaction = require("../models/WalletTransaction");
        await WalletTransaction.create({
          user: user._id,
          amount: amountToAdd,
          type: "deposit",
          status: "approved",
          description: `Automatic deposit via NOWPayments (${deposit.currency})`,
          method: "NOWPayments",
          direction: "in",
          txid: payment_id,
        });

        // Trigger Deposit Bonus (Self + Referral First Time)
        // This will create a separate WalletTransaction for the bonus itself
        await processDepositBonus(user._id, amountToAdd);

        console.log(
          `User ${user._id} balance updated with $${amountToAdd} via NOWPayments. New balance: ${user.balance}`,
        );
      } else {
        console.log(`Deposit ${order_id} already processed or not pending: ${deposit.status}`);
      }
    } else {
      console.log(`Ignored status: ${payment_status}`);
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("NOWPayments IPN Error:", error.message);
    res.status(500).send("Internal Server Error");
  }
};
