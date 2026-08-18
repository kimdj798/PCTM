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
  (Toastmasters, Table Topics Master, Debate Master, Quiz Master, two Speaker
  slots with title/pathway/project, two Evaluators, Grammarian, word/quote of
  the day, Timer, Ah-counter). Add a new column with a date label (e.g.
  `Sep 5`) to schedule another meeting — the dashboard picks it up
  automatically.
  - The **readiness score** only counts the 9 roles shown in the Role
    assignments panel (Toastmasters, Table Topics Master, Debate Master,
    Quiz Master, Evaluator #1/#2, Grammarian, Timer, Ah-counter). Speaker
    names/titles/pathways/projects, word/quote of the day, and Theme/TQ are
    all tracked and editable, but don't affect the score.
- **Theme / TQ** (optional rows on the `2026` tab): add a row labeled `Theme`
  and a row labeled `TQ` (case-insensitive) anywhere in column A, with the
  meeting's theme and theme questions in that meeting's column. For `TQ`,
  put each question on its own line within the cell (Alt+Enter in Google
  Sheets) — the dashboard splits on line breaks into a bulleted list. These
  two rows don't count toward the readiness score; they just show as a
  banner at the top of the Meeting Roles section, "Pending" until filled in.
- **`ClubOfficers` tab** (`gid=2126938942`): two columns, no header — an
  optional first row with a blank column A and a period label in column B
  (e.g. `Second half of 2026`), then one `Role, Name` row per officer. Shown
  as a card in the top-right of the hero. Edit the sheet directly to update
  it; it isn't editable from the dashboard's Edit fields mode.

The "Standard agenda" panel is a fixed template matching PCTM's printed
agenda sheet (Time / Segment / Role taker) — it isn't sourced from the Sheet.

## Refresh behavior

- Data loads on first visit and whenever you click **Refresh**.
- "Completed" vs "upcoming" is approximated as week-of-month (`ceil(day / 7)`)
  compared against today in Korea time, since the schedule tab tracks weeks,
  not exact dates.

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
Table Topics/Debate/Quiz Master, Grammarian/Timer/Ah Counter, and both
Speaker/Evaluator pairs — and opens it in a dialog with a **Copy to
clipboard** button. Paste directly into a group chat. Only available when a
real meeting exists in the `2026` tab (not the Speech Pipeline preview
shown for meetings that haven't been added yet).
