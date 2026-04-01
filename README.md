# social-pipeline

PostNorth AI Social Media Content Pipeline — Cloudflare Worker.

## Quick start
1. `npm install`
2. Copy `.dev.vars.example` → `.dev.vars` and fill in secrets
3. `npm run dev` — local development
4. `npm run deploy` — push to Cloudflare

## Secrets required
```
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put GOOGLE_SERVICE_ACCOUNT_EMAIL
wrangler secret put GOOGLE_PRIVATE_KEY
wrangler secret put TALLY_SIGNING_SECRET
```

## Structure
```
src/index.js          ← Orchestrator + webhook router
agents/
  researcher.js       ← Agent 1: web research + context brief
  strategist.js       ← Agent 2: 30-post calendar skeleton
  writer.js           ← Agent 3: full caption writing
  checker.js          ← Agent 4: quality review + auto-fix
  formatter.js        ← Agent 5: structure for delivery
outputs/
  sheets.js           ← Google Sheets API
  pdf.js              ← Branded PDF (HTML template)
utils/
  claude.js           ← Shared Anthropic API wrapper
  tally.js            ← Tally webhook parser + verifier
test/
  manual-trigger.js   ← Local test script
```

## Cost per run
~$0.07 at current Claude Sonnet 4 pricing (~21,500 tokens).
