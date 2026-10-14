# Daily proposals and dashboard — lot 6

## Runtime contract

The existing Codex task remains the search engine. JobPilot does not search employers or send applications automatically. The local server reads `<data-directory>/daily-inbox/pending` at startup and every 30 seconds. It exports `daily-inbox/known-offers.json` for task-side duplicate checks. This index contains offer/dossier IDs, employer, title, URL and current decision/status, without CV, letters, notes or keys.

The normal Windows data directory is `%LOCALAPPDATA%/JobPilot`, unless `JOBPILOT_DATA_DIR` overrides it. The task must use the same directory. An offline server leaves pending files untouched until restart.

An unavailable inbox does not block startup or manual preparation. The dashboard exposes a sanitized reception error; the worker may resume its local read-only scan after the filesystem issue is fixed. It never retries a paid provider call.

Write complete JSON to a `.tmp` file, then rename it atomically to a filename matching `[a-zA-Z0-9_-]{1,120}.json`. Alternatively:

```powershell
node scripts/enqueue-daily-proposals.mjs batch.json '<JobPilot-data-directory>'
```

The helper validates before enqueueing and never opens SQLite. Use it only after the human-confirmed tracking transition. A batch is limited to 100 proposals and 2 MiB. The versioned envelope is:

```json
{
  "format": "jobpilot-daily-proposals",
  "version": 1,
  "id": "unique-stable-batch-id",
  "createdAt": "2026-10-13T08:00:00Z",
  "proposals": [
    {
      "id": "unique-proposal-within-batch",
      "company": "Synthetic employer",
      "title": "Backend developer",
      "location": "Paris / hybrid",
      "text": "Verified public posting text, copied without invented requirements.",
      "url": "https://example.test/careers/backend",
      "verifiedAt": "2026-10-13T07:59:00Z",
      "source": "Employer careers page",
      "method": "Documented correspondence; unknown requirements separated",
      "score": 75,
      "justification": "Explain documented matches, reservations and unknowns."
    }
  ]
}
```

All fields are required; score may be `null`, and location may be empty. Verification time cannot follow batch creation time. Source and method identify the external assessment, not a hiring probability or an ATS measure. The task must open and verify the direct employer/ATS URL before enqueueing. Receiving a URL does not re-fetch or independently certify it.

## Import and review

One revision/receipt transaction creates pending offers and a persistent batch ledger. No dossier, send, interview or paid call is created. Stable batch IDs plus content hashes make replay idempotent; an altered batch using the same ID is refused. Duplicate URLs strip fragments and recognized tracking parameters while retaining identifying query parameters. Existing human corrections and decisions are never replaced.

Same employer/title at another URL, or multiple matching references, remains a review item. In dashboard or Offers, explicitly link to a candidate, dismiss the proposal, or confirm that it is a distinct offer. The resolution is a confirmed write with replay protection. Linking preserves the existing record.

Accepted files move to `accepted`; rejected bytes move to `rejected` beside a sanitized `.error.json` diagnostic. Partial `.tmp` files are ignored. Failed batches cannot partially create offers. Files retained on disk are not included in portable exports; accepted proposal contents and outcomes are retained in SQLite and portable v7. Rejected files remain available for manual correction/re-enqueueing. Complete backups retain the SQLite ledger through the existing encrypted mechanism.

Old portable v7 exports with no daily data remain valid. v1-v6 restore with no invented proposals or receipts. Older exports refuse to lose daily provenance. Restoration validates receipt hashes, outcomes and offer provenance links.

## Dashboard rules

The order is KPI, today's tasks, pending offers and recent activity. Sent dossiers use the selected 7/30/90-day inclusive period, default 30 days, based on documented send dates. A dossier counts once within the period. Waiting dossiers require a dated send and no subsequent documented response; closed/advanced statuses are excluded. Upcoming interviews use planned dates from today onward, never realized-event counts. Due follow-ups use current open actions or unowned source deadlines, without double counting managed reminders.

Preparing dossiers without a send are resumable directly. A historical applied status without a send date is unknown, not an unfinished application. Downloads and preparation never increase sent counts. Missing history is explained in secondary details. Source statistics remain in the strategy review rather than the dashboard.

External daily scores retain date, method, source and justification. Confirmed JobPilot evaluations are labelled separately; evaluations against changed posting text are historical. Offers support decision filters, date/score sorting, direct preparation, postponement and rejection. Preparation reuses one dossier and does not require AI.

The open interface refreshes read-only data every 30 seconds while visible and idle, only when no unsaved draft or blocked write exists. Drafts prevent background refresh; explicit synchronization remains available. Client and worker intervals are closed with their respective lifecycle.

## Existing task transition

The inspected task is `recherche-emploi-quotidienne` (Recherche emploi quotidienne), currently active at its existing daily schedule and still using the CSV as its primary registry. Its live configuration is deliberately preserved until the CSV/base reconciliation and adoption are checked by the user. No actual personal-data migration is performed by this code delivery.

After that confirmation, update this existing task using the app automation tool, preserving its ID, schedule, model, search constraints and notification policy. Replace CSV writes with the index/enqueue contract. The proposed instructions are in [daily-task-handoff.md](daily-task-handoff.md). Do not create a second task or write SQLite directly. Verify a real received batch after the transition before declaring the integration active.

## Validation

Only synthetic sources, isolated databases and simulated providers are used. Tests exercise transaction rollback, replay, changed-batch refusal, duplicate URLs, ambiguity resolution, corrections preserved, restart/periodic ingestion, invalid/oversized/partial files, index privacy, portable restore and deterministic KPI calculations. Browser checks cover desktop/mobile, keyboard, dark theme, external score provenance, explicit resolution, original CV default, preparation reuse without sends and a new proposal appearing without reloading. Independent PR review must be requested; this documentation does not claim its approval.

Recorded validation: the complete suite passed 156/156 tests. A final additional unavailable-inbox regression was added and checked with the relevant runtime/inbox tests. TypeScript, module boundaries and production build passed; Vite retains its existing large-chunk warning. Temporary browser/server processes and identified children were closed, and the pre-existing user instance on port 5173 was preserved. Local self-review corrected historical-status handling and ensured reception failures do not block manual work. Independent review remains requested separately.
