import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveLogo } from "../src/logos.ts";

test("Eurobank IKE uses custom logo, not Enable Banking favicon", () => {
  const logo = resolveLogo("Eurobank IKE", "enablebanking", new Map([["eurobank", "https://api.enablebanking.com/logo"]]));
  assert.equal(logo, "/assets/logos/eurobank.png");
});

test("Eurobank USA Branch uses custom logo", () => {
  const logo = resolveLogo("Eurobank USA Branch", "enablebanking", new Map());
  assert.equal(logo, "/assets/logos/eurobank.png");
});
