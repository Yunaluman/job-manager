# Daily actions and in-app notifications

Actions are independent planning records. Completing one never changes an application's status, documented milestones or imported CSV projection. The Actions page includes overdue, today, Monday-Sunday week, later, undated and closed records. General actions and historical links to deleted dossiers remain editable; detach an obsolete link through the form. Every confirmed edit appends a dated history entry. Cancellation is preferred to deletion; no delete endpoint is provided.

Dates are explicit calendar days in Europe/Paris. A shared minute timer, focus and visibility listeners refresh the day; all are cleaned up on unmount. No background service, OS notification or external message is created. Notifications are derived from confirmed state, with one stable identity per action/source, progressing tomorrow → today → overdue. Reading never completes a task; escalation makes the same card unread again. Rescheduling, closing and reopening invalidate the action's prior read confirmation.

Source follow-up dates are consultable without generating tasks. Explicitly preparing a source action preserves the originating dossier/date, and assigns reminder ownership to that action. A completed/cancelled source action resolves that source date; a changed source date becomes eligible again after closure. An open source action continues to own its reminder when the source date changes; the discrepancy is displayed and its local date is never shifted automatically. CSV data is a dated imported copy, not live data. Dossiers without an open local action or source date appear in one decision list, excluding refusals and inactive CSV projections. Offers requiring a decision stay visible.

## Persistence

`actions` and `notification_reads` are separate SQLite tables. Initialization only adds tables; it does not rewrite dossiers or the register. `GET /api/state` includes both collections. `GET /api/actions` and `PUT /api/actions/:id` read/write tasks; `GET /api/notifications` derives alerts; `POST /api/notifications/read` confirms selected identities/date/stage. Writes use the local session, global revision and atomic operation receipts. Replaying a receipt does not append history. Invalid/new missing links, duplicate source ownership and stale notification confirmations are refused. Existing orphan links are retained. Forms preserve drafts on failure and expose synchronization after a conflict.

Portable snapshots default to v3, retaining both planning collections. v1/v2 restores create empty planning tables. Exporting v1/v2 is refused when it would omit actions or read confirmations. Full encrypted SQLite backups also retain both tables; no credentials are added to portable JSON. Existing persistence, backup and uncertain AI cost warnings remain contextual.

## Verification

`tests/actions.test.mjs` covers calendar/DST/week boundaries, priority ordering, alert escalation and ownership, invalid inputs, orphan links, two clients at the same revision, receipt replay, write rollback, immutable CSV copies, lifecycle history, legacy initialization/restores, portable v3 and encrypted backup restoration. Tests inject a provider that refuses all calls and use memory/temporary databases and synthetic CSV only.

## Subsequent lots

1. Targeting and offer qualification: explicit search criteria, constraints, priorities and exclusion reasons; manual offer collection first.
2. Strategy review: implemented as a read-only factual comparison of periods, existing job titles and sources, with sample sizes, delays and missing data visible. See [strategy review](strategy-review.md). Counts alone do not justify where to invest time.

Employer-response, interview and offer-expiry notifications require explicit, sufficiently precise source data. A status must never fabricate an event. Each future lot requires its own reviewed/fixed PR.
