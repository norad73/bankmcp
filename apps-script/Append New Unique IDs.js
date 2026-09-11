function updateUniqueIDs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var currentSheet = ss.getActiveSheet();
  var currentSheetName = currentSheet.getName();
  
  // 1. Logic for finding the paired sheet
  var pairedSheetName = currentSheetName.replace(" match", "");
  var pairedSheet = ss.getSheetByName(pairedSheetName);

  if (!pairedSheet) {
    throw new Error("Paired sheet not found: " + pairedSheetName);
  }

  // 2. Get IDs
  var currentUniqueIDs = getUniqueIDs(currentSheet);
  var pairedUniqueIDs = getUniqueIDs(pairedSheet);
  
  // Log counts instead of full arrays to prevent "Argument too large" error
  Logger.log("Current Sheet IDs found: " + currentUniqueIDs.length);
  Logger.log("Paired Sheet IDs found: " + pairedUniqueIDs.length);

  // 3. Filter for new IDs (Optimized with a Set for speed)
  var currentSet = new Set(currentUniqueIDs);
  var newUniqueIDs = pairedUniqueIDs.filter(id => !currentSet.has(id));
  
  Logger.log("New Unique IDs to add: " + newUniqueIDs.length);

  // 4. Append
  appendUniqueIDs(currentSheet, newUniqueIDs);
}

function getUniqueIDs(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return []; // Return empty if sheet is empty
  
  var range = sheet.getRange("A2:A" + lastRow);
  var values = range.getValues();
  
  // Flatten and remove empty cells
  return values.flat().filter(id => id !== "");
}

function appendUniqueIDs(sheet, uniqueIDs) {
  if (uniqueIDs.length === 0) {
    Logger.log("No new UniqueIDs to add.");
    return;
  }

  var startRow = sheet.getLastRow() + 1;
  // Prepare data as a 2D array
  var values = uniqueIDs.map(id => [id]);
  
  sheet.getRange(startRow, 1, values.length, 1).setValues(values);
  Logger.log("Successfully added " + uniqueIDs.length + " rows.");
}