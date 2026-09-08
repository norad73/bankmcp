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
});
