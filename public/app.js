const state = { model: null, member: "all", meetingView: "coming", editing: false, currentMeeting: null, pendingAfterUnlock: null };
const SHEET_ID = "1MYHmvO0-doUTvsIXvErfydb1wke_tQ_vCrZOk2CorN4";
const SCHEDULE_GID = "1701553634";
const ROLES_GID = "1141924141";
const OFFICERS_GID = "2126938942";
const SHEET_SOURCE = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${SCHEDULE_GID}`;
const DASHBOARD_URL = "https://kimdj798.github.io/PCTM/";
const YEAR = 2026;

// Set this to your deployed Apps Script Web App URL (see README) to enable
// editing role assignments from the dashboard. Leave blank to disable editing.
const EDIT_ENDPOINT = "https://script.google.com/macros/s/AKfycbwlBDUQt8kDJT4ngzlqmjF6by31Y5Pm2iX_bfq3RRNeNKW45CVNav5atwlbF1i8QoBF/exec";
const EDIT_PASSWORD_KEY = "pctm_edit_password";

const MONTH_NAMES = { 1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "May", 6: "Jun", 7: "Jul", 8: "Aug", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dec" };
const KOREAN_MONTH_TO_NUM = { "1월": 1, "2월": 2, "3월": 3, "4월": 4, "5월": 5, "6월": 6, "7월": 7, "8월": 8, "9월": 9, "10월": 10, "11월": 11, "12월": 12 };
const TEXT_ROLE_LABELS = new Set(["word of the day", "quote of the day"]);
const META_ROLE_LABELS = new Set(["theme", "tq", "cancelled"]);
// PCTM's standard meeting agenda template (Time / Segment / Role taker),
// matching the club's printed agenda sheet exactly.
const AGENDA_BLOCKS = [
  { time: "10:00", rows: [["Opening", "Chairperson"]] },
  { time: "10:10", highlight: true, rows: [["Theme Talk", "Toastmasters"]] },
  {
    time: "10:40",
    rows: [
      ["Program Introduction", "Toastmasters"],
      ["Role takers introduction", "Toastmasters"],
      ["Grammarian", "Grammarian"],
      ["Timer", "Timer"],
    ],
  },
  {
    time: "10:45",
    highlight: true,
    rows: [
      ["Prepared Speech", "Toastmasters"],
      ["Evaluator's speech introduction", "Evaluator"],
      ["Introduce Speaker (N-T-T-N)", "Speaker"],
      ["Written feedback", ""],
      ["Timer's report", ""],
    ],
  },
  {
    time: "11:10",
    highlight: true,
    rows: [
      ["Table Topics", "Topics master"],
      ["Provide questions to 5~6 speakers", ""],
      ["Timer's report", ""],
      ["Vote for the best speaker", ""],
    ],
  },
  { time: "11:10", highlight: true, rows: [["Debate (10 + 10)", "Debate Master"]] },
  {
    time: "11:30",
    highlight: true,
    rows: [
      ["Speech Evaluation", "Evaluator"],
      ["Speech evaluation", ""],
    ],
  },
  {
    time: "11:40",
    highlight: true,
    rows: [
      ["Evaluation", "Toastmasters"],
      ["Timer's report", "Timer"],
      ["Grammarian's report", "Grammarian"],
      ["Quiz session", "Quiz master"],
      ["Closing", "Chairperson"],
    ],
  },
  { time: "11:50", rows: [["Club Business", "Chairperson"]] },
];

async function fetchPublicSheets() {
  const base = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`;
  const stamp = Date.now();
  const [scheduleResponse, rolesResponse, officersResponse] = await Promise.all([
    fetch(`${base}?gid=${SCHEDULE_GID}&tqx=out%3Acsv&_=${stamp}`, { cache: "no-store" }),
    fetch(`${base}?gid=${ROLES_GID}&tqx=out%3Acsv&_=${stamp}`, { cache: "no-store" }),
    fetch(`${base}?gid=${OFFICERS_GID}&tqx=out%3Acsv&_=${stamp}`, { cache: "no-store" }),
  ]);
  if (!scheduleResponse.ok || !rolesResponse.ok || !officersResponse.ok) {
    throw new Error(`Google Sheets returned ${scheduleResponse.status}/${rolesResponse.status}/${officersResponse.status}`);
  }
  return {
    scheduleCsv: await scheduleResponse.text(),
    rolesCsv: await rolesResponse.text(),
    officersCsv: await officersResponse.text(),
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
  const isCurrent = wc => wc.monthNum === todayMonth && wc.weekNum === todayWeek;
  // 계획 mark: △ (or blank) = not delivered yet, ○ (or "O") = delivered.
  // Accept any common "circle" character/emoji people might type as a
  // stand-in for ○, plus the plain letter O/o.
  const isDeliveredMark = mark => /^[○◯⚪〇⭕Oo]$/.test(mark.trim());

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
        completed: isDeliveredMark(planMark), current: isCurrent(wc),
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
    if (META_ROLE_LABELS.has(label.toLowerCase())) {
      fields.push({ type: "meta", key: label.toLowerCase(), row: dataRows[i], sheetRow: i + 2 });
      i += 1;
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
    let theme = "", tq = [], cancelled = "", themeSheetRow = null, tqSheetRow = null, cancelledSheetRow = null;
    let filled = 0, total = 0;
    const sheetCol = col + 1;
    fields.forEach(field => {
      if (field.type === "meta") {
        const value = clean(field.row[col]);
        if (field.key === "theme") { theme = value; themeSheetRow = field.sheetRow; }
        else if (field.key === "tq") { tq = value.split("\n").map(clean).filter(Boolean); tqSheetRow = field.sheetRow; }
        else if (field.key === "cancelled") { cancelled = value; cancelledSheetRow = field.sheetRow; }
      } else if (field.type === "person") {
        total += 1;
        const member = clean(field.row[col]);
        if (member) filled += 1;
        roles.push({ label: field.label.trim(), member, isText: false, sheetRow: field.sheetRow, sheetCol });
      } else if (field.type === "text") {
        // word of the day / quote of the day: tracked but not required for readiness.
        const value = clean(field.row[col]);
        roles.push({ label: field.label.trim(), value, isText: true, sheetRow: field.sheetRow, sheetCol });
      } else {
        // Speaker names are shown in Role assignments (and count toward
        // readiness); title/pathway/project stay Prepared-speeches-only.
        const member = clean(field.memberRow[col]);
        const title = clean(field.titleRow[col]);
        const pathways = clean(field.pathwaysRow[col]);
        const project = clean(field.projectRow[col]);
        total += 1;
        if (member) filled += 1;
        speakers.push({
          label: field.label.trim(), member, title, pathways, project, sheetCol,
          memberSheetRow: field.memberSheetRow, titleSheetRow: field.titleSheetRow,
          pathwaysSheetRow: field.pathwaysSheetRow, projectSheetRow: field.projectSheetRow,
        });
      }
    });
    meetings.push({
      col, label, date, roles, speakers, theme, tq, cancelled,
      themeSheetRow, tqSheetRow, cancelledSheetRow, sheetCol, filled, total,
    });
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
  const roleMissing = meeting.roles.filter(r => !r.isText && !r.member).map(r => r.label);
  const speakerMissing = meeting.speakers.filter(s => !s.member).map(s => s.label);
  return [...roleMissing, ...speakerMissing];
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
  const passwordInput = document.getElementById("editUnlockPassword");
  passwordInput.value = "";
  dialog.showModal();
  passwordInput.focus();
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
  button.textContent = state.editing ? "Lock editing" : "Edit fields";
  button.classList.toggle("is-active", state.editing);
}

function makeEditableField(currentValue, { row, col, placeholder = "Pending", multiline = false, onSaved }) {
  const wrap = document.createElement("div");
  wrap.className = "editable-field";
  const input = document.createElement(multiline ? "textarea" : "input");
  if (!multiline) input.type = "text";
  else input.rows = 3;
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
  if (!multiline) {
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); input.blur(); }
    });
  }
  return wrap;
}

// ---- Club officers ----

function buildOfficersModel(rows) {
  let period = "";
  const officers = [];
  rows.forEach(row => {
    const role = clean(row[0]);
    const name = clean(row[1]);
    if (!role && name) { period = name; return; }
    if (role && name) officers.push({ role, name });
  });
  return { period, officers };
}

function renderOfficers(model) {
  const card = document.getElementById("officersCard");
  if (!model.officers.officers.length) { card.hidden = true; return; }
  card.hidden = false;
  setText("officersPeriod", model.officers.period || "Club Officers");
  document.getElementById("officersList").innerHTML = model.officers.officers
    .map(o => `<li><span>${escapeHtml(o.role)}</span><strong>${escapeHtml(o.name)}</strong></li>`)
    .join("");
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

function renderAgendaTable() {
  const rowsHtml = AGENDA_BLOCKS.map(block => block.rows.map(([segment, roleTaker], index) => {
    const isBlockStart = index === 0;
    const timeCell = isBlockStart ? `<td class="agenda-time" rowspan="${block.rows.length}">${escapeHtml(block.time)}</td>` : "";
    const segmentText = isBlockStart && block.highlight
      ? `<mark class="agenda-highlight">${escapeHtml(segment)}</mark>`
      : escapeHtml(segment);
    return `<tr class="${isBlockStart ? "agenda-block-start" : "agenda-sub-row"}">
      ${timeCell}
      <td class="${isBlockStart ? "agenda-segment" : "agenda-sub-segment"}">${segmentText}</td>
      <td class="agenda-role-taker">${escapeHtml(roleTaker)}</td>
    </tr>`;
  }).join("")).join("");
  return `<div class="agenda-table-wrap"><table class="agenda-standard-table">
    <thead><tr><th>Time</th><th>Segment</th><th>Role taker</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table></div>`;
}

function scheduleWeeksWithSpeeches(model) {
  // Chronology (is this week's date behind today) is independent from
  // whether individual speeches in it have been marked delivered (○/O).
  const today = todayKst();
  const todayMonth = today.getMonth() + 1;
  const todayWeek = weekOfMonth(today.getDate());
  const map = new Map();
  model.schedule.speeches.forEach(s => {
    const key = `${s.monthNum}-${s.weekNum}`;
    if (!map.has(key)) {
      const isPast = s.monthNum < todayMonth || (s.monthNum === todayMonth && s.weekNum < todayWeek);
      map.set(key, { monthNum: s.monthNum, weekNum: s.weekNum, label: s.label, isPast, speeches: [] });
    }
    map.get(key).speeches.push(s);
  });
  return [...map.values()].sort((a, b) => (a.monthNum - b.monthNum) || (a.weekNum - b.weekNum));
}

function nextPipelineWeek(model) {
  const upcomingWeeks = scheduleWeeksWithSpeeches(model).filter(w => !w.isPast);
  const coming = model.roles.comingMeeting;
  if (coming?.date) {
    const cMonth = coming.date.getMonth() + 1;
    const cWeek = weekOfMonth(coming.date.getDate());
    const after = upcomingWeeks.find(w => w.monthNum > cMonth || (w.monthNum === cMonth && w.weekNum > cWeek));
    if (after) return after;
  }
  return upcomingWeeks[0] || null;
}

function renderMeeting(model) {
  const meetingsByView = { past: model.roles.pastMeeting, coming: model.roles.comingMeeting, next: model.roles.nextMeeting };
  const meeting = meetingsByView[state.meetingView];
  document.querySelector(".assignments-panel").classList.remove("is-cancelled");
  document.querySelector(".week-speeches-panel").classList.remove("is-cancelled");

  if (!meeting) {
    const preview = nextPipelineWeek(model);
    const readiness = document.getElementById("meetingReadiness");
    readiness.className = "meeting-readiness needs-attention";
    readiness.setAttribute("aria-disabled", "true");
    readiness.tabIndex = -1;
    setText("readinessStatus", "Needs attention");
    setText("readinessScore", "0% (0/11)");
    setText("readinessMissing", preview ? "This meeting hasn't been added to the 2026 tab yet." : "No meeting is scheduled in this view yet.");
    readiness.querySelector(".readiness-track").setAttribute("aria-valuenow", "0");
    document.getElementById("readinessBar").style.width = "0%";
    document.getElementById("weekAssignments").innerHTML = `<div class="empty-state">Add a column to the 2026 tab to populate this meeting.</div>`;
    document.getElementById("agendaTimeline").innerHTML = renderAgendaTable();
    document.getElementById("meetingThemeBanner").hidden = true;
    document.getElementById("exportButton").hidden = true;
    document.getElementById("printButton").hidden = true;
    document.getElementById("cancelToggleButton").hidden = true;
    state.currentMeeting = null;

    if (preview) {
      setText("meetingTitle", `${preview.label} (from Speech Pipeline)`);
      document.getElementById("weekSpeeches").innerHTML = preview.speeches.map(s => `
        <article class="week-speech">
          <span class="speaker">${escapeHtml(s.member)}</span>
          <h4>${escapeHtml(s.title)}</h4>
          <p>${escapeHtml(s.project ? `Project · ${s.project}` : "Project · Pending")}</p>
        </article>`).join("");
    } else {
      setText("meetingTitle", "No Scheduled Meeting");
      document.getElementById("weekSpeeches").innerHTML = `<div class="empty-state">No prepared speeches assigned yet.</div>`;
    }
    return;
  }

  if (meeting.cancelled) {
    renderCancelledMeeting(meeting);
    renderCancelToggle(meeting);
    return;
  }

  setText("meetingTitle", meeting.date ? `${formatDate(meeting.date)} Meeting` : `${meeting.label} Meeting`);
  renderMeetingReadiness(meeting);
  renderMeetingTheme(meeting);
  renderWeekAssignments(meeting);
  renderWeekSpeeches(meeting);
  document.getElementById("agendaTimeline").innerHTML = renderAgendaTable();
  document.getElementById("exportButton").hidden = false;
  document.getElementById("printButton").hidden = false;
  renderCancelToggle(meeting);
  state.currentMeeting = meeting;
}

async function performCancelToggle(meeting) {
  const button = document.getElementById("cancelToggleButton");
  const status = document.getElementById("cancelToggleStatus");
  const next = meeting.cancelled ? "" : "Yes";
  button.disabled = true;
  status.textContent = "Saving…";
  try {
    await saveCell(meeting.cancelledSheetRow, meeting.sheetCol, next);
    meeting.cancelled = next;
    renderMeeting(state.model);
  } catch (error) {
    status.textContent = error.message || "Save failed.";
  } finally {
    button.disabled = false;
  }
}

function renderCancelToggle(meeting) {
  const button = document.getElementById("cancelToggleButton");
  const status = document.getElementById("cancelToggleStatus");
  status.textContent = "";
  if (!editingAvailable() || !meeting.cancelledSheetRow) {
    button.hidden = true;
    return;
  }
  button.hidden = false;
  button.className = `cancel-toggle-button ${meeting.cancelled ? "is-cancelled" : ""}`;
  button.textContent = meeting.cancelled ? "Un-cancel meeting" : "Cancel meeting";
  button.onclick = () => {
    // Cancelling/un-cancelling a meeting always re-confirms the password,
    // even if it's already known from Edit fields or a prior use — this is
    // a more consequential action than a routine field edit.
    state.pendingAfterUnlock = () => performCancelToggle(meeting);
    unlockEditing();
  };
}

function renderCancelledMeeting(meeting) {
  setText("meetingTitle", `${meeting.date ? formatDate(meeting.date) : meeting.label} Meeting — Cancelled`);
  const readiness = document.getElementById("meetingReadiness");
  readiness.className = "meeting-readiness cancelled";
  readiness.setAttribute("aria-disabled", "true");
  readiness.tabIndex = -1;
  setText("readinessStatus", "Cancelled");
  setText("readinessScore", "—");
  const reason = meeting.cancelled && meeting.cancelled.toLowerCase() !== "yes" ? meeting.cancelled : "";
  setText("readinessMissing", reason ? `Reason: ${reason}` : "This meeting has been cancelled.");
  readiness.querySelector(".readiness-track").setAttribute("aria-valuenow", "0");
  document.getElementById("readinessBar").style.width = "0%";
  document.getElementById("meetingThemeBanner").hidden = true;
  document.getElementById("weekAssignments").innerHTML = `<div class="empty-state">This meeting has been cancelled.</div>`;
  document.getElementById("weekSpeeches").innerHTML = `<div class="empty-state">This meeting has been cancelled.</div>`;
  document.getElementById("agendaTimeline").innerHTML = `<div class="empty-state">No agenda — this meeting was cancelled.</div>`;
  document.getElementById("exportButton").hidden = true;
  document.getElementById("printButton").hidden = true;
  document.querySelector(".assignments-panel").classList.add("is-cancelled");
  document.querySelector(".week-speeches-panel").classList.add("is-cancelled");
  state.currentMeeting = null;
}

// ---- Export ----

function formatExportDate(meeting) {
  if (!meeting.date) return meeting.label;
  const monthDay = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", month: "long", day: "numeric" }).format(meeting.date);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", weekday: "long" }).format(meeting.date);
  return `${monthDay} (${weekday})`;
}

function buildExportText(meeting) {
  const roleValue = label => meeting.roles.find(r => r.label === label)?.member || "";
  const speakerValue = label => meeting.speakers.find(s => s.label === label)?.member || "";
  const debate = roleValue("Debate Master");

  return [
    DASHBOARD_URL,
    "",
    `Date: ${formatExportDate(meeting)} at 10:00`,
    "",
    `🍋 Toastmaster : ${roleValue("Toastmasters")}`,
    `🍋 Table Topics Master : ${roleValue("Table Topics Master")}`,
    `🍋 Debate Master : ${debate}${debate ? " " : ""}(연설1,2과 평가1,2가 차면 토론은 자동 취소됩니다)`,
    `🍋 Quiz Master : ${roleValue("Quiz Master")}`,
    `🟩 Grammarian : ${roleValue("Grammarian")}`,
    `🟩 Timer : ${roleValue("Timer")}`,
    `🟩 Ah Counter : ${roleValue("Ah-counter")}`,
    "",
    `🫐 Speaker #1 : ${speakerValue("Speaker #1")}`,
    `🫐 Evaluator #1 : ${roleValue("Evaluator #1")}`,
    `🫐 Speaker #2 : ${speakerValue("Speaker #2")}`,
    `🫐 Evaluator #2 : ${roleValue("Evaluator #2")}`,
  ].join("\n");
}

function openExportDialog() {
  if (!state.currentMeeting) return;
  const textarea = document.getElementById("exportText");
  textarea.value = buildExportText(state.currentMeeting);
  document.getElementById("exportCopyStatus").textContent = "";
  document.getElementById("exportDialog").showModal();
  textarea.focus();
  textarea.select();
}

async function copyExportText() {
  const textarea = document.getElementById("exportText");
  const status = document.getElementById("exportCopyStatus");
  try {
    await navigator.clipboard.writeText(textarea.value);
    status.textContent = "Copied!";
  } catch (error) {
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    status.textContent = ok ? "Copied!" : "Select the text above and copy manually.";
  }
}

// ---- Printable agenda sheet ----

const SPEECH_TIME_TABLE = [
  ["Table Topics speech", "1:00", "1:30", "2:00"],
  ["Prepared speech", "5:00", "6:00", "7:00"],
  ["Debate speech", "1:00", "1:30", "2:00"],
  ["Speech Evaluation", "2:00", "2:30", "3:00"],
];

function findNextMeetingDate(meeting, model) {
  const dated = model.roles.meetings.filter(m => m.date).sort((a, b) => a.date - b.date);
  const idx = dated.findIndex(m => m.col === meeting.col);
  const next = idx >= 0 ? dated[idx + 1] : null;
  return next ? formatDate(next.date, { year: "numeric" }) : "TBD";
}

function buildPrintAgendaHtml(meeting, model) {
  const dateStr = meeting.date
    ? new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", month: "long", day: "numeric", year: "numeric" }).format(meeting.date)
    : meeting.label;
  const officersRows = model.officers.officers
    .map(o => `<tr><td>${escapeHtml(o.role)}</td><td>${escapeHtml(o.name)}</td></tr>`).join("");
  const missionText = document.querySelector(".mission-text")?.textContent.trim() || "";
  const wodRole = meeting.roles.find(r => r.label.toLowerCase() === "word of the day");
  const speechTimeRows = SPEECH_TIME_TABLE
    .map(([kind, g, y, r]) => `<tr><td>${kind}</td><td>${g}</td><td>${y}</td><td>${r}</td></tr>`).join("");
  const speakerRows = meeting.speakers.map((s, i) => {
    const evaluator = meeting.roles.find(r => r.label === `Evaluator #${i + 1}`)?.member || "";
    const pathwaysProject = [s.pathways, s.project].filter(Boolean).join(" — ");
    return `<tr><td>${i + 1}</td><td>${escapeHtml(s.member)}</td><td>${escapeHtml(s.title)}</td><td>${escapeHtml(pathwaysProject)}</td><td>${escapeHtml(evaluator)}</td></tr>`;
  }).join("");

  return `
    <p class="print-dashboard-url">${escapeHtml(DASHBOARD_URL)}</p>
    <div class="print-header">
      <img src="./toastmasters-log.jpeg" class="print-logo" alt="" />
      <div>
        <h1>Pyeong-chon Toastmasters</h1>
        <h2>Meeting Agenda &nbsp; ${escapeHtml(dateStr)}</h2>
      </div>
    </div>
    <div class="print-columns">
      <div class="print-col print-col-main">
        <h3>Club Mission:</h3>
        <p class="print-mission">${escapeHtml(missionText)}</p>
        ${renderAgendaTable()}
        <h3>Theme: ${escapeHtml(meeting.theme || "TBD")}</h3>
        <p><strong>TQ:</strong></p>
        <ul>${meeting.tq.length ? meeting.tq.map(q => `<li>${escapeHtml(q)}</li>`).join("") : "<li>TBD</li>"}</ul>
        <p><strong>WOD:</strong> ${escapeHtml(wodRole?.value || "TBD")}</p>
      </div>
      <div class="print-col print-col-side">
        <h3>Club Officers:</h3>
        <table class="print-kv"><tbody>${officersRows}</tbody></table>
        <h3>Speech Time</h3>
        <table class="print-speech-time">
          <thead><tr><th>Kind of speech</th><th>Green</th><th>Yellow</th><th>Red</th></tr></thead>
          <tbody>${speechTimeRows}</tbody>
        </table>
        <h3>Club Business</h3>
        <p>1. Next meeting date : ${escapeHtml(findNextMeetingDate(meeting, model))}</p>
        <h3>Speech information</h3>
        <table class="print-speech-info">
          <thead><tr><th>#</th><th>Name</th><th>Title</th><th>Pathways Project</th><th>Evaluator</th></tr></thead>
          <tbody>${speakerRows || `<tr><td colspan="5">TBD</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
}

function openPrintPreview() {
  if (!state.currentMeeting || !state.model) return;
  document.getElementById("printAgenda").innerHTML = buildPrintAgendaHtml(state.currentMeeting, state.model);
  const dialog = document.getElementById("printPreviewDialog");
  if (!dialog.open) dialog.showModal();
}

function renderMeetingTheme(meeting) {
  const banner = document.getElementById("meetingThemeBanner");
  banner.hidden = false;
  const editing = editingAvailable() && state.editing;

  const themeContainer = document.getElementById("meetingThemeText");
  themeContainer.innerHTML = "";
  if (editing && meeting.themeSheetRow) {
    themeContainer.appendChild(makeEditableField(meeting.theme, {
      row: meeting.themeSheetRow, col: meeting.sheetCol,
      onSaved: next => { meeting.theme = next; },
    }));
  } else if (editing) {
    themeContainer.innerHTML = `<span class="pending">Add a "Theme" row to the 2026 tab to make this editable.</span>`;
  } else {
    themeContainer.textContent = meeting.theme || "Pending";
    themeContainer.classList.toggle("pending", !meeting.theme);
  }

  const tqContainer = document.getElementById("meetingTqList");
  tqContainer.innerHTML = "";
  if (editing && meeting.tqSheetRow) {
    tqContainer.appendChild(makeEditableField(meeting.tq.join("\n"), {
      row: meeting.tqSheetRow, col: meeting.sheetCol, multiline: true, placeholder: "One question per line",
      onSaved: next => { meeting.tq = next.split("\n").map(clean).filter(Boolean); },
    }));
  } else if (editing) {
    tqContainer.innerHTML = `<span class="pending">Add a "TQ" row to the 2026 tab to make this editable.</span>`;
  } else {
    tqContainer.innerHTML = meeting.tq.length
      ? `<ul>${meeting.tq.map(q => `<li>${escapeHtml(q)}</li>`).join("")}</ul>`
      : `<span class="pending">Pending</span>`;
  }

  const wodContainer = document.getElementById("meetingWodText");
  wodContainer.innerHTML = "";
  const wodRole = meeting.roles.find(r => r.label.toLowerCase() === "word of the day");
  if (editing && wodRole) {
    wodContainer.appendChild(makeEditableField(wodRole.value, {
      row: wodRole.sheetRow, col: wodRole.sheetCol,
      onSaved: next => { wodRole.value = next; recomputeReadiness(meeting); },
    }));
  } else if (editing) {
    wodContainer.innerHTML = `<span class="pending">Add a "word of the day" row to the 2026 tab to make this editable.</span>`;
  } else {
    wodContainer.textContent = wodRole?.value || "Pending";
    wodContainer.classList.toggle("pending", !wodRole?.value);
  }
}

function recomputeReadiness(meeting) {
  const roleFilled = meeting.roles.filter(r => !r.isText && r.member).length;
  const speakerFilled = meeting.speakers.filter(s => s.member).length;
  meeting.filled = roleFilled + speakerFilled;
  renderMeetingReadiness(meeting);
}

function renderWeekAssignments(meeting) {
  const container = document.getElementById("weekAssignments");
  container.innerHTML = "";
  const editing = editingAvailable() && state.editing;

  const appendCell = (label, value, sheetRow, sheetCol, onSaved) => {
    const cell = document.createElement("div");
    cell.className = `assignment ${value ? "" : "pending"}`;
    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    cell.appendChild(labelEl);
    if (editing) {
      cell.appendChild(makeEditableField(value, {
        row: sheetRow, col: sheetCol,
        onSaved: next => {
          onSaved(next);
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
  };

  const appendRole = r => appendCell(r.label, r.isText ? r.value : r.member, r.sheetRow, r.sheetCol, next => {
    if (r.isText) r.value = next; else r.member = next;
  });
  const appendSpeaker = s => appendCell(s.label, s.member, s.memberSheetRow, s.sheetCol, next => { s.member = next; });

  const excludedLabels = new Set(["word of the day", "quote of the day", "evaluator #1", "evaluator #2"]);
  const otherRoles = meeting.roles.filter(r => !excludedLabels.has(r.label.toLowerCase()));
  const evaluator1 = meeting.roles.find(r => r.label === "Evaluator #1");
  const evaluator2 = meeting.roles.find(r => r.label === "Evaluator #2");
  const [speaker1, speaker2] = meeting.speakers;

  // Grid is 2 columns: row 1 is the first two "other" roles, rows 2 and 3
  // are the Speaker/Evaluator pairs, then the remaining "other" roles.
  otherRoles.slice(0, 2).forEach(appendRole);
  if (speaker1) appendSpeaker(speaker1);
  if (evaluator1) appendRole(evaluator1);
  if (speaker2) appendSpeaker(speaker2);
  if (evaluator2) appendRole(evaluator2);
  otherRoles.slice(2).forEach(appendRole);
}

function renderWeekSpeeches(meeting) {
  const container = document.getElementById("weekSpeeches");
  container.innerHTML = "";
  if (!meeting.speakers.length) {
    container.innerHTML = `<div class="empty-state">No speakers assigned yet.</div>`;
    return;
  }
  const editing = editingAvailable() && state.editing;
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
  setText("metricMeetings", model.roles.meetings.filter(m => !m.cancelled).length);

  renderNotices(model);
  renderOfficers(model);
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
    const officers = buildOfficersModel(parseCsv(meta.officersCsv));
    state.model = { schedule, roles, officers };
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
    if (state.editing) {
      lockEditing();
    } else if (editingUnlocked()) {
      // Password already verified (e.g. via the Cancel meeting button) — just turn on edit mode, no re-prompt.
      state.editing = true;
      updateEditToggle();
      if (state.model) renderMeeting(state.model);
    } else {
      unlockEditing();
    }
  });
  document.getElementById("closeEditUnlockDialog").addEventListener("click", () => {
    state.pendingAfterUnlock = null;
    document.getElementById("editUnlockDialog").close();
  });
  document.getElementById("editUnlockDialog").addEventListener("cancel", () => { state.pendingAfterUnlock = null; });
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
      document.getElementById("editUnlockDialog").close();
      if (state.pendingAfterUnlock) {
        // Triggered by a quick action (e.g. Cancel meeting) — run it without
        // touching Edit fields' own on/off state or switching panels into edit mode.
        const run = state.pendingAfterUnlock;
        state.pendingAfterUnlock = null;
        run();
      } else {
        state.editing = true;
        updateEditToggle();
        if (state.model) renderMeeting(state.model);
      }
    } catch (error) {
      errorEl.textContent = error.message || "Could not verify password.";
      errorEl.hidden = false;
    } finally {
      submitButton.disabled = false;
    }
  });

  document.getElementById("exportButton").addEventListener("click", openExportDialog);
  document.getElementById("closeExportDialog").addEventListener("click", () => document.getElementById("exportDialog").close());
  document.getElementById("exportCopyButton").addEventListener("click", copyExportText);
  document.getElementById("printButton").addEventListener("click", openPrintPreview);
  const printPreviewDialog = document.getElementById("printPreviewDialog");
  document.getElementById("closePrintPreviewDialog").addEventListener("click", () => printPreviewDialog.close());
  printPreviewDialog.addEventListener("click", event => {
    if (event.target === printPreviewDialog) printPreviewDialog.close();
  });
  document.getElementById("printNowButton").addEventListener("click", () => window.print());
}

bindEvents();
updateEditToggle();
loadData(false);
