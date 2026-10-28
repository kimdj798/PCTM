// Same Apps Script Web App the dashboard uses for editing (see app.js).
const CHAT_ENDPOINT = "https://script.google.com/macros/s/AKfycbzruPJePcjaxL6ivZ-Mn7uaVkpRKx6ZNeBGPF1TEKJmy8zYE6BmAqNwRvVuqlzdo1_X/exec";
const CHAT_PASSWORD_KEY = "pctm_chat_password";
const CHAT_LANGUAGE_KEY = "pctm_chat_language";

const chatState = { messages: [], sending: false };

function storageGet(storage, key) {
  try { return storage.getItem(key); } catch { return null; }
}
function storageSet(storage, key, value) {
  try { value === null ? storage.removeItem(key) : storage.setItem(key, value); } catch { /* storage unavailable */ }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

// Minimal Markdown for Gemini answers: paragraphs, bullet/numbered lists,
// **bold**, *italic*, and `code`. Input is escaped before any markup is added.
function renderMarkdown(text) {
  const inline = line => escapeHtml(line)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  const html = [];
  let list = null;
  let paragraph = [];
  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${paragraph.map(inline).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) html.push(`<${list.tag}>${list.items.map(item => `<li>${inline(item)}</li>`).join("")}</${list.tag}>`);
    list = null;
  };
  text.split("\n").forEach(raw => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? "ul" : "ol";
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push((bullet || numbered)[1]);
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(heading ? `**${heading[1]}**` : line);
    }
  });
  flushParagraph();
  flushList();
  return html.join("");
}

async function callChat(body) {
  const response = await fetch(CHAT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "chat", ...body }),
  });
  const payload = await response.json().catch(() => ({ ok: false, error: "Invalid response from Apps Script." }));
  // An Apps Script deployment without chat support answers like a sheet edit.
  if (payload.ok && payload.updated !== undefined) {
    throw new Error("Apps Script is outdated — redeploy apps-script/Code.gs.");
  }
  if (!payload.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

function showUnlock(errorMessage) {
  document.getElementById("chatPanel").hidden = true;
  document.getElementById("chatUnlock").hidden = false;
  const error = document.getElementById("chatUnlockError");
  error.hidden = !errorMessage;
  error.textContent = errorMessage || "";
  document.getElementById("chatPassword").focus();
}

function showChat() {
  document.getElementById("chatUnlock").hidden = true;
  document.getElementById("chatPanel").hidden = false;
  document.getElementById("chatInput").focus();
}

function appendMessage(role, text) {
  const log = document.getElementById("chatLog");
  log.querySelector(".chat-empty")?.remove();
  const el = document.createElement("div");
  el.className = `chat-message ${role}`;
  if (role === "model") el.innerHTML = renderMarkdown(text);
  else el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

async function sendQuestion(question) {
  if (chatState.sending) return;
  chatState.sending = true;
  const sendButton = document.getElementById("chatSendButton");
  sendButton.disabled = true;

  chatState.messages.push({ role: "user", text: question });
  appendMessage("user", question);
  const pending = appendMessage("model pending", "Thinking…");

  try {
    const { answer } = await callChat({
      password: storageGet(sessionStorage, CHAT_PASSWORD_KEY) || "",
      language: document.getElementById("chatLanguage").value,
      messages: chatState.messages,
    });
    pending.remove();
    chatState.messages.push({ role: "model", text: answer });
    appendMessage("model", answer);
  } catch (error) {
    pending.remove();
    // Drop the unanswered question so the history stays user/model paired.
    chatState.messages.pop();
    if (/incorrect password/i.test(error.message)) {
      storageSet(sessionStorage, CHAT_PASSWORD_KEY, null);
      showUnlock("Password changed — please enter it again.");
    } else {
      appendMessage("error", error.message);
    }
  } finally {
    chatState.sending = false;
    sendButton.disabled = false;
  }
}

function resetChat() {
  chatState.messages = [];
  document.getElementById("chatLog").innerHTML = `
    <div class="chat-empty">
      <strong>Ask anything about the PCTM guide.</strong>
      <span>질문한 언어로 답변합니다. 영어 답변을 원하면 위에서 "English"를 선택하세요.</span>
    </div>`;
}

function initChat() {
  const languageSelect = document.getElementById("chatLanguage");
  languageSelect.value = storageGet(localStorage, CHAT_LANGUAGE_KEY) === "en" ? "en" : "auto";
  languageSelect.addEventListener("change", () => storageSet(localStorage, CHAT_LANGUAGE_KEY, languageSelect.value));

  document.getElementById("chatClearButton").addEventListener("click", resetChat);

  document.getElementById("chatUnlockForm").addEventListener("submit", async event => {
    event.preventDefault();
    const input = document.getElementById("chatPassword");
    const button = event.target.querySelector("button");
    button.disabled = true;
    try {
      await callChat({ password: input.value, verifyOnly: true });
      storageSet(sessionStorage, CHAT_PASSWORD_KEY, input.value);
      input.value = "";
      showChat();
    } catch (error) {
      showUnlock(error.message);
    } finally {
      button.disabled = false;
    }
  });

  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  form.addEventListener("submit", event => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    input.value = "";
    sendQuestion(question);
  });
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  if (storageGet(sessionStorage, CHAT_PASSWORD_KEY)) showChat();
  else showUnlock();
}

initChat();
