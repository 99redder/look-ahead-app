# Look Ahead (Standalone)

Initial standalone web app scaffold matching the neon planner vibe.

## Current status
- Cloudflare Worker-backed planner API (source of truth)
- Password login prompt in web + mobile app
- Password verified server-side via Worker env secret (`APP_PASSWORD`)
- Task add/toggle/delete against D1 API

## Worker setup

Create a D1 database in Cloudflare, then copy its database ID into your local
Worker config before deploying. Do not commit production database IDs.

```bash
cd worker
cp wrangler.toml.example wrangler.toml
# Edit wrangler.toml and set database_id from the Cloudflare dashboard
```

Set the Worker secrets:

```bash
wrangler secret put APP_PASSWORD
wrangler secret put APP_USER_ID
```

Set `APP_USER_ID` to the canonical planner user for this deployment.

Then deploy:

```bash
wrangler deploy
```

The app prompts for password on first API call and stores it in localStorage for reuse.
If the password is wrong/rotated, API returns 401 and the app re-prompts.
