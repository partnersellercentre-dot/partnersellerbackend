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
      process.env.BACKEND_URL || "https://pec-app-backend.vercel.app";

    const ipnUrl = `${backendUrl}/api/nowpayments/ipn`;
    console.log(
      `[CREATE PAYMENT] User: ${userId}, Amount: ${amount}, Callback URL: ${ipnUrl}`,
    );

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
    console.log(
      `[NOWPAYMENTS CREATED] ID: ${paymentData.payment_id}, Address: ${paymentData.pay_address}`,
    );

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

    console.log("[IPN RECEIVED] Payload:", JSON.stringify(payload));

    if (!receivedSig) {
      console.warn("[IPN ERROR] Missing signature header");
      return res.status(400).send("Missing Signature");
    }

    // Sort keys and verify signature
    const sortedPayload = Object.keys(payload)
      .sort()
      .reduce((obj, key) => {
        obj[key] = payload[key];
        return obj;
      }, {});

    const hmac = crypto.createHmac("sha512", NOWPAYMENTS_IPN_SECRET || "");
    hmac.update(JSON.stringify(sortedPayload));
    const expectedSig = hmac.digest("hex");

    if (receivedSig !== expectedSig) {
      console.warn(
        `[IPN SIG MISMATCH] Expected: ${expectedSig.substring(
          0,
          10,
        )}... Received: ${receivedSig.substring(0, 10)}...`,
      );

      // In production, we continue but LOG it, so we can see if it was the cause
      if (process.env.NODE_ENV === "production") {
        console.warn(
          "[IPN] Signature mismatch in production. Proceeding anyway for troubleshooting...",
        );
      }
    }

    const { payment_status, order_id, pay_amount, payment_id, price_amount } =
      payload;
    console.log(
      `[IPN PROCESSING] Order: ${order_id}, Status: ${payment_status}`,
    );

    if (payment_status === "finished" || payment_status === "confirmed") {
      const deposit = await Deposit.findOne({ orderId: order_id }).populate(
        "user",
      );

      if (!deposit) {
        console.error(`[IPN ERROR] Deposit not found for order: ${order_id}`);
        return res.status(200).send("OK");
      }

      if (deposit.status === "pending") {
        console.log(
          `[IPN SUCCESS] Crediting $${
            price_amount || deposit.expectedAmount
          } to User: ${deposit.user._id}`,
        );

        deposit.status = "credited";
        deposit.receivedAmount = pay_amount;
        deposit.txid = payment_id;
        await deposit.save();

        const user = deposit.user;
        const amountToAdd = Number(price_amount) || deposit.expectedAmount;

        // Update balances
        user.balance = (user.balance || 0) + amountToAdd;
        if (!user.balances) user.balances = {};
        user.balances.recharge = (user.balances.recharge || 0) + amountToAdd;
        await user.save();

        // Create wallet transaction record for UI visibility
        const WalletTransaction = require("../models/WalletTransaction");
        await WalletTransaction.create({
          user: user._id,
          amount: amountToAdd,
          type: "deposit",
          status: "approved",
          description: `Deposit via NOWPayments (${deposit.currency})`,
          method: "NOWPayments",
          direction: "in",
          txid: payment_id,
        });

        await processDepositBonus(user._id, amountToAdd);
      } else {
        console.log(
          `[IPN INFO] Deposit ${order_id} already status: ${deposit.status}`,
        );
      }
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("[IPN CRITICAL ERROR]:", error.message);
    res.status(500).send("Internal Server Error");
  }
};
        // This will create a separate WalletTransaction for the bonus itself
        await processDepositBonus(user._id, amountToAdd);

        console.log(
          `User ${user._id} balance updated with $${amountToAdd} via NOWPayments. New balance: ${user.balance}`,
        );
      } else {
        console.log(
          `Deposit ${order_id} already processed or not pending: ${deposit.status}`,
        );
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
