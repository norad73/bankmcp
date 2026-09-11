// BankConnector — module registry (must load before other bankconnector-*.gs files).
// Script version: 0.4.42 (keep in sync with BankConnector app version)
//
// Each transaction tab script registers itself at the bottom — menu + webhook dispatch
// are built automatically. No edits to bankconnector-balances.gs when adding a bank.
//
// New bank script (end of file):
//   registerBankConnectorModule_({
//     menuLabel: "Fill Wise EUR transactions",
//     menuHandler: "fillWiseEurTransactions",
//     action: "fill-wise-eur",
//     impl: fillWiseEurTransactionsImpl_,
//   });

var BANKCONNECTOR_MODULES_ = [];

function registerBankConnectorModule_(module) {
  if (!module || !module.action || !module.impl || !module.menuLabel || !module.menuHandler) {
    throw new Error("registerBankConnectorModule_ requires action, impl, menuLabel, menuHandler");
  }
  if (findBankConnectorModule_(module.action)) {
    throw new Error("Duplicate BankConnector action: " + module.action);
  }
  BANKCONNECTOR_MODULES_.push(module);
}

function bankConnectorSheetOrderIndex_(sheetName) {
  if (!sheetName) return 9999;
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName() === sheetName) return i;
  }
  return 9999;
}

function addBankConnectorTransactionMenuItems_(menu) {
  var modules = getBankConnectorModules_().slice();
  modules.sort(function (a, b) {
    var order = bankConnectorSheetOrderIndex_(a.sheetName) - bankConnectorSheetOrderIndex_(b.sheetName);
    if (order !== 0) return order;
    return String(a.menuLabel).localeCompare(String(b.menuLabel));
  });
  modules.forEach(function (module) {
    menu.addItem(module.menuLabel, module.menuHandler);
  });
}

function addAllBankConnectorMenuItems_(menu) {
  menu.addItem("Fill balances sheet", "fillBalancesSheet");
  addBankConnectorTransactionMenuItems_(menu);
}

function getBankConnectorModules_() {
  return BANKCONNECTOR_MODULES_;
}

function findBankConnectorModule_(action) {
  var modules = getBankConnectorModules_();
  for (var i = 0; i < modules.length; i++) {
    if (modules[i].action === action) return modules[i];
  }
  return null;
}

function bankConnectorActionHelp_() {
  var actions = ["fill"];
  getBankConnectorModules_().forEach(function (m) {
    actions.push(m.action);
  });
  return "Use POST { action: '" + actions.join("' | '") + "', ... } or run menu items from the sheet.";
}
