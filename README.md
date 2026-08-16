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
  the day, Timer, Ah-counter). This powers the meeting readiness view. Add a
  new column with a date label (e.g. `Sep 5`) to schedule another meeting —
  the dashboard picks it up automatically.

There's no source agenda-with-times tab yet, so the "Standard agenda" panel
uses a generic Toastmasters meeting template filled in with whichever roles
are assigned for the selected meeting.

## Refresh behavior

- Data loads on first visit and whenever you click **Refresh**.
- "Completed" vs "upcoming" is approximated as week-of-month (`ceil(day / 7)`)
  compared against today in Korea time, since the schedule tab tracks weeks,
  not exact dates.
