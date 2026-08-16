const state = { model: null, member: "all", meetingView: "coming", editing: false };
const SHEET_ID = "1MYHmvO0-doUTvsIXvErfydb1wke_tQ_vCrZOk2CorN4";
const SCHEDULE_GID = "1701553634";
const ROLES_GID = "1141924141";
const SHEET_SOURCE = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${SCHEDULE_GID}`;
const YEAR = 2026;

// Set this to your deployed Apps Script Web App URL (see README) to enable
// editing role assignments from the dashboard. Leave blank to disable editing.
const EDIT_ENDPOINT = "";
const EDIT_PASSWORD_KEY = "pctm_edit_password";

const MONTH_NAMES = { 1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "May", 6: "Jun", 7: "Jul", 8: "Aug", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dec" };
const KOREAN_MONTH_TO_NUM = { "1월": 1, "2월": 2, "3월": 3, "4월": 4, "5월": 5, "6월": 6, "7월": 7, "8월": 8, "9월": 9, "10월": 10, "11월": 11, "12월": 12 };
const PERSON_ROLE_LABELS = ["Toastmasters", "Table Topics Master", "Debate Master", "Quiz Master", "Evaluator #1", "Evaluator #2", "Grammarian", "Timer", "Ah-counter"];
const TEXT_ROLE_LABELS = new Set(["word of the day", "quote of the day"]);
const AGENDA_FALLBACK = [
  ["09:50", "Icebreaking", "Members & guests"],
  ["10:00", "Introduction", "Toastmasters"],
  ["10:05", "Table Topics Session", "Table Topics Master"],
  ["10:20", "Prepared Speech Session", "Speaker #1 & #2"],
  ["10:50", "Debate / Quiz Session", "Debate Master & Quiz Master"],
  ["11:10", "Break", "10 minutes"],
  ["11:20", "Evaluation Session", "Evaluator #1 & #2"],
  ["11:45", "Reports", "Grammarian, Timer, Ah-counter"],
  ["11:55", "Announcements", "Word & Quote of the day"],
  ["12:00", "Closing", "Toastmasters"],
];

async function fetchPublicSheets() {
  const base = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`;
  const stamp = Date.now();
  const [scheduleResponse, rolesResponse] = await Promise.all([
    fetch(`${base}?gid=${SCHEDULE_GID}&tqx=out%3Acsv&_=${stamp}`, { cache: "no-store" }),
    fetch(`${base}?gid=${ROLES_GID}&tqx=out%3Acsv&_=${stamp}`, { cache: "no-store" }),
  ]);
  if (!scheduleResponse.ok || !rolesResponse.ok) {
    throw new Error(`Google Sheets returned ${scheduleResponse.status}/${rolesResponse.status}`);
  }
  return {
    scheduleCsv: await scheduleResponse.text(),
    rolesCsv: await rolesResponse.text(),
    fetchedAt: new Date().toISOString(),
    source: SHEET_SOURCE,
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [], value = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { value += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(value); value = ""; }
    else if (char === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
    else value += char;
  }
  if (value || row.length) { row.push(value.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

function clean(value) { return String(value ?? "").trim(); }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function setText(id, value) { document.getElementById(id).textContent = value; }
function countBy(items, keyFn) {
  return items.reduce((map, item) => map.set(keyFn(item), (map.get(keyFn(item)) || 0) + 1), new Map());
}
function todayKst(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return new Date(`${map.year}-${map.month}-${map.day}T00:00:00+09:00`);
}
function formatDate(date, options = {}) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", ...options }).format(date);
}
function weekOfMonth(day) { return Math.ceil(day / 7); }
function parseMonthDay(text, year) {
  const cleaned = clean(text).replace(/\./g, "");
  if (!cleaned) return null;
  const parsed = new Date(`${cleaned} ${year} 00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// ---- Speech pipeline (main schedule tab) ----

function buildScheduleModel(rows) {
  const notesRaw = clean(rows[0]?.[0]);
  const notesLines = notesRaw.split("\n").map(clean).filter(Boolean);
  const description = notesLines[0] || "";
  const notices = notesLines.slice(1);

  const monthRow = rows[1] || [];
  const weekRow = rows[2] || [];
  const weekColumns = [];
  let currentMonth = "";
  for (let col = 2; col < weekRow.length; col += 1) {
    const monthLabel = clean(monthRow[col]);
    if (monthLabel) currentMonth = monthLabel;
    const weekLabel = clean(weekRow[col]);
    const monthNum = KOREAN_MONTH_TO_NUM[currentMonth];
    const weekNum = parseInt(weekLabel, 10);
    if (!monthNum || !weekNum) continue;
    weekColumns.push({ col, monthNum, weekNum, label: `${MONTH_NAMES[monthNum]} · Week ${weekNum}` });
  }

  const today = todayKst();
  const todayMonth = today.getMonth() + 1;
  const todayWeek = weekOfMonth(today.getDate());
  const isCompleted = wc => wc.monthNum < todayMonth || (wc.monthNum === todayMonth && wc.weekNum < todayWeek);
  const isCurrent = wc => wc.monthNum === todayMonth && wc.weekNum === todayWeek;

  const members = [];
  const speeches = [];
  for (let r = 3; r + 2 < rows.length; r += 3) {
    const nameRow = rows[r] || [];
    const projectRow = rows[r + 1] || [];
    const titleRow = rows[r + 2] || [];
    const name = clean(nameRow[0]);
    if (!name) continue;
    const memberSpeeches = [];
    weekColumns.forEach(wc => {
      const planMark = clean(nameRow[wc.col]);
      const project = clean(projectRow[wc.col]);
      const title = clean(titleRow[wc.col]);
      if (!planMark && !project && !title) return;
      const speech = {
        member: name, monthNum: wc.monthNum, weekNum: wc.weekNum, label: wc.label,
        project, title: title || "Untitled speech", planned: Boolean(planMark),
        completed: isCompleted(wc), current: isCurrent(wc),
      };
      memberSpeeches.push(speech);
      speeches.push(speech);
    });
    members.push({ name, speeches: memberSpeeches });
  }

  speeches.sort((a, b) => (a.monthNum - b.monthNum) || (a.weekNum - b.weekNum));
  return { description, notices, weekColumns, members, speeches };
}

// ---- Meeting roles tab ----

function buildRolesModel(rows) {
  const header = rows[0] || [];
  const dataRows = rows.slice(1);
  const fields = [];
  let i = 0;
  while (i < dataRows.length) {
    const label = clean(dataRows[i]?.[0]);
    if (!label) { i += 1; continue; }
    if (/^Speaker\s*#?\d+/i.test(label)) {
      fields.push({
        type: "speaker", label,
        memberRow: dataRows[i], titleRow: dataRows[i + 1] || [], pathwaysRow: dataRows[i + 2] || [], projectRow: dataRows[i + 3] || [],
        memberSheetRow: i + 2, titleSheetRow: i + 3, pathwaysSheetRow: i + 4, projectSheetRow: i + 5,
      });
      i += 4;
      continue;
    }
    if (TEXT_ROLE_LABELS.has(label.toLowerCase())) {
      fields.push({ type: "text", label, row: dataRows[i], sheetRow: i + 2 });
      i += 1;
      continue;
    }
    fields.push({ type: "person", label, row: dataRows[i], sheetRow: i + 2 });
    i += 1;
  }

  const meetings = [];
  for (let col = 1; col < header.length; col += 1) {
    const label = clean(header[col]);
    if (!label) continue;
    const date = parseMonthDay(label, YEAR);
    const roles = [];
    const speakers = [];
    let filled = 0, total = 0;
    const sheetCol = col + 1;
    fields.forEach(field => {
      if (field.type === "person") {
        total += 1;
        const member = clean(field.row[col]);
        if (member) filled += 1;
        roles.push({ label: field.label.trim(), member, isText: false, sheetRow: field.sheetRow, sheetCol });
      } else if (field.type === "text") {
        total += 1;
        const value = clean(field.row[col]);
        if (value) filled += 1;
        roles.push({ label: field.label.trim(), value, isText: true, sheetRow: field.sheetRow, sheetCol });
      } else {
        const member = clean(field.memberRow[col]);
        const title = clean(field.titleRow[col]);
        const pathways = clean(field.pathwaysRow[col]);
        const project = clean(field.projectRow[col]);
        total += 4;
        filled += [member, title, pathways, project].filter(Boolean).length;
        speakers.push({
          label: field.label.trim(), member, title, pathways, project, sheetCol,
          memberSheetRow: field.memberSheetRow, titleSheetRow: field.titleSheetRow,
          pathwaysSheetRow: field.pathwaysSheetRow, projectSheetRow: field.projectSheetRow,
        });
      }
    });
    meetings.push({ col, label, date, roles, speakers, filled, total });
  }

  const today = todayKst();
  meetings.sort((a, b) => (a.date || 0) - (b.date || 0));
  const past = [...meetings].filter(m => m.date && m.date < today).at(-1) || null;
  const upcoming = meetings.filter(m => m.date && m.date >= today);
  const coming = upcoming[0] || null;
  const next = upcoming[1] || null;
  return { meetings, pastMeeting: past, comingMeeting: coming, nextMeeting: next };
}

function missingFields(meeting) {
  const missing = [];
  meeting.roles.forEach(r => { if (!(r.isText ? r.value : r.member)) missing.push(r.label); });
  meeting.speakers.forEach(s => {
    if (!s.member) missing.push(`${s.label} — Speaker`);
    if (!s.title) missing.push(`${s.label} — Title`);
    if (!s.pathways) missing.push(`${s.label} — Pathway`);
    if (!s.project) missing.push(`${s.label} — Project`);
  });
  return missing;
}

// ---- Editing (writes back to the Sheet via Apps Script) ----

function editingAvailable() { return Boolean(EDIT_ENDPOINT); }
function editingUnlocked() { return Boolean(sessionStorage.getItem(EDIT_PASSWORD_KEY)); }

async function saveCell(row, col, value) {
  const password = sessionStorage.getItem(EDIT_PASSWORD_KEY) || "";
  const response = await fetch(EDIT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ password, updates: [{ row, col, value }] }),
  });
  const payload = await response.json().catch(() => ({ ok: false, error: "Invalid response from Apps Script." }));
  if (!payload.ok) throw new Error(payload.error || "Save failed.");
  return payload;
}

function unlockEditing() {
  const dialog = document.getElementById("editUnlockDialog");
  document.getElementById("editUnlockError").hidden = true;
  document.getElementById("editUnlockPassword").value = "";
  dialog.showModal();
}

function lockEditing() {
  sessionStorage.removeItem(EDIT_PASSWORD_KEY);
  state.editing = false;
  updateEditToggle();
  if (state.model) renderMeeting(state.model);
}

function updateEditToggle() {
  const button = document.getElementById("editToggleButton");
  if (!button) return;
  button.hidden = !editingAvailable();
  const unlocked = editingUnlocked();
  button.textContent = unlocked ? "Lock editing" : "Edit roles";
  button.classList.toggle("is-active", unlocked);
}

function makeEditableField(currentValue, { row, col, placeholder = "Pending", onSaved }) {
  const wrap = document.createElement("div");
  wrap.className = "editable-field";
  const input = document.createElement("input");
  input.type = "text";
  input.value = currentValue || "";
  input.placeholder = placeholder;
  const status = document.createElement("span");
  status.className = "editable-status";
  wrap.appendChild(input);
  wrap.appendChild(status);

  let saving = false;
  const commit = async () => {
    const next = input.value.trim();
    if (next === (currentValue || "") || saving) return;
    saving = true;
    status.textContent = "Saving…";
    status.className = "editable-status saving";
    try {
      await saveCell(row, col, next);
      currentValue = next;
      status.textContent = "Saved";
      status.className = "editable-status saved";
      if (onSaved) onSaved(next);
    } catch (error) {
      status.textContent = error.message || "Save failed";
      status.className = "editable-status error";
    } finally {
      saving = false;
    }
  };
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); input.blur(); }
  });
  return wrap;
}

// ---- Tooltip helpers ----

function addTooltip(element, content) {
  element.dataset.tooltip = content;
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    element.addEventListener("mouseenter", showTooltip);
    element.addEventListener("mousemove", moveTooltip);
    element.addEventListener("mouseleave", hideTooltip);
    element.addEventListener("focus", showTooltip);
    element.addEventListener("blur", hideTooltip);
  }
  element.tabIndex = 0;
}
function showTooltip(event) {
  const tooltip = document.getElementById("tooltip");
  tooltip.textContent = event.currentTarget.dataset.tooltip;
  tooltip.classList.add("visible"); tooltip.setAttribute("aria-hidden", "false"); moveTooltip(event);
}
function moveTooltip(event) {
  const tooltip = document.getElementById("tooltip");
  const x = Math.min((event.clientX || 20) + 14, window.innerWidth - tooltip.offsetWidth - 12);
  const y = Math.min((event.clientY || 20) + 14, window.innerHeight - tooltip.offsetHeight - 12);
  tooltip.style.left = `${Math.max(8, x)}px`; tooltip.style.top = `${Math.max(8, y)}px`;
}
function hideTooltip() {
  const tooltip = document.getElementById("tooltip");
  tooltip.classList.remove("visible");
  tooltip.setAttribute("aria-hidden", "true");
  tooltip.style.left = ""; tooltip.style.top = "";
}

// ---- Tabs ----

function pickDefaultTab(rolesModel) {
  if (rolesModel.comingMeeting) return "coming";
  if (rolesModel.nextMeeting) return "next";
  if (rolesModel.pastMeeting) return "past";
  return "coming";
}
function setActiveTab(tabName, scrollToTop = true) {
  const validTabs = new Set(["past", "coming", "next"]);
  const activeTab = validTabs.has(tabName) ? tabName : "coming";
  state.meetingView = activeTab;
  document.querySelectorAll("[data-dashboard-tab]").forEach(button => {
    button.setAttribute("aria-selected", String(button.dataset.dashboardTab === activeTab));
  });
  if (state.model) renderMeeting(state.model);
  if (scrollToTop) document.getElementById("this-meeting").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---- Rendering: meeting / roles ----

function renderMeetingReadiness(meeting) {
  const missing = missingFields(meeting);
  const percentage = meeting.total ? Math.round((meeting.filled / meeting.total) * 100) : 0;
  const tone = percentage === 100 ? "ready" : percentage >= 60 ? "almost-ready" : "needs-attention";
  const status = percentage === 100 ? "Ready" : percentage >= 60 ? "Almost ready" : "Needs attention";
  const container = document.getElementById("meetingReadiness");
  container.className = `meeting-readiness ${tone}`;
  setText("readinessStatus", status);
  setText("readinessScore", `${percentage}% (${meeting.filled}/${meeting.total})`);
  const missingElement = document.getElementById("readinessMissing");
  if (missing.length) {
    const visible = missing.slice(0, 3);
    const remaining = missing.length - visible.length;
    missingElement.textContent = `Missing ${missing.length}: ${visible.join(", ")}${remaining ? ` +${remaining} more` : ""}`;
    container.setAttribute("aria-disabled", "false");
    container.tabIndex = 0;
    document.getElementById("missingDialogSummary").textContent = `${missing.length} of ${meeting.total} required fields still need information.`;
    document.getElementById("missingDialogList").innerHTML = missing.map(item => `<li>${escapeHtml(item)}</li>`).join("");
  } else {
    missingElement.textContent = "All required fields are complete.";
    container.setAttribute("aria-disabled", "true");
    container.tabIndex = -1;
    document.getElementById("missingDialogSummary").textContent = "All required fields are complete.";
    document.getElementById("missingDialogList").innerHTML = "";
  }
  container.querySelector(".readiness-track").setAttribute("aria-valuenow", String(percentage));
  document.getElementById("readinessBar").style.width = `${percentage}%`;
}

function detailedAgenda(meeting) {
  const roleMember = label => meeting.roles.find(r => r.label === label)?.member || "Pending";
  const speakerRows = meeting.speakers.map(s => [s.project || "Pending", s.title || "Pending", s.member || "Pending", s.pathways || "Pending"]);
  return [
    { time: "09:50", title: "Icebreaking", owner: "Members & guests", bullets: [] },
    { time: "10:00", title: "Introduction", owner: roleMember("Toastmasters"), bullets: ["Welcome & mission statement"] },
    {
      time: "10:20", title: "Prepared Speech Session", owner: roleMember("Toastmasters"),
      table: { headers: ["Project", "Speech Title", "Speaker", "Pathway"], rows: speakerRows.length ? speakerRows : [["Pending", "Pending", "Pending", "Pending"]] },
    },
    {
      time: "10:50", title: "Table Topics & Debate", owner: `${roleMember("Table Topics Master")} / ${roleMember("Debate Master")}`,
      bullets: ["Impromptu speaking", "Debate round"],
    },
    { time: "11:10", title: "Break", owner: "", bullets: ["10 minutes"] },
    {
      time: "11:20", title: "Evaluation Session", owner: `${roleMember("Evaluator #1")} / ${roleMember("Evaluator #2")}`,
      table: {
        headers: ["Report", "Person"],
        rows: [
          ["Grammarian", roleMember("Grammarian")],
          ["Timer", roleMember("Timer")],
          ["Ah-counter", roleMember("Ah-counter")],
          ["Quiz Master", roleMember("Quiz Master")],
        ],
      },
    },
    {
      time: "11:55", title: "Announcements", owner: roleMember("Toastmasters"),
      bullets: [`Word of the day: ${meeting.roles.find(r => r.label === "word of the day")?.value || "Pending"}`, `Quote of the day: ${meeting.roles.find(r => r.label === "quote of the day")?.value || "Pending"}`],
    },
    { time: "12:00", title: "Closing", owner: roleMember("Toastmasters"), bullets: ["Next meeting sign-up"] },
  ];
}
function renderAgenda(meeting) {
  const items = meeting ? detailedAgenda(meeting) : AGENDA_FALLBACK.map(([time, title, owner]) => ({ time, title, owner, bullets: [] }));
  return items.map(item => {
    const owner = item.owner ? ` <span class="agenda-owner">(${escapeHtml(item.owner)})</span>` : "";
    const bullets = item.bullets?.length ? `<ul class="agenda-bullets">${item.bullets.map(b => `<li>${escapeHtml(b)}</li>`).join("")}</ul>` : "";
    const table = item.table
      ? `<div class="agenda-table-wrap"><table class="agenda-table"><thead><tr>${item.table.headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${item.table.rows.map(row => `<tr>${row.map(v => `<td class="${v === "Pending" ? "pending" : ""}">${escapeHtml(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
      : "";
    return `<section class="agenda-detail-item"><div class="agenda-detail-heading"><time>${escapeHtml(item.time)}</time><h4>${escapeHtml(item.title)}${owner}</h4></div>${bullets}${table}</section>`;
  }).join("");
}

function renderMeeting(model) {
  const meetingsByView = { past: model.roles.pastMeeting, coming: model.roles.comingMeeting, next: model.roles.nextMeeting };
  const meeting = meetingsByView[state.meetingView];

  if (!meeting) {
    setText("meetingTitle", "No Scheduled Meeting");
    const readiness = document.getElementById("meetingReadiness");
    readiness.className = "meeting-readiness needs-attention";
    readiness.setAttribute("aria-disabled", "true");
    readiness.tabIndex = -1;
    setText("readinessStatus", "Needs attention");
    setText("readinessScore", "0% (0/19)");
    setText("readinessMissing", "No meeting is scheduled in this view yet.");
    readiness.querySelector(".readiness-track").setAttribute("aria-valuenow", "0");
    document.getElementById("readinessBar").style.width = "0%";
    document.getElementById("weekAssignments").innerHTML = `<div class="empty-state">Add a column to the 2026 tab to populate this meeting.</div>`;
    document.getElementById("weekSpeeches").innerHTML = `<div class="empty-state">No prepared speeches assigned yet.</div>`;
    document.getElementById("agendaTimeline").innerHTML = renderAgenda(null);
    return;
  }

  setText("meetingTitle", meeting.date ? `${formatDate(meeting.date)} Meeting` : `${meeting.label} Meeting`);
  renderMeetingReadiness(meeting);
  renderWeekAssignments(meeting);
  renderWeekSpeeches(meeting);
  document.getElementById("agendaTimeline").innerHTML = renderAgenda(meeting);
}

function recomputeReadiness(meeting) {
  let filled = 0;
  meeting.roles.forEach(r => { if (r.isText ? r.value : r.member) filled += 1; });
  meeting.speakers.forEach(s => { filled += [s.member, s.title, s.pathways, s.project].filter(Boolean).length; });
  meeting.filled = filled;
  renderMeetingReadiness(meeting);
}

function renderWeekAssignments(meeting) {
  const container = document.getElementById("weekAssignments");
  container.innerHTML = "";
  const editing = editingAvailable() && editingUnlocked();
  meeting.roles.forEach(r => {
    const cell = document.createElement("div");
    const value = r.isText ? r.value : r.member;
    cell.className = `assignment ${value ? "" : "pending"}`;
    const label = document.createElement("span");
    label.textContent = r.label;
    cell.appendChild(label);
    if (editing) {
      cell.appendChild(makeEditableField(value, {
        row: r.sheetRow, col: r.sheetCol,
        onSaved: next => {
          if (r.isText) r.value = next; else r.member = next;
          cell.classList.toggle("pending", !next);
          recomputeReadiness(meeting);
        },
      }));
    } else {
      const strong = document.createElement("strong");
      strong.textContent = value || "Pending";
      cell.appendChild(strong);
    }
    container.appendChild(cell);
  });
}

function renderWeekSpeeches(meeting) {
  const container = document.getElementById("weekSpeeches");
  container.innerHTML = "";
  if (!meeting.speakers.length) {
    container.innerHTML = `<div class="empty-state">No speakers assigned yet.</div>`;
    return;
  }
  const editing = editingAvailable() && editingUnlocked();
  meeting.speakers.forEach(s => {
    const card = document.createElement("article");
    card.className = `week-speech ${(!s.member || !s.title) ? "pending" : ""}`;
    if (editing) {
      const heading = document.createElement("span");
      heading.className = "speaker";
      heading.textContent = s.label;
      card.appendChild(heading);
      const fieldSpecs = [
        ["Speaker", "member", s.memberSheetRow],
        ["Title", "title", s.titleSheetRow],
        ["Pathway", "pathways", s.pathwaysSheetRow],
        ["Project", "project", s.projectSheetRow],
      ];
      fieldSpecs.forEach(([fieldLabel, key, row]) => {
        const row_ = document.createElement("label");
        row_.className = "speech-edit-row";
        const span = document.createElement("span");
        span.textContent = fieldLabel;
        row_.appendChild(span);
        row_.appendChild(makeEditableField(s[key], {
          row, col: s.sheetCol,
          onSaved: next => {
            s[key] = next;
            card.classList.toggle("pending", !s.member || !s.title);
            recomputeReadiness(meeting);
          },
        }));
        card.appendChild(row_);
      });
    } else {
      card.setAttribute("role", "button");
      card.tabIndex = 0;
      card.setAttribute("aria-haspopup", "dialog");
      card.innerHTML = `
        <span class="speaker">${escapeHtml(s.label)} · ${escapeHtml(s.member || "Pending")}</span>
        <h4>${escapeHtml(s.title || "Title Pending")}</h4>
        <p>${escapeHtml(s.pathways ? `Pathway · ${s.pathways}` : "Pathway · Pending")}</p>`;
      const openDetails = () => showSpeechDetails(s);
      card.addEventListener("click", openDetails);
      card.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDetails(); } });
    }
    container.appendChild(card);
  });
}

function showSpeechDetails(speech) {
  hideTooltip();
  setText("speechDialogTitle", speech.title || "Title Pending");
  document.getElementById("speechDialogDetails").innerHTML = [
    ["Speaker", speech.member || speech.speaker],
    ["Project", speech.project || "Pending"],
    ["Pathway", speech.pathways || "Pending"],
  ].filter(([, v]) => v !== undefined).map(([label, value]) => `<div class="speech-detail-item ${!value || value === "Pending" ? "pending" : ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Pending")}</strong></div>`).join("");
  document.getElementById("speechDetailsDialog").showModal();
}

// ---- Rendering: speech pipeline ----

function filteredSpeeches(model) {
  return state.member === "all" ? model.schedule.speeches : model.schedule.speeches.filter(s => s.member === state.member);
}

function renderFilters(model) {
  const select = document.getElementById("memberFilter");
  const members = [...model.schedule.members].sort((a, b) => a.name.localeCompare(b.name));
  select.innerHTML = `<option value="all">All members</option>${members.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join("")}`;
  select.value = state.member;
}

function renderMemberChart(model) {
  const speeches = filteredSpeeches(model);
  const counts = countBy(speeches, s => s.member);
  const bars = model.schedule.members
    .map(m => ({ name: m.name, count: counts.get(m.name) || 0, items: m.speeches.filter(s => state.member === "all" || s.member === state.member) }))
    .filter(m => m.count || state.member === m.name)
    .sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...bars.map(b => b.count));
  const chart = document.getElementById("memberChart");
  chart.innerHTML = bars.length ? bars.map(b => `
    <div class="bar-row">
      <span class="bar-label">${escapeHtml(b.name)}</span>
      <div class="bar-track" data-member="${escapeHtml(b.name)}"><div class="bar-fill" style="--width:${(b.count / max * 100).toFixed(1)}%"></div></div>
      <span class="bar-value">${b.count}</span>
    </div>`).join("") : `<div class="empty-state">No speeches scheduled for this selection.</div>`;
  chart.querySelectorAll(".bar-track").forEach(el => {
    const items = bars.find(b => b.name === el.dataset.member)?.items || [];
    addTooltip(el, `${el.dataset.member} · ${items.length} speech${items.length === 1 ? "" : "es"}\n${items.slice(0, 8).map(s => `${s.label} · ${s.title}`).join("\n")}`);
  });
}

function renderMemberTable(model) {
  const ranked = model.schedule.members.map(member => ({
    name: member.name,
    total: member.speeches.length,
    upcoming: member.speeches.filter(s => !s.completed).length,
    delivered: member.speeches.filter(s => s.completed).length,
  })).filter(m => m.total).sort((a, b) => b.total - a.total);
  document.getElementById("memberTable").innerHTML = ranked.map(m => `
    <tr data-member="${escapeHtml(m.name)}" class="${state.member === m.name ? "active" : ""}">
      <td><strong>${escapeHtml(m.name)}</strong></td><td>${m.total}</td><td>${m.upcoming}</td><td>${m.delivered}</td>
    </tr>`).join("") || `<tr><td colspan="4" class="empty-state">No members in the pipeline yet.</td></tr>`;
  document.querySelectorAll("#memberTable tr[data-member]").forEach(row => row.addEventListener("click", () => {
    state.member = state.member === row.dataset.member ? "all" : row.dataset.member;
    document.getElementById("memberFilter").value = state.member;
    renderPipeline(model);
  }));
  setText("pipelineScopeLabel", state.member === "all" ? "All members" : state.member);
}

function renderTimeline(model) {
  const speeches = filteredSpeeches(model);
  setText("timelineCount", `${speeches.length} speech${speeches.length === 1 ? "" : "es"}`);
  const byMonth = new Map();
  speeches.forEach(s => { if (!byMonth.has(s.monthNum)) byMonth.set(s.monthNum, []); byMonth.get(s.monthNum).push(s); });
  const months = [...byMonth.keys()].sort((a, b) => a - b);
  const container = document.getElementById("speechTimeline");
  container.innerHTML = months.length ? months.map(monthNum => `
    <div class="timeline-month" data-month="${monthNum}">
      <div class="timeline-month-label"><span class="month-dot"></span>${MONTH_NAMES[monthNum]}</div>
      <div class="timeline-cards">
        ${byMonth.get(monthNum).map(s => `
          <article class="speech-card ${s.completed ? "is-delivered" : ""} ${s.current ? "is-current" : ""}" data-month="${monthNum}">
            <time>${escapeHtml(s.label)}${s.current ? " · This week" : ""}</time>
            <h4>${escapeHtml(s.title)}</h4>
            <p>${escapeHtml(s.member)}</p>
          </article>`).join("")}
      </div>
    </div>`).join("") : `<div class="empty-state">No speeches scheduled for this selection.</div>`;
  let cursor = 0;
  months.forEach(monthNum => {
    byMonth.get(monthNum).forEach(speech => {
      const card = container.querySelectorAll(".speech-card")[cursor];
      addTooltip(card, `${speech.member} · ${speech.title}\nProject: ${speech.project || "—"}\n${speech.completed ? "Delivered" : "Upcoming"} · ${speech.label}`);
      cursor += 1;
    });
  });
}

function renderPipeline(model) {
  renderMemberChart(model);
  renderMemberTable(model);
  renderTimeline(model);
}

// ---- Top-level render ----

function renderNotices(model) {
  const row = document.getElementById("noticeRow");
  row.innerHTML = model.schedule.notices.map(n => `<span class="notice-chip">${escapeHtml(n)}</span>`).join("");
}

function render(model, meta) {
  setText("asOfDate", formatDate(todayKst(), { year: "numeric" }));

  const completed = model.schedule.speeches.filter(s => s.completed).length;
  const upcoming = model.schedule.speeches.filter(s => !s.completed).length;
  const speakers = new Set(model.schedule.speeches.map(s => s.member)).size;
  setText("metricCompleted", completed);
  setText("metricUpcoming", upcoming);
  setText("metricSpeakers", speakers);
  setText("metricMeetings", model.roles.meetings.length);

  renderNotices(model);
  renderFilters(model);
  renderPipeline(model);

  if (!document.body.dataset.tabInitialized) {
    setActiveTab(pickDefaultTab(model.roles), false);
    document.body.dataset.tabInitialized = "true";
  } else {
    renderMeeting(model);
  }

  const syncedAt = new Date(meta.fetchedAt);
  setText("lastSync", `Last synced ${syncedAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`);
}

async function loadData(force = false) {
  const banner = document.getElementById("statusBanner");
  banner.textContent = force ? "Refreshing from Google Sheets…" : "Loading the latest data from Google Sheets.";
  banner.classList.remove("error");
  banner.hidden = false;
  try {
    const meta = await fetchPublicSheets();
    const schedule = buildScheduleModel(parseCsv(meta.scheduleCsv));
    const roles = buildRolesModel(parseCsv(meta.rolesCsv));
    state.model = { schedule, roles };
    render(state.model, meta);
    banner.hidden = true;
  } catch (error) {
    banner.textContent = `Could not load the Google Sheet: ${error.message}`;
    banner.classList.add("error");
    banner.hidden = false;
  }
}

function bindEvents() {
  document.getElementById("refreshButton").addEventListener("click", () => loadData(true));
  document.querySelectorAll("[data-dashboard-tab]").forEach(button => {
    button.addEventListener("click", () => setActiveTab(button.dataset.dashboardTab));
  });
  document.getElementById("memberFilter").addEventListener("change", event => {
    state.member = event.target.value;
    if (state.model) renderPipeline(state.model);
  });
  document.getElementById("meetingReadiness").addEventListener("click", event => {
    if (event.currentTarget.getAttribute("aria-disabled") === "true") return;
    document.getElementById("missingDetailsDialog").showModal();
  });
  document.getElementById("meetingReadiness").addEventListener("keydown", event => {
    if ((event.key === "Enter" || event.key === " ") && event.currentTarget.getAttribute("aria-disabled") !== "true") {
      event.preventDefault();
      document.getElementById("missingDetailsDialog").showModal();
    }
  });
  document.getElementById("closeMissingDialog").addEventListener("click", () => document.getElementById("missingDetailsDialog").close());
  document.getElementById("closeSpeechDialog").addEventListener("click", () => document.getElementById("speechDetailsDialog").close());

  document.getElementById("editToggleButton").addEventListener("click", () => {
    if (editingUnlocked()) lockEditing();
    else unlockEditing();
  });
  document.getElementById("closeEditUnlockDialog").addEventListener("click", () => document.getElementById("editUnlockDialog").close());
  document.getElementById("editUnlockForm").addEventListener("submit", async event => {
    event.preventDefault();
    const password = document.getElementById("editUnlockPassword").value;
    const errorEl = document.getElementById("editUnlockError");
    const submitButton = event.currentTarget.querySelector("button[type=submit]");
    submitButton.disabled = true;
    errorEl.hidden = true;
    try {
      const response = await fetch(EDIT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ password, updates: [] }),
      });
      const payload = await response.json().catch(() => ({ ok: false }));
      if (!payload.ok) throw new Error(payload.error || "Incorrect password.");
      sessionStorage.setItem(EDIT_PASSWORD_KEY, password);
      state.editing = true;
      document.getElementById("editUnlockDialog").close();
      updateEditToggle();
      if (state.model) renderMeeting(state.model);
    } catch (error) {
      errorEl.textContent = error.message || "Could not verify password.";
      errorEl.hidden = false;
    } finally {
      submitButton.disabled = false;
    }
  });
}

bindEvents();
updateEditToggle();
loadData(false);
