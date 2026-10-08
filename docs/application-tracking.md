# Dated application milestones

Application status describes the current workflow position. It is not evidence that an
application was sent, that an interview occurred, or that a reply was received.

The `events` array stores explicitly recorded `sent`, `response`, `interview`, `offer`
and `refusal` milestones, each with a stable identifier, a real calendar date and its
provenance. Users can add, correct and remove milestones independently of status.
Changes use the existing confirmed write queue and revision checks. Failed or
conflicting writes retain the form draft; no write is retried automatically.

Existing `appliedAt` dates are exposed as `legacy-date` sent milestones. No dates
are inferred from current status, creation timestamps or free-text history entries.
An incomplete history remains incomplete even after adding a milestone. Only an
explicit user attestation sets `eventHistoryComplete` to true. This flag does not
manufacture any event and does not certify external evidence.

Counters count unique applications with documented milestones, regardless of their
current status. Interview and response rates use applications with a dated send as
their denominator and only outcomes documented for those same applications as
their numerator. An interview with no known send date remains visible in the
interview counter but does not distort that rate. Refusal never removes a documented
send or an earlier interview. Missing milestones are unknown, not negative outcomes.

CV analyses and letter drafts created from an application route preserve its
`applicationId`. Existing unlinked analyses are not matched by guessed text. Deleting
an application preserves existing analysis records and their historical identifier;
the server rejects newly fabricated links to absent applications.

Events and links live inside the existing SQLite JSON records, so portable v1/v2
snapshots and encrypted full-database backups preserve them without a destructive
schema migration. Event schemas and dates are checked on API writes and portable
restoration. No real user database is modified by the tests.

Validation: run `node --test tests/*.test.mjs`, TypeScript and the Vite build, then
exercise creation, event correction/deletion, refusal, linked manual CV/letter
drafts, two-tab conflicts and offline recovery against a disposable database.
