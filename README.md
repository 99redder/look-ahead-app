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

Then deploy:

```bash
wrangler deploy
```

The app prompts for password on first API call and stores it in localStorage for reuse.
If the password is wrong/rotated, API returns 401 and the app re-prompts.
