# auth-monitor

Cloudflare Worker that watches auth.bneck.com from outside the host: a cron
trigger every minute probes `/api/health/ready` and the discovery document,
judges the worker and bot heartbeats it receives on `/ping/<source>`, and
posts to the operator chat only when a check changes state. State lives in
D1. Free plan; see `docs/deployment.md` (Monitoring) for setup and the
rotation notes in `runbooks/oncall.md`.

```sh
npm ci
npm run typecheck     # wrangler types (generates worker-configuration.d.ts) + tsc
npm test              # decision logic, no bindings needed
npm run dev           # wrangler dev --test-scheduled; GET /__scheduled runs the cron once
npm run deploy
```
