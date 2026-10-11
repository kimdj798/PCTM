# PCTM Dashboard

A live dashboard for PCTM's 2026 speech schedule and meeting roles, reading directly
from the club Google Sheet (main schedule tab + `2026` roles tab).

## Run locally

Requires Node.js 18+.

```powershell
npm start
```

Then open [http://127.0.0.1:4173](http://127.0.0.1:4173).

## GitHub Pages

Pushing to `main` runs GitHub Actions and deploys `public/` to GitHub Pages. The
page fetches the sheet directly from the browser (via the public `gviz` CSV
endpoint), so no server or API key is required once deployed.

## Data model

- **Schedule tab** (`gid=1701553634`): each member has three rows (plan mark,
  project, title) across weekly columns from July to December. This powers the
  Speech Pipeline section — who's speaking, when (by month/week), on what
  project, with what title.
- **`2026` tab** (`gid=1141924141`): one column per meeting, with role rows
  (Toastmasters, Table Topics Master, Debate Master, Quiz Master, three Speaker
  slots with title/pathway/project, three Evaluators, Grammarian, word/quote of
  the day, Timer, Ah-counter). Add a new column with a date label (e.g.
  `Sep 5`) to schedule another meeting — the dashboard picks it up
  automatically.
  - The **readiness score** counts everything shown in the Role assignments
    panel — the 10 support roles (Toastmasters, Table Topics Master, Debate
    Master, Quiz Master, Evaluator #1/#2/#3, Grammarian, Timer, Ah-counter)
    plus the three Speaker names (13 total). Speaker title/pathway/project,
    word/quote of the day, and Theme/TQ are still tracked and editable, but
    don't affect the score. In the grid, each Speaker #N/Evaluator #N pair
    is grouped on its own row (rows 2–4). Speaker/Evaluator slots are
    detected by label, so adding a `Speaker #4` block and `Evaluator #4` row
    to the sheet works without code changes.
- **Theme / TQ** (optional rows on the `2026` tab): add a row labeled `Theme`
  and a row labeled `TQ` (case-insensitive) anywhere in column A, with the
  meeting's theme and theme questions in that meeting's column. For `TQ`,
  put each question on its own line within the cell (Alt+Enter in Google
  Sheets) — the dashboard splits on line breaks into a bulleted list. These
  two rows don't count toward the readiness score; they just show as a
  banner at the top of the Meeting Roles section, "Pending" until filled in.
- **Cancelled** (optional row on the `2026` tab): add a row labeled
  `Cancelled` in column A. Put anything in a meeting's column to mark it
  cancelled — either `Yes`, or an actual reason (e.g. `Rained out`), which
  then shows as "Reason: Rained out" instead of the generic message. A
  cancelled meeting still appears in its normal Past/Coming/Next slot, but
  the title gets "— Cancelled", the readiness badge turns neutral gray, the
  Role assignments/Prepared speeches panels turn dark gray with a
  cancellation notice in place of their content, and Export/Print hide. It's
  also excluded from the "Meetings Logged" metric.
  Toggled via its own **Cancel meeting** / **Un-cancel meeting** button next
  to the other action buttons — always visible (once the `Cancelled` row
  exists on the sheet) regardless of whether Edit fields is on. It always
  prompts for the shared password, every time it's used — even if Edit
  fields is already unlocked — since cancelling a meeting is more
  consequential than a routine field edit. Using it does *not* turn on Edit
  fields' own on/off state or switch Role assignments/Prepared speeches into
  their editable-input view; those still only activate when you explicitly
  click Edit fields (which, once the password is already known from Cancel,
  turns on immediately without asking again).
- **`ClubOfficers` tab** (`gid=2126938942`): two columns, no header — an
  optional first row with a blank column A and a period label in column B
  (e.g. `Second half of 2026`), then one `Role, Name` row per officer. Shown
  as a card in the top-right of the hero. Edit the sheet directly to update
  it; it isn't editable from the dashboard's Edit fields mode.
- **`AgendaTimes` tab**: three columns, no header, **one row per line of the
  Standard agenda table** (every segment, including sub-rows like `Timer's
  report` — not just the 9 main blocks), in the exact top-to-bottom order
  they appear on screen: column A is the start time (only filled in on the
  first row of each time block — e.g. `Opening`, `Theme Talk`, `Prepared
  Speech`; leave it blank on sub-rows since they share their block's time),
  column B is the segment name, column C is the role taker. Unlike
  everything else on this tab, none of this is tied to any one meeting — it
  applies to the Standard agenda template shown on every meeting view.
  Editable via Edit fields (every Time/Segment/Role taker cell becomes its
  own input, matched to the sheet purely by row position); a row missing
  from this tab falls back to the built-in default text for that line and
  isn't editable until you add its row. See
  [`apps-script/agenda-times-seed.csv`](apps-script/agenda-times-seed.csv)
  for the full 24-row starter content (segment/role-taker text from the
  built-in template, with the club's current custom times already filled
  in) — paste it into the tab starting at A1, overwriting the old 9-row/
  2-column content, to make every field editable without changing what's
  currently displayed.

The "Standard agenda" panel's row layout (which segments belong to which
time block, and which rows get the highlighted-orange treatment) is a fixed
template matching PCTM's printed agenda sheet — only the Time/Segment/Role
taker text in each cell is sourced from (and editable via) the Sheet.

## Refresh behavior

- Data loads on first visit and whenever you click **Refresh**.
- **Delivered vs Planned** (Speech Pipeline metrics, Member contribution
  table, Timeline dimming) is read directly from each speech's 계획 mark on
  the schedule tab: any circle-like mark (`○`, `◯`, `⚪`, `〇`, `⭕`, or the
  letter `O`/`o`) means delivered, `△` or blank means still planned. Circle
  characters that look identical can be different Unicode code points
  depending on how they're typed/pasted, so several are accepted rather
  than one exact character. This does not compare against today's date —
  mark a cell once the speech is actually given and the dashboard picks it
  up on refresh.
- Week-of-month (`ceil(day / 7)`) compared against today in Korea time is
  still used elsewhere — to find "this week" on the Timeline and to pick
  which schedule week previews as "Next Meeting" when the `2026` tab
  doesn't have that meeting yet — since the schedule tab tracks weeks, not
  exact dates.

## Editing meeting roles from the dashboard

The public `gviz` CSV endpoint used to *read* the sheet is read-only, so
writing role assignments back requires a small Apps Script Web App deployed
inside the Sheet itself. Once set up, an **Edit fields** button appears next
to the Meeting Roles heading; anyone with the shared password can edit role
assignments and speaker details inline, and changes save straight to the
`2026` tab.

### 1. Deploy the Apps Script

1. Open the Google Sheet → **Extensions → Apps Script**.
2. Delete any placeholder code and paste in the contents of
   [`apps-script/Code.gs`](apps-script/Code.gs).
3. Change `EDIT_PASSWORD` to a real shared password (not `CHANGE_ME`).
4. **Deploy → New deployment → type: Web app.**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Click **Deploy**, authorize the script when prompted, and copy the Web
   app URL (ends in `/exec`).
6. Whenever you edit `Code.gs` later (e.g. to change the password), you
   must **Deploy → Manage deployments → Edit → New version** for the
   change to take effect — the `/exec` URL doesn't pick up new code
   automatically.

### 2. Point the dashboard at it

Set `EDIT_ENDPOINT` near the top of [`public/app.js`](public/app.js) to the
Web app URL from step 5, then redeploy (push to `main`). The **Edit fields**
button stays hidden until this is set.

### Notes

- The password is a simple shared gate, not per-user authentication — treat
  it like a door code, and rotate it (redeploy with a new `EDIT_PASSWORD`)
  if it leaks.
- Only fields on the `2026` roles tab are editable (role assignments,
  speaker title/pathway/project). The speech schedule tab is read-only from
  the dashboard.

## Exporting a meeting summary

The **Export** button next to Edit fields (Meeting Roles heading) generates a
KakaoTalk-ready text summary of the selected meeting — date, Toastmaster/
Table Topics/Debate/Quiz Master, Grammarian/Timer/Ah Counter, and every
Speaker/Evaluator pair — and opens it in a dialog with a **Copy to
clipboard** button. Paste directly into a group chat. Only available when a
real meeting exists in the `2026` tab (not the Speech Pipeline preview
shown for meetings that haven't been added yet).

## Printing a full agenda sheet

The **Print agenda** button (next to Export) opens an on-screen preview of
PCTM's full paper agenda template — logo, a **Role Assignments** table (the
same names and ordering as the live Role assignments panel), club officers,
club mission, the standard Time/Segment/Role taker table, a speech-timing
reference (green/yellow/red), Club Business (auto-filled with the next
scheduled meeting's date), Theme/TQ/WOD, and a speaker info table
(name/title/pathway-project/evaluator) — so you can review it before
committing to anything. A **Print / Save as PDF** button inside that preview
then opens the browser's
native print dialog. The speech-timing values are a fixed reference table
(not sourced from the Sheet). Same availability rule as Export: only shown
for a real `2026` tab meeting.
