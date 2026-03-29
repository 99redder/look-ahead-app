# Look Ahead (Standalone)

Initial standalone web app scaffold matching the neon planner vibe.

## Current status
- Cloudflare Worker-backed planner API (source of truth)
- Password login prompt in web + mobile app
- Password verified server-side via Worker env secret (`APP_PASSWORD`)
- Task add/toggle/delete against D1 API

## Auth setup (replace Cloudflare Access)
Set the Worker secret:

```bash
cd worker
wrangler secret put APP_PASSWORD
```

## Optional Alexa integration (backward-compatible)
This does **not** replace or modify the existing web/mobile app auth flow.
It adds separate Alexa-only endpoints protected by a dedicated bearer secret.

Set the additional Worker secret:

```bash
cd worker
wrangler secret put ALEXA_SECRET
```

New integration endpoints:
- `POST /api/integrations/alexa/add`
- `POST /api/integrations/alexa/today`

These require:
- `Authorization: Bearer <ALEXA_SECRET>`

Example add payload:

```json
{
  "userId": "chris",
  "title": "Dentist appointment",
  "dueDate": "2026-04-02",
  "notes": "",
  "kind": "task"
}
```

Example today payload:

```json
{
  "userId": "chris",
  "date": "2026-03-29"
}
```

Then deploy:

```bash
wrangler deploy
```

The app prompts for password on first API call and stores it in localStorage for reuse.
If the password is wrong/rotated, API returns 401 and the app re-prompts.
