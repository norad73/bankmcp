import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("viva config", () => {
  it("isVivaConfigured is false without credentials", async () => {
    const prevUser = process.env.VIVA_MERCHANT_ID;
    const prevPass = process.env.VIVA_API_KEY;
    delete process.env.VIVA_MERCHANT_ID;
    delete process.env.VIVA_API_KEY;
    delete process.env.VIVA_BASIC_USER;
    delete process.env.VIVA_BASIC_PASSWORD;
    const { isVivaConfigured } = await import("../src/viva.ts");
    assert.equal(isVivaConfigured(), false);
    if (prevUser) process.env.VIVA_MERCHANT_ID = prevUser;
    if (prevPass) process.env.VIVA_API_KEY = prevPass;
  });

  it("isVivaAccountTransactionsConfigured is false without account credentials", async () => {
    const prevId = process.env.VIVA_ACCOUNT_CLIENT_ID;
    const prevSecret = process.env.VIVA_ACCOUNT_CLIENT_SECRET;
    delete process.env.VIVA_ACCOUNT_CLIENT_ID;
    delete process.env.VIVA_ACCOUNT_CLIENT_SECRET;
    delete process.env.VIVA_CLIENT_ID;
    delete process.env.VIVA_CLIENT_SECRET;
    const { isVivaAccountTransactionsConfigured } = await import("../src/viva.ts");
    assert.equal(isVivaAccountTransactionsConfigured(), false);
    if (prevId) process.env.VIVA_ACCOUNT_CLIENT_ID = prevId;
    if (prevSecret) process.env.VIVA_ACCOUNT_CLIENT_SECRET = prevSecret;
  });
});
