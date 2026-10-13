# Planned interviews

Planned interviews are independent local records with an explicit Paris calendar day and a manually declared source. They are not historical milestones. Creation, rescheduling, closure, cancellation and reopening never change applications, their events, CSV projections, documents or submissions. A closed follow-up does not establish that an interview happened.

## Storage contract

`interview_plans` is an additive SQLite table. `GET /api/state` includes `interviewPlans`; `GET /api/interview-plans` reads the collection and `PUT /api/interview-plans/:id` confirms an edit using the shared session, revision and atomic receipt protocol. Each edit appends a server-generated history entry containing the full values. The dossier identifier is immutable. Existing orphan links survive deletion; new missing links are refused. No delete route exists.

Actions can explicitly reference an interview through `interviewPlan: { id, scheduledDate }`, retaining the date observed when linked. This reference requires the same dossier and `prepare-interview` kind, cannot coexist with source-follow-up ownership, and permits at most one open preparation per interview. Rescheduling an interview never changes an action. Completing preparation never closes the interview.

Portable snapshots default to v5. Versions 1-4 restore with an empty interview collection; older exports refuse to discard interview records, references or read confirmations. Full encrypted SQLite backups preserve the table without changing the DPAPI envelope. No legacy date or status is converted into a plan.

## Validation

`tests/interviews.test.mjs` uses synthetic in-memory/temporary databases and a provider that refuses all calls. It checks provenance/calendar validation, immutable dossier links, lifecycle history, stale revisions, receipt replay, atomic rollback, unique preparation ownership, orphan handling and portable/encrypted restoration. Existing future milestones remain untouched.

The management interface and reminders are delivered in subsequent dependent PRs. Each part requires review and correction before the next part; no automatic merge.
