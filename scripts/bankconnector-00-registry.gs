// BankConnector — module registry (must load before other bankconnector-*.gs files).
// Script version: 0.4.40 (keep in sync with BankConnector app version)

var BANKCONNECTOR_MODULES_ = [];

function registerBankConnectorModule_(module) {
  if (!module || !module.action || !module.impl) {
    throw new Error("registerBankConnectorModule_ requires action and impl");
  }
  BANKCONNECTOR_MODULES_.push(module);
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
