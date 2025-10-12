const Deposit = require("../models/depositModel");
const User = require("../models/User");
const { verifyIpnRequest } = require("../utils/ipnVerifier");
const loadPaykassa = require("../utils/paykassaClient");

async function initDeposit(req, res) {
  try {
    const { amount, userId, network } = req.body;
    const orderId = Date.now().toString();

    const { MerchantApi, GenerateAddressRequest, System, Currency } =
      await loadPaykassa();

    const paykassa = new MerchantApi(
      process.env.PAYKASSA_MERCHANT_ID,
      process.env.PAYKASSA_MERCHANT_PASSWORD
    ).setTest(process.env.NODE_ENV === "development");

    // 🧩 Map network to Paykassa System constant
    let system;
    if (network === "trc20") {
      system = System.TRON_TRC20;
    } else if (network === "bep20") {
      system = System.BINANCESMARTCHAIN_BEP20;
    } else {
      console.error("System is undefined! network value:", network);
      return res.status(400).json({ error: "Invalid network" });
    }

    // ✅ Set success and fail URLs dynamically (frontend domain)
    const successUrl = "https://www.partnersellercentre.shop/success";
    const failUrl = "https://www.partnersellercentre.shop/fail";

    // 🪙 Create a deposit address
    const request = new GenerateAddressRequest()
      .setOrderId(orderId)
      .setSystem(system)
      .setCurrency(Currency.USDT)
      .setComment(`Deposit for user ${userId}`)
      .setSuccessUrl(successUrl)
      .setFailUrl(failUrl);

    const result = await paykassa.generateAddress(request);

    if (result.isError && result.isError()) {
      return res.status(400).json({ error: result.getMessage() });
    }

    // 🧾 Save deposit info in DB
    const deposit = new Deposit({
      user: userId,
      orderId,
      expectedAmount: amount,
      system,
      currency: "USDT",
      walletAddress: result.getWallet(),
      tag: result.getTag(),
      status: "pending",
    });
    await deposit.save();

    res.json({
      success: true,
      orderId,
      wallet: result.getWallet(),
      system: result.getSystem(),
      currency: result.getCurrency(),
      tag: result.getTag(),
      invoiceId: result.getInvoiceId(),
      url: result.getUrl(),
    });
  } catch (error) {
    console.error("Deposit init error:", error);
    res.status(500).json({ error: "Failed to initialize deposit" });
  }
}

// IPN webhook / callback
async function handleIpn(req, res) {
  try {
    const isLocal =
      process.env.NODE_ENV === "development" || req.hostname === "localhost";
    const { MerchantApi, CheckTransactionRequest } = await loadPaykassa();
    const merchantApi = new MerchantApi(
      process.env.PAYKASSA_MERCHANT_ID,
      process.env.PAYKASSA_MERCHANT_PASSWORD
    ).setTest(process.env.NODE_ENV === "development");

    if (!verifyIpnRequest(req)) {
      console.warn("IPN verification failed", req.ip, req.body);
      return res.status(403).send("Forbidden");
    }

    const privateHash = req.body.private_hash;
    if (!privateHash) {
      return res.status(400).send("Missing private_hash");
    }

    let orderId, txid, amountReceived, status, system, currency;

    if (isLocal) {
      // ✅ MOCK MODE for localhost testing
      console.log("Running in MOCK mode for local testing");
      orderId = req.body.order_id;
      txid = req.body.txid || "mock_txid_123";
      amountReceived = parseFloat(req.body.amount || "10");
      status = req.body.status || "yes";
      system = "TRON_TRC20";
      currency = "USDT";
    } else {
      // ✅ REAL MODE for production (Paykassa validation)
      const checkReq = new CheckTransactionRequest().setPrivateHash(
        privateHash
      );
      const checkRes = await merchantApi.checkTransaction(checkReq);

      if (checkRes.getError()) {
        console.error(
          "Paykassa checkTransaction error:",
          checkRes.getMessage()
        );
        return res.status(400).send("Error");
      }

      orderId = checkRes.getOrderId();
      txid = checkRes.getTxid();
      amountReceived = parseFloat(checkRes.getAmount());
      status = checkRes.getStatus();
      system = checkRes.getSystem();
      currency = checkRes.getCurrency();
    }

    // ---- Update your database ----
    const deposit = await Deposit.findOne({ orderId });
    if (!deposit) {
      console.warn("Deposit orderId not found:", orderId);
      return res.status(404).send("Order not found");
    }

    if (status === "yes" && deposit.status !== "credited") {
      deposit.status = "credited";
      deposit.txid = txid;
      deposit.receivedAmount = amountReceived;
      await deposit.save();

      const user = await User.findById(deposit.user);
      if (user) {
        user.balance = (user.balance || 0) + amountReceived;
        await user.save();
      }
    }

    return res.send(`${orderId}|success`);
  } catch (err) {
    console.error("handleIpn error:", err);
    return res.status(500).send("Error");
  }
}

// (Optional) endpoint to query deposit status
async function getDepositStatus(req, res) {
  try {
    const { orderId } = req.query;
    if (!orderId) return res.status(400).json({ error: "Missing orderId" });

    const deposit = await Deposit.findOne({ orderId });
    if (!deposit) return res.status(404).json({ error: "Not found" });
    return res.json({
      orderId: deposit.orderId,
      status: deposit.status,
      txid: deposit.txid,
      receivedAmount: deposit.receivedAmount,
    });
  } catch (err) {
    console.error("getDepositStatus error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

async function handleTransactionNotification(req, res) {
  try {
    const { MerchantApi, CheckTransactionRequest } = await loadPaykassa();
    const merchantApi = new MerchantApi(
      process.env.PAYKASSA_MERCHANT_ID,
      process.env.PAYKASSA_MERCHANT_PASSWORD
    ).setTest(process.env.NODE_ENV === "development");

    const privateHash = req.body.private_hash;

    const checkReq = new CheckTransactionRequest().setPrivateHash(privateHash);
    const checkRes = await merchantApi.checkTransaction(checkReq);

    if (checkRes.getError()) {
      console.error("Transaction notify error:", checkRes.getMessage());
      return res.status(400).send("Error");
    }

    const orderId = checkRes.getOrderId();
    const txid = checkRes.getTxid();
    const amount = parseFloat(checkRes.getAmount());
    const confirmations = checkRes.getConfirmations();
    const required = checkRes.getRequiredConfirmations();
    const status = checkRes.getStatus();
    const system = checkRes.getSystem();
    const currency = checkRes.getCurrency();
    const address_from = checkRes.getAddressFrom();
    const address = checkRes.getAddress();
    const tag = checkRes.getTag();

    // Find the deposit record by orderId
    const deposit = await Deposit.findOne({ orderId });
    if (!deposit) {
      console.warn(
        "Transaction notify: deposit not found for orderId",
        orderId
      );
      // respond anyway so Paykassa knows you got it
      return res.send(`${orderId}|success`);
    }

    // Update deposit record: e.g. update confirmations, maybe credit if now meets required
    deposit.txid = txid;
    deposit.receivedAmount = amount;
    deposit.confirmations = confirmations;
    deposit.requiredConfirmations = required;
    deposit.system = system;
    deposit.currency = currency;
    deposit.addressFrom = address_from;
    deposit.address = address;
    deposit.tag = tag;
    // If status is “yes” and deposit not yet credited, credit now
    if (status === "yes" && deposit.status !== "credited") {
      deposit.status = "credited";
      // Also credit user wallet
      const user = await User.findById(deposit.user);
      if (user) {
        user.balance = (user.balance || 0) + amount;
        await user.save();
      }
    }

    await deposit.save();

    // respond so Paykassa knows you have processed it
    return res.send(`${orderId}|success`);
  } catch (err) {
    console.error("handleTransactionNotification error:", err);
    return res.status(500).send("Error");
  }
}

// MOCK endpoint: Simulate a payment for testing UI
async function mockDepositPayment(req, res) {
  try {
    const { orderId, amount, txid } = req.body;
    if (!orderId || !amount) {
      return res.status(400).json({ error: "orderId and amount required" });
    }

    const deposit = await Deposit.findOne({ orderId });
    if (!deposit) {
      return res.status(404).json({ error: "Deposit not found" });
    }

    if (deposit.status === "credited") {
      return res.status(400).json({ error: "Already credited" });
    }

    deposit.status = "credited";
    deposit.txid = txid || "mock_txid_" + Date.now();
    deposit.receivedAmount = amount;
    await deposit.save();

    const user = await User.findById(deposit.user);
    if (user) {
      user.balance = (user.balance || 0) + Number(amount);
      await user.save();
    }

    return res.json({ success: true, credited: amount, orderId });
  } catch (err) {
    console.error("mockDepositPayment error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

module.exports = {
  mockDepositPayment,
  initDeposit,
  handleIpn,
  getDepositStatus,
  handleTransactionNotification,
};
