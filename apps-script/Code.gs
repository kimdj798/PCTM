// Paste this into Extensions > Apps Script inside the PCTM Google Sheet,
// then deploy it as a Web App. See README.md for full setup steps.

const SHEET_NAME = "2026";
// Tabs the dashboard may write to. Updates without a "sheet" go to SHEET_NAME.
const EDITABLE_SHEETS = [SHEET_NAME, "AgendaTimes"];
const EDIT_PASSWORD = "CHANGE_ME"; // Set a shared password before deploying.

function doPost(e) {
  let result;
  try {
    if (!e.postData || !e.postData.contents) throw new Error("No request body.");
    const body = JSON.parse(e.postData.contents);
    if (body.password !== EDIT_PASSWORD) {
      result = { ok: false, error: "Incorrect password." };
    } else {
      const updates = Array.isArray(body.updates) ? body.updates : [];
      updates.forEach(update => {
        const sheetName = update.sheet || SHEET_NAME;
        if (EDITABLE_SHEETS.indexOf(sheetName) === -1) throw new Error(`Sheet tab "${sheetName}" is not editable.`);
        const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
        if (!sheet) throw new Error(`Sheet tab "${sheetName}" not found.`);
        const value = update.value === undefined ? "" : update.value;
        if (update.cell) {
          sheet.getRange(String(update.cell)).setValue(value);
          return;
        }
        const row = Number(update.row);
        const col = Number(update.col);
        if (!row || !col) throw new Error("Invalid row/column in update.");
        sheet.getRange(row, col).setValue(value);
      });
      result = { ok: true, updated: updates.length };
    }
  } catch (err) {
    result = { ok: false, error: err.message || String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, message: "PCTM edit endpoint is running. Use POST." }))
    .setMimeType(ContentService.MimeType.JSON);
}
