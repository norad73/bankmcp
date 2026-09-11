// Version 1.3
function TransactionFinder() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sourceSheet = ss.getSheetByName('all banks');
  var targetSheet = ss.getSheetByName('Transaction Finder');
  var period = ss.getRange('B2').getValue();
  var filterBank = ss.getRange('B3').getValue();
  var filterCategoryInclude = ss.getRange('B4').getValue().toLowerCase();
  var filterCategoryExclude = ss.getRange('B5').getValue().toLowerCase();
  var filterDescriptionInclude = ss.getRange('B6').getValue().toLowerCase();
  var filterDescriptionExclude = ss.getRange('B7').getValue().toLowerCase();
  var directionFilter = ss.getRange('B8').getValue();
  var sortField = ss.getRange('E2').getValue();
  var sortDirection = ss.getRange('E4').getValue();
  var sortIndexes = {
    'Bank': 0,
    'Date': 1,
    'Amount': 2,
    'Direction': 3,
    'Category': 4,
    'Description': 5
  };

// Clear existing results from the 12th row onwards, preserving headers
  var lastRow = targetSheet.getLastRow();
  if (lastRow > 11) {
    targetSheet.getRange('A12:F' + lastRow).clearContent();
  }

  // Fetch all data from the source sheet
  var sourceData = sourceSheet.getDataRange().getValues();
  var headers = sourceData[0];
  var targetValues = [];


  // Find the indexes of the required columns based on header names
  var dateIndex = headers.indexOf('Date');
  var amountIndex = headers.indexOf('Amount');
  var bankIndex = headers.indexOf('Bank');
  var directionIndex = headers.indexOf('Direction');
  var categoryIndex = headers.indexOf('Category');
  var descriptionIndex = headers.indexOf('Description');

  // Iterate through each row in the source data
  for (var i = 1; i < sourceData.length; i++) {
    var row = sourceData[i];
    var date = new Date(row[dateIndex]);
    var bank = row[bankIndex];
    var category = row[categoryIndex];
    var description = String(row[descriptionIndex]); // Convert to string to ensure toLowerCase works
    var direction = row[directionIndex];

   // Log the description and whether it includes the filter term
   // Logger.log('Description: ' + description + ' | Searching for: ' + filterDescriptionInclude.toLowerCase());
    var matchesDescriptionInclude = matchFilter(description.toLowerCase(), filterDescriptionInclude.toLowerCase());
   // Logger.log('Matches Description Include: ' + matchesDescriptionInclude); // This will log if the description matches the filter
    


    // Apply filters
    var matchesPeriod = matchPeriod(date, period);
    var matchesBank = matchFilter(bank, filterBank);
    var matchesCategoryInclude = matchFilter(category, filterCategoryInclude);
    //var matchesCategoryExclude = !filterCategoryExclude || !category.toLowerCase().includes(filterCategoryExclude.toLowerCase());
    var matchesCategoryExclude = notMatchFilter(category, filterCategoryExclude);

    var matchesDescriptionInclude = matchFilter(description.toLowerCase(), filterDescriptionInclude.toLowerCase());

    //var matchesDescriptionExclude = !filterDescriptionExclude || !description.toLowerCase().includes(filterDescriptionExclude.toLowerCase());
    var matchesDescriptionExclude = notMatchFilter(description, filterDescriptionExclude)


    var matchesDirection = matchFilter(direction, directionFilter);

    // Check if the row matches all filters
    if (matchesPeriod && matchesBank && matchesCategoryInclude && matchesDescriptionInclude && matchesDescriptionExclude && matchesDirection && matchesCategoryExclude) {
      var formattedDate = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      var amount = typeof row[amountIndex] === 'string' ? parseFloat(row[amountIndex].replace(/[^0-9.-]+/g, "")) : row[amountIndex];
      var formattedAmount = amount.toFixed(2);

      // Create a row for the target sheet
      var targetRow = [
        bank,                      // Bank
        formattedDate,             // Date
        "$" + formattedAmount,     // Amount prefixed with $ sign
        direction,                 // Direction
        category,                  // Category
        description                // Description
      ];

      // Add the row to the array of values to be added to the target sheet
      targetValues.push(targetRow);
    }
  }

  // Sort the targetValues array based on the sort field and direction, only if specified
  if (sortField && sortDirection) {
    var sortIndex = sortIndexes[sortField];

    targetValues.sort(function(a, b) {
      var valueA = a[sortIndex];
      var valueB = b[sortIndex];

      // For Amount field, we need to compare numbers instead of strings
      if (sortField === 'Amount') {
        valueA = parseFloat(a[sortIndex].replace(/[^0-9.-]+/g, ""));
        valueB = parseFloat(b[sortIndex].replace(/[^0-9.-]+/g, ""));
      } else if (sortField === 'Date') {
        // Parse the dates for comparison
        valueA = new Date(valueA);
        valueB = new Date(valueB);
      }

      if (sortDirection === 'Ascending') {
        return valueA < valueB ? -1 : (valueA > valueB ? 1 : 0);
      } else {
        return valueA < valueB ? 1 : (valueA > valueB ? -1 : 0);
      }
    });
  }

  // Write the filtered and sorted data to the target sheet
  if (targetValues.length > 0) {
    var targetRange = targetSheet.getRange(12, 1, targetValues.length, 6);
    targetRange.setValues(targetValues);
    Logger.log('Data written to the target sheet.');
  } else {
    Logger.log('No data matched the criteria.');
  }
}

// Helper function to match dates with period
function matchPeriod(date, period) {
  if (!period) return true;
  var periodYear = parseInt(period.substring(0, 4));
  var periodMonth = period.length > 4 ? parseInt(period.substring(5, 7)) - 1 : null;
  return date.getFullYear() === periodYear && (periodMonth === null || date.getMonth() === periodMonth);
}

// Helper function to match string with filter, allows "Any" to match anything
function matchFilter(fieldValue, filterValue) {
  // Check if the filter value is 'any', is empty, or if the field value includes the filter value
  return filterValue.toLowerCase() === 'any' || 
         !filterValue || 
         fieldValue.toLowerCase().includes(filterValue.toLowerCase());
}


function notMatchFilter(fieldValue, filterValue) {
  // Ensure filterValue is not part of fieldValue
  return !filterValue || !fieldValue.toLowerCase().includes(filterValue.toLowerCase());
}

