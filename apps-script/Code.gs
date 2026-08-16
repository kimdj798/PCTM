// Paste this into Extensions > Apps Script inside the PCTM Google Sheet,
// then deploy it as a Web App. See README.md for full setup steps.

const SHEET_NAME = "2026";
const EDIT_PASSWORD = "CHANGE_ME"; // Set a shared password before deploying.

function doPost(e) {
  let result;
  try {
    if (!e.postData || !e.postData.contents) throw new Error("No request body.");
    const body = JSON.parse(e.postData.contents);
    if (body.password !== EDIT_PASSWORD) {
      result = { ok: false, error: "Incorrect password." };
    } else {
      const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
      if (!sheet) throw new Error(`Sheet tab "${SHEET_NAME}" not found.`);
      const updates = Array.isArray(body.updates) ? body.updates : [];
      updates.forEach(update => {
        const row = Number(update.row);
        const col = Number(update.col);
        if (!row || !col) throw new Error("Invalid row/column in update.");
        sheet.getRange(row, col).setValue(update.value === undefined ? "" : update.value);
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
