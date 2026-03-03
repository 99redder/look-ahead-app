# Look Ahead (Standalone)

Initial standalone web app scaffold matching the neon planner vibe.

## Current status
- GitHub Pages-ready static app
- Password gate in UI (SHA-256 check)
- Task add/toggle/delete local storage flow

## IMPORTANT security note
This front-end password gate is **not true security** (source is client-visible).

For real password protection on a public Pages site, use one of:
1. Cloudflare Access in front of the site (recommended)
2. Private hosting with server-side auth (not pure Pages)

## Next implementation steps
1. Add shared planner API service (source of truth)
2. Rewire dashboard Daily Planner to API
3. Rewire this app to API
4. Enable real-time sync (SSE)
