import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("wise config", () => {
  it("isWiseConfigured is false without credentials", async () => {
    const prev = process.env.WISE_API_TOKEN;
    delete process.env.WISE_API_TOKEN;
    const { isWiseConfigured } = await import("../src/wise.ts");
    assert.equal(isWiseConfigured(), false);
    if (prev) process.env.WISE_API_TOKEN = prev;
  });
});
