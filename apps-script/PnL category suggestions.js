// Global variables
const API_CONFIG = {
  gemini: {
    // Using the latest Gemini 3 Flash Preview (Dec 2025 release)
    // url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    keyProperty: 'GEMINI_API_KEY'
  }
};

const CATEGORIES = [
  "INCOME", "Income - Affiliate", "Income - Subscription", "Income - Purchase Refunds", "Income - Uncategorized",
  "Income - Interest", "Income - VAT return", "Income - Loans", "Income - Investments", "Income - Grants",
  "Income - Cashbacks", "Internal Transfer - IN", "PAYROLL", "Payroll - Founders", "Payroll - Contractors", "Payroll - Internals",
  "Payroll - Internals Extra", "Payroll - Payroll taxes", "Payroll - Social Contribution", "TRAVEL",
  "Travel - Transportation", "Travel - Accomodation", "Travel - Reimbursable Expenses", "Travel - Meals and Entertainment",
  "TRAINING", "Training - Accomodation", "Training - Travel", "Training - Event cost", "Training - Other",
  "OFFICE EXPENSES", "Office - Rent", "Office - Maintentance", "Office - Water & Energy", "Office - Telecoms",
  "Office - Supplies", "Office - Meals & Entertainment", "Office - Other", "MARKETING", "Marketing - Online other",
  "Marketing - Google", "Marketing - Bing", "Marketing - Facebook", "Marketing - Contractors", "Marketing - Tools",
  "Marketing - Offline", "Marketing - Other", "Marketing - Content", "ONLINE SERVICES",
  "Online Services - Infrastructure / platform", "Online Services - Other Saas", "Online Services - Development Saas",
  "Online Services - Sales tools", "BANKING", "Banking - Interest Expence", "Banking - Fees", "ASSETS",
  "Assets - Hardware", "Assets - Software", "Assets - Furniture", "Assets - Other", "CONTRACTORS",
  "Contractors - Legal", "Contractors - Finance", "Contractors - External Task Vendor",
  "Contractors - External Task Individuals", "Contractors - Design", "Contractors - Content", "Contractors - HR",
  "Contractors - Development", "Contractors - Sales", "Contractors - Other", "OTHER", "Other - Double Booking Expenses",
  "Other - Market Research", "Other - Taxes", "Other - Research", "Other - Refunds", "Other - Software",
  "Other - Loan Repayments", "Other - Fraud", "Other - M&A", "Other - Uncategorized", "Other - Alex personal", "Internal Transfer - OUT"
];

function categorizeTrans() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // Reset high-speed logs before execution
  CacheService.getScriptCache().remove("terminalLogs");

  // Launch the terminal UI
  showTerminal();

  // Start process
  appendLog("Starting categorization process...");
  const dataResult = getSheetData(sheet);

  if (!dataResult || !Array.isArray(dataResult.data)) {
    appendLog("Error: Failed to retrieve valid data from the sheet.");
    return;
  }

  const data = dataResult.data;
  const startRow = dataResult.startRow;
  appendLog(`Retrieved ${data.length} rows of data starting from row ${startRow}.`);

  const emptyCategories = data.filter((row) => !row.category);
  appendLog(`Found ${emptyCategories.length} rows with empty categories.`);

  if (emptyCategories.length === 0) {
    appendLog("No empty categories found. Process completed successfully.");
    return;
  }

  const trainingData = getTrainingData(sheet, startRow);
  appendLog(`Retrieved ${trainingData.length} training transactions.`);

  // OPTIMIZATION: Reduced batch size to 30 to avoid 60-second Apps Script timeouts
  const BATCH_SIZE = 30; 
  for (let i = 0; i < emptyCategories.length; i += BATCH_SIZE) {
    const batch = emptyCategories.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    
    // OPTIMIZATION: Calculate exact starting row for this batch
    const currentBatchStartRow = startRow + i; 

    appendLog(`Processing batch ${batchNumber}: ${batch.length} rows...`);
    try {
      let categorySuggestions = null;
      let attemptCount = 0;
      let responseReceived = false;

      while (!responseReceived) {
        try {
          attemptCount++;
          appendLog(`Attempting API call for batch ${batchNumber} (Attempt ${attemptCount})...`);
          
          categorySuggestions = getGeminiCategorySuggestions(trainingData, batch);
          responseReceived = true;
          
          appendLog(`Batch ${batchNumber}: Received ${categorySuggestions.length} category suggestions.`);
        } catch (apiError) {
          appendLog(`API call for batch ${batchNumber} failed (Attempt ${attemptCount}): ${apiError.message}`);
          Utilities.sleep(3000); // Only sleep on failures
        }
      }

      appendLog(`Batch ${batchNumber}: Writing category suggestions to the sheet...`);
      writeSuggestionsToSheet(sheet, categorySuggestions, currentBatchStartRow, batch.length);
    } catch (error) {
      appendLog(`Error processing batch ${batchNumber}: ${error.message}`);
      continue;
    }

    appendLog(`Finished processing batch ${batchNumber}.`);
  }

  appendLog("Categorization process completed for all batches.");
  appendLog("✅ Process is 100% complete! You can now safely close this terminal window.");
  
  // FINAL CLEANUP
  // CacheService.getScriptCache().remove("terminalLogs");
}

// OPTIMIZATION: Switched to CacheService for high-speed, non-blocking logging
function appendLog(msg) {
  const cache = CacheService.getScriptCache();
  const logs = cache.get("terminalLogs");
  
  let arr = logs ? JSON.parse(logs) : [];
  arr.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
  
  if (arr.length > 50) {
    arr = arr.slice(-50);
  }
  
  // Auto-expires in 10 minutes (600 seconds)
  cache.put("terminalLogs", JSON.stringify(arr), 600);
}

Logger.log = function (msg) { appendLog(msg); };
console.log = function (msg) { appendLog(msg); };

function getLogs() {
  const cache = CacheService.getScriptCache();
  const logs = cache.get("terminalLogs");
  return logs ? JSON.parse(logs).join("\n") : "Initializing… Waiting for logs.";
}

// NEW: Locate all columns we care about, in one place, so the two readers stay in sync.
function getColumnIndexes(headers) {
  const find = (name) => headers.findIndex(header => header.toString().trim().toLowerCase() === name);
  return {
    date: find('date'),
    uniqueId: find('uniqueid'),
    description: find('description'),
    bankDescription: find('bank description'),
    direction: find('direction'),
    amount: find('amount'),
    category: find('category'),
    categorySuggestion: find('category suggestion'),
    paymentReference: find('payment reference'),
    confidence: find('confidence')
  };
}

// NEW: Sheet date cells come back as Date objects; JSON.stringify would emit a full
// UTC timestamp. Normalise to yyyy-MM-dd so the model gets a clean, compact signal.
function formatDateValue(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return value ? value.toString().trim() : '';
}

function getTrainingData(sheet, startRow) {
  console.log(`Getting training data from transactions before row ${startRow}`);
  
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const columnIndexes = getColumnIndexes(headers);
  
  if (columnIndexes.category === -1) {
    console.error("Category column not found for training data");
    return [];
  }

  if (columnIndexes.date === -1) {
    console.log("WARNING: No 'Date' column found. Training examples will be sent without dates.");
  }
  
  const endRow = startRow - 1;
  if (endRow < 2) {
    console.log("No previous transactions available for training");
    return [];
  }
  
  const allValues = sheet.getRange(2, 1, endRow - 1, lastColumn).getValues();
  const categorizedRows = [];
  
  // Walk backwards from the bottom so we keep the 500 MOST RECENT categorized rows.
  for (let i = allValues.length - 1; i >= 0 && categorizedRows.length < 500; i--) {
    const categoryValue = allValues[i][columnIndexes.category];
    if (categoryValue && categoryValue.toString().trim() !== '') {
      // CHANGED: 'date' added. 'categorySuggestion' and 'confidence' removed —
      // those are the model's own past guesses, and feeding uncorrected wrong
      // guesses back in just reinforces them.
      const row = {
        date: columnIndexes.date !== -1 ? formatDateValue(allValues[i][columnIndexes.date]) : '',
        uniqueId: allValues[i][columnIndexes.uniqueId],
        description: allValues[i][columnIndexes.description],
        bankDescription: columnIndexes.bankDescription !== -1 ? allValues[i][columnIndexes.bankDescription] : '',
        direction: columnIndexes.direction !== -1 ? allValues[i][columnIndexes.direction] : '',
        amount: columnIndexes.amount !== -1 ? allValues[i][columnIndexes.amount] : '',
        category: categoryValue
      };
      // unshift keeps the final array in chronological order: oldest first, newest last.
      categorizedRows.unshift(row);
    }
  }
  
  console.log(`Found ${categorizedRows.length} categorized transactions for training`);
  return categorizedRows;
}

function getSheetData(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const columnIndexes = getColumnIndexes(headers);
  
  if (columnIndexes.uniqueId === -1 || columnIndexes.description === -1 || columnIndexes.category === -1) {
    console.error("Required columns are missing. Please ensure UniqueID, Description, and Category columns exist.");
    return null;
  }
  
  let startRow = 2;
  const allValues = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  
  for (let i = allValues.length - 1; i >= 0; i--) {
    const categoryValue = allValues[i][columnIndexes.category];
    if (categoryValue && categoryValue.toString().trim() !== '') {
      startRow = i + 3;
      break;
    }
  }
  
  if (startRow > lastRow) {
    console.log("No uncategorized rows found after the last categorized row.");
    return { data: [], startRow: startRow };
  }
  
  const values = sheet.getRange(startRow, 1, lastRow - startRow + 1, lastColumn).getValues();
  
  // CHANGED: 'date' added so the model can see these targets follow the training set.
  const data = values.map(row => ({
    date: columnIndexes.date !== -1 ? formatDateValue(row[columnIndexes.date]) : '',
    uniqueId: row[columnIndexes.uniqueId],
    description: row[columnIndexes.description],
    bankDescription: columnIndexes.bankDescription !== -1 ? row[columnIndexes.bankDescription] : '',
    direction: columnIndexes.direction !== -1 ? row[columnIndexes.direction] : '',
    amount: columnIndexes.amount !== -1 ? row[columnIndexes.amount] : '',
    category: row[columnIndexes.category]
  }));
  
  return { data: data, startRow: startRow };
}

function getGeminiCategorySuggestions(trainingData, emptyCategories) {
  appendLog(`Building prompt using ${trainingData.length} training items...`);
  const trainingPrompt = createTrainingPrompt(trainingData);
  
  appendLog(`Building prompt using ${emptyCategories.length} target items...`);
  const categorizationPrompt = createCategorizationPrompt(emptyCategories);
  
  const fullPrompt = `${trainingPrompt}\n\n${categorizationPrompt}`;
  
  appendLog("Prompt successfully built. Handing off to API caller...");
  const response = callGeminiAPI(fullPrompt);
  
  appendLog("Handing response to parser...");
  return parseGeminiResponse(response, emptyCategories);
}

function callGeminiAPI(prompt) {
  const apiKey = PropertiesService.getScriptProperties().getProperty(API_CONFIG.gemini.keyProperty);

  const payload = {
    contents: [{
      role: 'user',
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: 0.1,
      topK: 1,
      topP: 1,
      maxOutputTokens: 100000,
      responseMimeType: "application/json"
    }
  };

  const options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true // We handle the exceptions manually below
  };

  try {
    const payloadSize = Math.round(options.payload.length / 1024);
    appendLog(`-> OUTBOUND: Sending ${payloadSize} KB payload to Gemini API...`);
    
    // Start a timer to see exactly how long the API takes to respond
    const startTime = Date.now();
    
    const response = UrlFetchApp.fetch(API_CONFIG.gemini.url, options);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const responseCode = response.getResponseCode();
    
    appendLog(`<- INBOUND: Received status ${responseCode} in ${duration} seconds.`);
    
    const responseText = response.getContentText(); 
    
    if (responseCode !== 200) {
      appendLog(`[ERROR] API rejected request. Payload snippet: ${responseText.substring(0, 150)}...`);
      throw new Error(`API call failed with status ${responseCode}`);
    }

    return JSON.parse(responseText); 
  } catch (error) {
    appendLog(`[CRITICAL ERROR] in callGeminiAPI: ${error.message}`); 
    throw error; 
  }
}



function createTrainingPrompt(trainingData) {
  const tokenLimit = 110000;
  let tokenCount = 0;
  let recentData = [];
  const estimateTokens = (str) => Math.ceil(str.length / 4);

  // Report the actual span of the training window so the instruction below is concrete.
  const dated = trainingData.filter(t => t.date);
  const dateRangeNote = dated.length
    ? `These examples span ${dated[0].date} to ${dated[dated.length - 1].date}.`
    : `These examples are ordered oldest to newest, though dates are not available.`;

  let prompt = `You are an AI assistant tasked with learning to categorize financial transactions.
  
  Here is a list of valid categories:
  ${CATEGORIES.join(", ")}
  
  I will provide you with a list of past transactions that have already been categorized. 
  Learn from these transactions to understand how different types of transactions are categorized.
  Pay attention to transaction descriptions, amounts, and directions (IN/OUT).
  Large transactions (larger than 10,000$) with round numbers (e.g., multiples of 1000) are most probably internal transfers.

  Always use one of the provided valid categories above. 

  IMPORTANT — HOW TO WEIGHT THESE EXAMPLES:
  The examples below are sorted in chronological order, oldest first and newest last, and each carries a "date" field. ${dateRangeNote}
  Our categorization conventions change over time, so the newest examples are the most authoritative.
  When the same vendor, merchant, or description appears more than once with DIFFERENT categories,
  use the category from the MOST RECENT occurrence. Do not pick the category that simply appears
  most often — a label used many times in the past has usually been superseded by a more recent one.
  Treat the most recent example for a given vendor as the current convention, and apply that convention
  to the transactions you are asked to categorize.

  Here are the categorized transactions for you to learn from:
  `;

  tokenCount += estimateTokens(prompt);

  // Iterate backwards and unshift: if the token limit is hit, the OLDEST examples
  // are dropped first and the most recent ones are always kept.
  for (let i = trainingData.length - 1; i >= 0; i--) {
    const transaction = trainingData[i];
    const transactionStr = JSON.stringify(transaction);
    const transactionTokens = estimateTokens(transactionStr);

    if (tokenCount + transactionTokens > tokenLimit) {
      break;
    }

    recentData.unshift(transaction);
    tokenCount += transactionTokens;
  }

  prompt += JSON.stringify(recentData, null, 2);
  return prompt;
}

function createCategorizationPrompt(emptyCategories) {
  const tokenLimit = 100000;
  let tokenCount = 0;
  const estimateTokens = (str) => Math.ceil(str.length / 4);

  // OPTIMIZATION: Explicitly demand JSON output format
  let prompt = `Now that you have learned from the categorized transactions, please suggest categories for the following uncategorized transactions.

  These transactions are NEWER than every example above. Where a vendor's category has changed over time
  in the examples, apply the most recent convention, not the historically most common one.
  Always use one of the provided valid categories above. If the direction is "IN", select a category that starts with "Income".

  Provide the response strictly as a JSON array of objects. Each object must contain exactly these keys:
  - "uniqueId": The UniqueID of the transaction.
  - "categorySuggestion": The suggested category (must be one from the list of valid categories).
  - "confidenceScore": A number from 1 to 10 (1 = least confident, 10 = most confident).

  Here are the transactions to categorize:
  `;

  tokenCount += estimateTokens(prompt);

  const emptyCategoriesToInclude = [];
  for (const category of emptyCategories) {
    const categoryStr = JSON.stringify(category);
    const categoryTokens = estimateTokens(categoryStr);

    if (tokenCount + categoryTokens > tokenLimit) {
      break;
    }

    emptyCategoriesToInclude.push(category);
    tokenCount += categoryTokens;
  }

  prompt += JSON.stringify(emptyCategoriesToInclude, null, 2);
  return prompt;
}


function parseGeminiResponse(response, emptyCategories) {
  if (!response.candidates || !response.candidates[0] || !response.candidates[0].content) {
    console.error("Unexpected API response format");
    return [];
  }

  const content = response.candidates[0].content.parts[0].text;
  let suggestions = [];
  
  // OPTIMIZATION: Parse native JSON instantly instead of regex matching lines
  try {
    suggestions = JSON.parse(content);
  } catch (e) {
    console.error("Failed to parse JSON response:", e);
    return [];
  }
  
  console.log(`Parsed ${suggestions.length} suggestions from JSON response.`);
  
  const validSuggestions = suggestions.filter(suggestion => {
    const isValid = emptyCategories.some(row => row.uniqueId === suggestion.uniqueId);
    if (!isValid) {
      console.warn(`Suggestion for UniqueID ${suggestion.uniqueId} not found in current batch.`);
    }
    return isValid;
  });
  
  return validSuggestions;
}

function writeSuggestionsToSheet(sheet, suggestions, batchStartRow, batchLength) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const findColumnIndex = (name) => headers.findIndex(header => header.toString().toLowerCase() === name.toLowerCase()) + 1;

  const uniqueIdIndex = findColumnIndex('UniqueID');
  const categorySuggestionIndex = findColumnIndex('category suggestion');
  const confidenceScoreIndex = findColumnIndex('Confidence');
  
  if (uniqueIdIndex === 0 || categorySuggestionIndex === 0 || confidenceScoreIndex === 0) {
    throw new Error("Required columns not found in the sheet.");
  }

  // OPTIMIZATION: Only fetch and write to the exact boundary of the current batch
  const dataRange = sheet.getRange(batchStartRow, 1, batchLength, Math.max(uniqueIdIndex, categorySuggestionIndex, confidenceScoreIndex));
  const data = dataRange.getValues();

  const suggestionMap = new Map(suggestions.map(s => [s.uniqueId, s]));

  data.forEach((row, index) => {
    const rowUniqueId = row[uniqueIdIndex - 1];
    const suggestion = suggestionMap.get(rowUniqueId);

    if (suggestion) {
      sheet.getRange(index + batchStartRow, categorySuggestionIndex).setValue(suggestion.categorySuggestion);
      sheet.getRange(index + batchStartRow, confidenceScoreIndex).setValue(suggestion.confidenceScore);
    }
  });

  console.log(`Finished writing ${suggestions.length} suggestions to sheet.`);
}

function showTerminal() {
  const html = HtmlService.createHtmlOutputFromFile('terminal')
    .setWidth(600)
    .setHeight(400);
  SpreadsheetApp.getUi().showModalDialog(html, "Processing Terminal");
}