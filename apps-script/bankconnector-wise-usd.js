var WISE_USD_SPEC = bankConnectorMakeFillHandlers_({
  sheetName: "Wise USD",
  endpoint: "/cron/sync-wise-usd-transactions",
  action: "fill-wise-usd",
  menuHandler: "fillWiseUsdTransactions",
  menuLabel: "Fill Wise USD transactions",
  label: "Wise USD",
  logPrefix: "fillWiseUsdTransactions",
  skipReason: "No new Wise USD transactions",
  knownIdField: "transferWiseId",
  sinceDateField: "wiseDatetime",
  uniqueIdFrom: function (tx) { return [tx.wiseDatetime, tx.description, tx.wiseAmount]; },
  yellowHeaders: {
    transferWiseId: "TransferWise ID",
    wiseDate: "Wise Date",
    wiseDatetime: "Wise Datetime",
    wiseAmount: "Wise Amount",
    currency: "Currency",
    description: "Description",
    paymentReference: "Payment Reference",
    runningBalance: "Running Balance",
    exchangeFrom: "Exchange From",
    exchangeTo: "Exchange To",
    exchangeRate: "Exchange Rate",
    payerName: "Payer Name",
    payeeName: "Payee Name",
    payeeAccountNumber: "Payee Account Number",
    merchant: "Merchant",
    totalFees: "Total fees",
    exchangeToAmount: "Exchange To Amount",
    transactionType: "Transaction Type",
    transactionDetailsType: "Transaction Details Type",
  },
  writeRows: function (sheet, startRow, colMap, transactions) {
    var endRow = startRow + transactions.length - 1;
    var fields = [
      ["transferWiseId", function (tx) { return tx.transferWiseId; }],
      ["wiseDate", function (tx) { return tx.wiseDate; }, "@"],
      ["wiseDatetime", function (tx) { return tx.wiseDatetime; }, "@"],
      ["wiseAmount", function (tx) { return tx.wiseAmount; }],
      ["currency", function (tx) { return tx.currency; }],
      ["description", function (tx) { return tx.description; }],
      ["paymentReference", function (tx) { return tx.paymentReference; }],
      ["runningBalance", function (tx) { return tx.runningBalance; }],
      ["exchangeFrom", function (tx) { return tx.exchangeFrom; }],
      ["exchangeTo", function (tx) { return tx.exchangeTo; }],
      ["exchangeRate", function (tx) { return tx.exchangeRate; }],
      ["payerName", function (tx) { return tx.payerName; }],
      ["payeeName", function (tx) { return tx.payeeName; }],
      ["payeeAccountNumber", function (tx) { return tx.payeeAccountNumber; }],
      ["merchant", function (tx) { return tx.merchant; }],
      ["totalFees", function (tx) { return tx.totalFees; }],
      ["exchangeToAmount", function (tx) { return tx.exchangeToAmount; }],
      ["transactionType", function (tx) { return tx.transactionType; }],
      ["transactionDetailsType", function (tx) { return tx.transactionDetailsType; }],
    ];
    fields.forEach(function (field) {
      bankConnectorWriteColumn_(sheet, startRow, endRow, colMap[field[0]], transactions, field[1], field[2]);
    });
  },
});

function fillWiseUsdTransactions() { return WISE_USD_SPEC.fillMenu(); }
