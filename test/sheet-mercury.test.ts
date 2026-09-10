import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMercurySourceAccount, formatMercuryStatus } from "../src/mercury.ts";
import { mercuryRowValues, type MercurySheetTransaction } from "../src/sheet-mercury.ts";

const sample: MercurySheetTransaction = {
  id: "tx-1",
  dateUtc: "2026-09-10T12:00:00Z",
  description: "STRIPE",
  amount: -1185.86,
  status: "Sent",
  sourceAccount: "Mercury Checking ••6792",
  bankDescription: "TRANSFER",
  reference: "",
  note: "",
  nameOnCard: "Alexandros Karavitis",
  category: "Software",
  glCode: "6100",
};

test("mercuryRowValues maps all yellow columns", () => {
  const row = mercuryRowValues(sample);
  assert.equal(row.description, "STRIPE");
  assert.equal(row.amount, -1185.86);
  assert.equal(row.nameOnCard, "Alexandros Karavitis");
});

test("formatMercuryStatus capitalizes status", () => {
  assert.equal(formatMercuryStatus("sent"), "Sent");
  assert.equal(formatMercuryStatus("pending"), "Pending");
});

test("formatMercurySourceAccount matches sheet pattern", () => {
  const label = formatMercurySourceAccount({
    id: "a1",
    name: "Checking",
    accountNumber: "1234566792",
    availableBalance: 0,
    currentBalance: 0,
    status: "active",
    type: "mercury",
  });
  assert.equal(label, "Mercury Checking ••6792");
});
