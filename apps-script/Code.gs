// Paste this into Extensions > Apps Script inside the PCTM Google Sheet,
// then deploy it as a Web App. See README.md for full setup steps.

// Bump when changing this file; the web app reports it (open the /exec URL
// in a browser) so you can confirm which version is actually deployed.
const CODE_VERSION = "2026-10-28.3";

const SHEET_NAME = "2026";
// Tabs the dashboard may write to. Updates without a "sheet" go to SHEET_NAME.
const EDITABLE_SHEETS = [SHEET_NAME, "AgendaTimes"];
const EDIT_PASSWORD = "CHANGE_ME"; // Set a shared password before deploying.

// ---- PCTM chatbot ----
// The chatbot's settings live in Project Settings > Script Properties, so
// re-pasting this file never wipes them:
//   GEMINI_API_KEY  (required) key from https://aistudio.google.com/apikey
//   CHAT_PASSWORD   (required) shared password for the chatbot page
//   GEMINI_MODEL    (optional) defaults to DEFAULT_GEMINI_MODEL below
const KNOWLEDGE_FILE_ID = "1Pp7YqjoDB7MtwC5UF1qUErB7IKIKKDub"; // PDF on Google Drive
const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";
// Tried in order when the main model is overloaded or unavailable.
const FALLBACK_GEMINI_MODELS = ["gemini-flash-lite-latest"];
const MAX_HISTORY_MESSAGES = 10;
const MAX_QUESTION_LENGTH = 2000;
const MAX_PDF_BYTES = 15 * 1024 * 1024; // Gemini inline request limit is ~20MB.

function doPost(e) {
  let result;
  try {
    if (!e.postData || !e.postData.contents) throw new Error("No request body.");
    const body = JSON.parse(e.postData.contents);
    if (body.action === "chat") {
      result = handleChat(body);
    } else if (body.password !== EDIT_PASSWORD) {
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
    .createTextOutput(JSON.stringify({ ok: true, message: "PCTM edit endpoint is running. Use POST.", version: CODE_VERSION }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Run this once from the Apps Script editor (select it in the toolbar, then
// Run) to grant the Drive and external-request permissions the chatbot needs.
// It also checks that the knowledge PDF and Gemini key are reachable.
function authorizeChatbot() {
  const file = DriveApp.getFileById(KNOWLEDGE_FILE_ID);
  Logger.log(`Knowledge PDF: ${file.getName()} (${Math.round(file.getSize() / 1024)} KB)`);
  const apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!apiKey) {
    Logger.log("GEMINI_API_KEY is not set in Script Properties yet.");
    return;
  }
  const response = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models", {
    headers: { "x-goog-api-key": apiKey },
    muteHttpExceptions: true,
  });
  Logger.log(`Gemini API check: HTTP ${response.getResponseCode()}`);
}

// Run from the editor to try the chatbot without the web page. The editor
// always runs the saved code, even if the web app deployment is older.
function testChatbot() {
  const password = PropertiesService.getScriptProperties().getProperty("CHAT_PASSWORD");
  const result = handleChat({
    password,
    language: "auto",
    messages: [{ role: "user", text: "What is this document about? Answer in one sentence." }],
  });
  Logger.log(JSON.stringify(result, null, 2));
}

function handleChat(body) {
  const props = PropertiesService.getScriptProperties();
  const chatPassword = props.getProperty("CHAT_PASSWORD");
  const apiKey = props.getProperty("GEMINI_API_KEY");
  if (!chatPassword || !apiKey) {
    return { ok: false, error: "Chatbot is not configured. Set CHAT_PASSWORD and GEMINI_API_KEY in Script Properties." };
  }
  if (body.password !== chatPassword) return { ok: false, error: "Incorrect password." };
  // A password-only request just checks the password (used by the unlock form).
  if (body.verifyOnly) return { ok: true };

  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter(m => m && (m.role === "user" || m.role === "model") && typeof m.text === "string" && m.text.trim())
    .slice(-MAX_HISTORY_MESSAGES);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return { ok: false, error: "No question to answer." };
  }
  if (messages[messages.length - 1].text.length > MAX_QUESTION_LENGTH) {
    return { ok: false, error: `Questions are limited to ${MAX_QUESTION_LENGTH} characters.` };
  }
  // Gemini requires the conversation to start with a user turn.
  while (messages.length && messages[0].role !== "user") messages.shift();

  const pdfBytes = DriveApp.getFileById(KNOWLEDGE_FILE_ID).getBlob().getBytes();
  if (pdfBytes.length > MAX_PDF_BYTES) throw new Error("Knowledge PDF is too large to send to Gemini.");

  // The PDF rides along with the first user turn on every request.
  const contents = messages.map((m, index) => {
    const parts = [{ text: m.text }];
    if (index === 0) {
      parts.unshift({ inlineData: { mimeType: "application/pdf", data: Utilities.base64Encode(pdfBytes) } });
    }
    return { role: m.role, parts };
  });

  const request = JSON.stringify({
    systemInstruction: { parts: [{ text: chatSystemPrompt(body.language) }] },
    contents,
    generationConfig: { temperature: 0.3 },
  });
  const primaryModel = props.getProperty("GEMINI_MODEL") || DEFAULT_GEMINI_MODEL;
  const models = [primaryModel].concat(FALLBACK_GEMINI_MODELS.filter(m => m !== primaryModel));

  // Each round tries every model once, moving straight on when one is
  // overloaded (503/500) or rate-limited (429). If all of them are busy, a
  // second round runs after a short pause.
  let payload = null;
  let lastError = "";
  const available = models.slice();
  for (let round = 0; round < 2 && !payload && available.length; round += 1) {
    if (round > 0) Utilities.sleep(2000);
    for (let i = 0; i < available.length && !payload; i += 1) {
      const model = available[i];
      const response = UrlFetchApp.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "post",
        contentType: "application/json",
        headers: { "x-goog-api-key": apiKey },
        muteHttpExceptions: true,
        payload: request,
      });
      const code = response.getResponseCode();
      const parsed = JSON.parse(response.getContentText() || "{}");
      Logger.log(`Gemini ${model} round ${round + 1}: HTTP ${code}`);
      if (code === 200) { payload = parsed; break; }
      lastError = (parsed.error && parsed.error.message) || `HTTP ${code}`;
      if (code === 404) {
        // Retired or misspelled model: skip it from now on.
        available.splice(i, 1);
        i -= 1;
        continue;
      }
      // Anything else (bad key, bad request) won't be fixed by retrying.
      if (code !== 503 && code !== 429 && code !== 500) {
        return { ok: false, error: `Gemini error: ${lastError}` };
      }
    }
  }
  if (!payload) {
    return { ok: false, error: `Gemini is busy right now — please try again in a minute. (${lastError})` };
  }
  const candidate = (payload.candidates || [])[0];
  const answer = ((candidate && candidate.content && candidate.content.parts) || [])
    .map(part => part.text || "")
    .join("")
    .trim();
  if (!answer) return { ok: false, error: "Gemini returned an empty answer. Try rephrasing the question." };
  return { ok: true, answer };
}

function chatSystemPrompt(language) {
  const languageRule = language === "en"
    ? "Always answer in English, regardless of the language of the question."
    : "Answer in the same language as the user's latest question. If the user asks you to answer in English (or another language), do so for the rest of the conversation.";
  return [
    "You are the PCTM (Pyeong-chon Toastmasters) club assistant.",
    "The attached PDF is your only knowledge source. Answer questions using only information from that PDF.",
    "If the PDF does not contain the answer, say so plainly instead of guessing or using outside knowledge.",
    "Keep answers concise and practical. Use short bullet lists when listing several items.",
    languageRule,
  ].join("\n");
}
