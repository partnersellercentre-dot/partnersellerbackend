require("dotenv").config();

let cached = null;

async function loadPaykassa() {
  if (!cached) {
    const { MerchantApi } = await import("paykassa-api-sdk/lib/merchant.js");
    const dto = await import("paykassa-api-sdk/lib/dto.js");
    const struct = await import("paykassa-api-sdk/lib/struct.js");

    cached = {
      MerchantApi,
      GenerateAddressRequest: dto.GenerateAddressRequest,
      CheckTransactionRequest: dto.CheckTransactionRequest,
      System: struct.System,
      Currency: struct.Currency,
    };
  }
  return cached;
}

module.exports = loadPaykassa;
