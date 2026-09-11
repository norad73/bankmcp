var CLEDARA_SPEC = bankConnectorMakeFillHandlers_({
  sheetName: "Cledara",
  endpoint: "/cron/sync-cledara-transactions",
  action: "fill-cledara",
  menuHandler: "fillCledaraTransactions",
  menuLabel: "Fill Cledara transactions",
  label: "Cledara",
  logPrefix: "fillCledaraTransactions",
  skipReason: "No new Cledara transactions",
  yellowHeaders: { origDate: "origDate", description: "Description", amount: "Amount", direction: "Direction" },
  sinceDateField: "origDate",
  compositeKnownFields: ["origDate", "description", "amount"],
  buildPayload: function (sheet, colMap, payload) {
    var uniqueCol = bankConnectorFindUniqueIdColumn_(sheet);
    var uniqueIds = bankConnectorLoadKnownIds_(sheet, uniqueCol);
    payload.knownTransactionIds = payload.knownTransactionIds.concat(uniqueIds);
    payload.knownDateAmountKeys = bankConnectorLoadDateAmountKeys_(sheet, colMap.origDate, colMap.amount);
    return payload;
  },
  writeRows: function (sheet, startRow, colMap, transactions) {
    var endRow = startRow + transactions.length - 1;
    var uniqueCol = bankConnectorFindUniqueIdColumn_(sheet);
    bankConnectorWriteColumn_(sheet, startRow, endRow, uniqueCol, transactions, function (tx) {
      return bankConnectorUniqueId_(tx.origDate, tx.description, tx.amount, 12);
    });
    bankConnectorWriteColumn_(sheet, startRow, endRow, colMap.origDate, transactions, function (tx) { return tx.origDate; });
    bankConnectorWriteColumn_(sheet, startRow, endRow, colMap.description, transactions, function (tx) { return tx.description; });
    bankConnectorWriteColumn_(sheet, startRow, endRow, colMap.amount, transactions, function (tx) { return tx.amount; });
    bankConnectorWriteColumn_(sheet, startRow, endRow, colMap.direction, transactions, function (tx) { return tx.direction; });
  },
});

function fillCledaraTransactions() { return CLEDARA_SPEC.fillMenu(); }
