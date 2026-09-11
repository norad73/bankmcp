function checkSheetLimits() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var files = DriveApp.getFileById(spreadsheet.getId());
  var currentSize = files.getSize(); // Size in bytes
  
  // Size limits
  var consumerLimit = 10 * 1024 * 1024; // 10 MB in bytes
  var workspaceLimit = 5 * 1024 * 1024 * 1024; // 5 GB in bytes
  
  // Cell count limits
  var cellLimit = 10000000; // 10 million cells per spreadsheet
  var totalCells = 0;
  
  // Count cells in all sheets
  var sheets = spreadsheet.getSheets();
  sheets.forEach(function(sheet) {
    var maxRows = sheet.getMaxRows();
    var maxCols = sheet.getMaxColumns();
    var sheetCells = maxRows * maxCols;
    totalCells += sheetCells;
    Logger.log("Sheet '" + sheet.getName() + "' has " + sheetCells + " cells (" + maxRows + " rows × " + maxCols + " columns)");
  });
  
  // Calculate percentages
  var sizeInMB = (currentSize / (1024 * 1024)).toFixed(2);
  var consumerPercentage = (currentSize / consumerLimit) * 100;
  var workspacePercentage = (currentSize / workspaceLimit) * 100;
  var cellPercentage = (totalCells / cellLimit) * 100;
  
  Logger.log("\nSPREADSHEET LIMITS:");
  Logger.log("Size: " + sizeInMB + " MB");
  Logger.log("Percentage of consumer account limit (10 MB): " + consumerPercentage.toFixed(2) + "%");
  Logger.log("Percentage of Workspace account limit (5 GB): " + workspacePercentage.toFixed(2) + "%");
  Logger.log("\nCELL COUNT:");
  Logger.log("Total cells across all sheets: " + totalCells.toLocaleString());
  Logger.log("Percentage of cell limit (10M): " + cellPercentage.toFixed(2) + "%");
}