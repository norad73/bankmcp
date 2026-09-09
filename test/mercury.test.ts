import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("mercury config", () => {
  it("isMercuryConfigured is false without credentials", async () => {
    const prev = process.env.MERCURY_API_TOKEN;
    delete process.env.MERCURY_API_TOKEN;
    const { isMercuryConfigured } = await import("../src/mercury.ts");
    assert.equal(isMercuryConfigured(), false);
    if (prev) process.env.MERCURY_API_TOKEN = prev;
  });
});
