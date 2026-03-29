# Look Ahead — Project Guide

## What This Is
A minimalist cyberpunk-themed calendar planner PWA. Tasks are displayed in a rolling 12-week grid (desktop) or single-day view (mobile) and synced to a Cloudflare Worker + D1 (SQLite) backend.

## Architecture

```
/                          # Static frontend (desktop)
├── index.html             # Desktop shell — calendar grid UI
├── app.js                 # All desktop JS (no framework)
├── styles.css             # Desktop styles (CSS variables, neon theme)
├── look-ahead-mobile.html # Mobile single-page app (self-contained HTML+JS)
├── sw.js                  # Service worker — network-first, caches static assets
├── manifest.json          # PWA manifest
└── worker/
    ├── src/index.js       # Cloudflare Worker — REST API
    ├── wrangler.toml      # Worker config + D1 binding
    └── migrations/
        ├── 0001_create_planner_items.sql
        └── 0002_add_due_time.sql
```

## Stack
- **Frontend**: Vanilla JS, HTML5, CSS3. No framework, no build step.
- **Backend**: Cloudflare Worker (serverless) + Cloudflare D1 (SQLite)
- **Auth**: Single shared password via `X-App-Password` header; stored in localStorage
- **PWA**: Service worker with offline fallback; installable on mobile/desktop

## Task Data Model
```
id          INTEGER PK AUTOINCREMENT
user_id     TEXT    ('chris')
kind        TEXT    ('task')
title       TEXT
due_date    TEXT    (YYYY-MM-DD)
due_time    TEXT    (HHMM, e.g. '0800' — nullable)
status      TEXT    ('open' | 'done')
notes       TEXT    (not synced from desktop — stored in localStorage)
source      TEXT    ('lookahead-app' | 'lookahead-mobile')
```

## Time Field
- Format: exactly 4 digits, military time (HHMM). Validated with `/^\d{4}$/`.
- `formatMilitaryTime(raw)` — returns the 4-digit string or `''` if invalid.
- `timeSortValue(task)` — returns `task.due_time` or `'9999'` for tasks with no time (sorts last).
- Tasks within a day are sorted by time ascending; done tasks are pushed to end.

## API Endpoints (Worker)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/planner/items?userId=&includeDone=1` | Fetch all tasks |
| POST | `/api/planner/items` | Create or update (pass `id` to update) |
| POST | `/api/planner/items/toggle` | Toggle done/open |
| POST | `/api/planner/items/delete` | Delete by id |
| POST | `/api/planner/items/reschedule` | Change due_date only |

## Development

### Worker
```bash
cd worker
npx wrangler dev          # Local dev (uses local D1)
npx wrangler deploy       # Deploy to production
```

### Database Migrations (D1)
```bash
# Apply to local dev DB
npx wrangler d1 migrations apply look-ahead-planner-db

# Apply to production
npx wrangler d1 migrations apply look-ahead-planner-db --remote
```

Migrations must be applied manually — they are not auto-applied on deploy.

### Frontend
No build step. Edit `app.js` / `styles.css` / `index.html` / `look-ahead-mobile.html` directly.
Service worker caching version is bumped in `sw.js` to force cache refresh after deploys.

## Key Patterns
- `USER_ID` is hardcoded as `'chris'` in both frontend files.
- `API_BASES` array allows fallback worker URLs (currently one entry).
- Desktop task notes are localStorage-only (`lookahead:task-notes:{id}`), not synced to DB.
- All date math uses `localDayAnchor()` (noon local time) to avoid DST edge cases.
- Drag-and-drop reschedules via `/reschedule` endpoint (does not touch `due_time`).
