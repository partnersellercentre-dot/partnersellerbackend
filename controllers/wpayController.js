const axios = require("axios");
const crypto = require("crypto");
const Deposit = require("../models/depositModel");
const User = require("../models/User");
const SystemSettings = require("../models/SystemSettings");
const { processDepositBonus } = require("../utils/bonusUtils");

const WPAY_MCH_ID = process.env.WPAY_MCH_ID;
const WPAY_KEY = process.env.WPAY_KEY;
const WPAY_ENVIRONMENT = process.env.WPAY_ENVIRONMENT || "sandbox";
const WPAY_HOST =
  WPAY_ENVIRONMENT === "sandbox"
    ? "https://sandbox.okexpay.dev"
    : "https://api.wpay.life";

// Allowed callback IPs
const ALLOWED_IPS =
  WPAY_ENVIRONMENT === "sandbox"
    ? ["103.156.25.75"]
    : ["43.224.224.185", "43.224.224.239"];

// Generate MD5 Sign
const generateSign = (params, key) => {
  const sortedKeys = Object.keys(params).sort();
  const signString = sortedKeys
    .filter(
      (k) => params[k] !== "" && params[k] !== null && params[k] !== undefined,
    )
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const stringSignTemp = `${signString}&key=${key}`;
  return crypto
    .createHash("md5")
    .update(stringSignTemp)
    .digest("hex")
    .toLowerCase();
};

exports.createTracker = async (req, res) => {
  try {
    const { amount, method } = req.body; // method could be 'jazzcash' or 'easypaisa'
    const userId = req.user.id;

    if (!amount || Number(amount) <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid amount" });
    }

    if (!WPAY_MCH_ID || !WPAY_KEY) {
      console.error("WPAY configuration is missing");
      return res.status(500).json({
        success: false,
        message: "Payment gateway configuration missing on server",
      });
    }

    // Get PKR rate from settings
    const settings = await SystemSettings.findOne();
    const rate = settings && settings.pkrRate ? settings.pkrRate : 280;
    const pkrAmount = Math.round(Number(amount) * rate);

    const mchOrderNo = `WP${Date.now()}`; // Removed underscore just in case

    // Channel codes: JZ for JazzCash, EP for EasyPaisa
    const pay_type = method === "easypaisa" ? "EP" : "JZ";

    const params = {
      mchId: WPAY_MCH_ID.toString(),
      out_trade_no: mchOrderNo,
      money: Math.round(pkrAmount).toString(),
      currency: "PKR",
      pay_type: pay_type,
      notify_url: `${process.env.BACKEND_URL}/api/safepay/webhook`,
      returnUrl: `${process.env.FRONTEND_URL}/wallet`,
      attach: userId.toString(),
    };

    params.sign = generateSign(params, WPAY_KEY);

    console.log(
      `Initializing WPAY PayIn for $${amount} (${pkrAmount} PKR) for ${method}. URL: ${WPAY_HOST}/v1/Collect`,
    );

    // OKExPay requires application/x-www-form-urlencoded
    const response = await axios.post(
      `${WPAY_HOST}/v1/Collect`,
      new URLSearchParams(params).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    if (response.data && response.data.code === 0) {
      const payUrl = response.data.data.url;

      // Save deposit record
      const deposit = new Deposit({
        user: userId,
        orderId: mchOrderNo,
        expectedAmount: Number(amount),
        system: "WPAY",
        currency: "PKR",
        walletAddress: method,
        status: "pending",
        tag: mchOrderNo, // Using orderNo as tag for lookup
      });
      await deposit.save();

      return res.json({
        success: true,
        redirectUrl: payUrl,
        orderId: mchOrderNo,
      });
    } else {
      console.error("WPAY API Error:", response.data);
      return res.status(400).json({
        success: false,
        message: response.data.msg || "Failed to initialize payment session",
        wpayResponse: response.data,
      });
    }
  } catch (error) {
    console.error("WPAY Init Error:", error.response?.data || error.message);
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
    const body = req.body;
    const clientIp =
      req.headers["x-forwarded-for"] || req.connection.remoteAddress;

    console.log(`WPAY Webhook received from ${clientIp}:`, body);

    // IP Validation (Optional but recommended)
    const isAllowedIp = ALLOWED_IPS.some((ip) => clientIp.includes(ip));
    if (!isAllowedIp && WPAY_ENVIRONMENT !== "sandbox") {
      console.warn(`WPAY Webhook: Unauthorized IP ${clientIp}`);
      // return res.status(403).send("Unauthorized IP");
    }

    const { sign, ...params } = body;
    const expectedSign = generateSign(params, WPAY_KEY);

    if (sign !== expectedSign) {
      console.error("WPAY Webhook signature mismatch");
      return res.status(401).send("fail");
    }

    const { out_trade_no, status } = body;

    // status: 1 = success
    if (status === "1" || status === 1) {
      const deposit = await Deposit.findOne({ orderId: out_trade_no }).populate(
        "user",
      );
      if (deposit && deposit.status === "pending") {
        deposit.status = "credited";
        await deposit.save();

        const amountToAdd = deposit.expectedAmount;
        deposit.user.balance =
          Math.round((deposit.user.balance + amountToAdd) * 100) / 100;
        await deposit.user.save();

        await processDepositBonus(deposit.user._id, amountToAdd);
        console.log(
          `User ${deposit.user._id} balance updated with $${amountToAdd} via WPAY`,
        );
      }
    }

    // Acknowledge with "success" string as per documentation
    res.status(200).send("success");
  } catch (error) {
    console.error("WPAY Webhook Error:", error.message);
    res.status(500).send("error");
  }
};
