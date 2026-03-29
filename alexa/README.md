# Alexa Integration Starter for Look Ahead Planner

This is a **starter** Alexa integration that is intentionally separate from the existing web/mobile app.
It does not change current planner behavior.

## What it adds
- AWS Lambda handler: `alexa/lambda/index.mjs`
- Alexa interaction model: `alexa/interaction-model.json`
- Uses the worker's Alexa-only endpoints:
  - `POST /api/integrations/alexa/add`
  - `POST /api/integrations/alexa/today`

## Worker setup
Set this secret on the Cloudflare Worker:

```bash
cd worker
wrangler secret put ALEXA_SECRET
wrangler deploy
```

## Lambda environment variables
Set these in AWS Lambda:

- `LOOKAHEAD_WORKER_BASE`
  - Example: `https://look-ahead-planner.99redder.workers.dev`
- `LOOKAHEAD_ALEXA_SECRET`
  - Same value as the worker `ALEXA_SECRET`
- `LOOKAHEAD_USER_ID`
  - Example: `chris`

## Current MVP behavior
### Supported voice actions
- Add a task
- Read today's tasks

### Examples
- "Alexa, ask Look Ahead to add dentist appointment tomorrow"
- "Alexa, ask Look Ahead to add buy milk for next Tuesday"
- "Alexa, ask Look Ahead what is on my calendar today"

Alexa's model now uses a **single freeform slot** for add-task requests, and the Lambda parses the title/date phrase.

## Important limitation
The included date parser is intentionally simple so it doesn't disturb the current app.
Right now it reliably supports:
- `today`
- `tomorrow`
- `next monday` / `next tuesday` / etc.
- `in 2 weeks`
- month/day phrases like `April 4`
- exact `YYYY-MM-DD`

If Alexa doesn't pass a recognizable date phrase, it falls back to **today**.

## Recommended next improvement
After confirming the integration works end-to-end, upgrade date parsing to support:
- "April 4"
- "in two weeks"
- times like "at 3 PM"
- reading tomorrow / next week

## Safety / compatibility
This integration is **additive only**:
- existing app endpoints remain unchanged
- existing password auth remains unchanged
- if Lambda/Alexa is never configured, current planner functionality remains exactly as-is
