# Assignment Automation — Production Operating Model

Documents how the Playwright-based assignment automation (`frontend/automation/`) is intended
to run in production, beyond this exercise's local/manual invocation.

## Trigger

**Recommended: batch job triggered when new consignments are ready** (not per-consignment,
not a fixed schedule).

```
Batch job triggered when new consignments are ready
        ↓
Fetch/load determinations
        ↓
Start Playwright worker
        ↓
Process each consignment
        ↓
Retry transient failures
        ↓
Report failures
        ↓
Generate/export results
```

Why batch-on-ready rather than the alternatives:

- **Per-consignment** (one browser session per consignment) wastes browser launch/auth
  overhead — GEODATA exports naturally arrive as a batch (a whole file of consignments), so
  processing one launch per file amortizes that cost.
- **Fixed schedule** (e.g. every 15 minutes) adds needless latency when there's nothing new,
  and risks overlapping runs if a batch is still processing. Triggering off an actual "new
  export ingested" event (e.g. after `/api/ingest` succeeds, or a new file landing in a watched
  location) keeps latency low without polling.

In practice: the ingestion step (parse → `determine()`) and the automation step are decoupled —
ingestion produces a determinations export (JSON/CSV), and *that* becoming available is what
triggers the automation batch job (e.g. a queue message, a CI/CD job, or a scheduled poll of an
"unprocessed exports" folder as a simple fallback if no event bus exists yet).

## Retry strategy

- **Maximum retries**: configurable via `AUTOMATION_MAX_RETRIES` (default `3`).
- **Transient** (retried): navigation timeouts, elements not yet attached/visible, page/context
  crashes — anything indicating the browser or page was temporarily unable to respond, detected
  via `isTransientError()` matching error messages (timeout/navigation/detached/target closed).
- **Permanent / business validation** (never retried): consignment or line not found, and any
  rejection surfaced by the assignment screen's own validation (e.g. "Rate must be greater than
  or equal to 0"). Retrying these would just reproduce the same rejection.
- **Backoff**: the current implementation retries immediately (fixed small `maxRetries` attempts,
  no sleep) since Playwright's own actionability waits already absorb most timing flakiness. A
  production hardening pass should add exponential backoff (e.g. 500ms, 1s, 2s) between attempts
  to better tolerate slow deploys/restarts.
- **After retries are exhausted**: the line (or, for a missing consignment, all of its lines) is
  recorded with `status: "failed"` and a diagnostic error message; the batch continues with the
  next consignment rather than aborting.

## Failure handling

Operators discover failures via the `AutomationResult` the CLI/job prints and returns:

- The process **exit code is non-zero** whenever `failed > 0`, so any CI/scheduler/job runner
  wrapping `npm run automate:assignments` will surface it as a failed job.
- The console summary lists every failed consignment/line with its captured error message.
- Diagnostics for each failure are written under `artifacts/automation/` (screenshot + the page
  URL at the time of failure), for post-hoc debugging without needing to reproduce interactively.
- Browser/application outages (e.g. `open()` itself failing) surface as an unhandled rejection
  from `main()`, logged as "Automation crashed" with a non-zero exit — treated as a full batch
  failure needing investigation, distinct from individual line/consignment failures.

In a real deployment, wire the job runner's failure notification (Slack/email/PagerDuty, per
whatever the platform already uses) to trigger off that non-zero exit code, and ship the
`artifacts/automation/` directory as a job artifact for the failing run.

## Monitoring

Track, per run (and trended over time):

- `processed` / `successful` / `failed` / `pending` counts (from `AutomationResult`).
- Automation duration (wall-clock time of the run — wrap `runAssignmentAutomation` with a timer
  in the job runner).
- Browser/application errors — count of runs that crashed entirely (`open()`/`launch()` failure)
  vs. runs that completed with some failed lines.
- A rising `pending` count over time is itself a signal worth watching: it means `determine()`'s
  confidence is staying below `CONFIDENCE_THRESHOLD` for a growing share of lines and may need
  attention independent of the automation itself.

## Security

- **Credential management**: read from environment variables (`ASSIGNMENT_APP_USERNAME` /
  `ASSIGNMENT_APP_PASSWORD`), never hardcoded, never committed. The adapter only attempts login
  if both are set — the current starter app has no auth, so this is a no-op today.
- **Secret storage**: in production, source those env vars from the platform's secret manager
  (e.g. AWS Secrets Manager / SSM Parameter Store, given `deployment/task-definition.json`
  targets ECS) injected into the task at runtime, not baked into an image or committed `.env`.
- **No credentials in source control**: `.env` is already gitignored; the automation reads
  credentials only via `process.env`.
- **Browser/session handling**: each run launches a fresh, isolated `BrowserContext` and closes
  it (and the browser) in a `finally` block, so no session/cookie state leaks between runs or
  between consignments within a run.
