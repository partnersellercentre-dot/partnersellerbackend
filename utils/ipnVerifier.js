// utils/ipnVerifier.js

/**
 * Very basic IPN request verification for Paykassa
 * You can expand this later with signature verification
 * or whitelist Paykassa IPs if needed.
 */
function verifyIpnRequest(req) {
  try {
    // Simple sanity check (you can enhance this)
    if (!req.body || Object.keys(req.body).length === 0) {
      console.warn("Empty IPN body");
      return false;
    }

    // Optional: verify signature or merchant_id if provided
    if (!req.body.merchant_id) {
      console.warn("Missing merchant_id in IPN");
      return false;
    }

    // ✅ You can also validate known merchant_id to ensure it’s your merchant
    const allowedMerchantId = process.env.PAYKASSA_MERCHANT_ID;
    if (allowedMerchantId && req.body.merchant_id != allowedMerchantId) {
      console.warn("Merchant ID mismatch:", req.body.merchant_id);
      return false;
    }

    return true; // IPN seems valid
  } catch (err) {
    console.error("verifyIpnRequest error:", err);
    return false;
  }
}

module.exports = { verifyIpnRequest };
