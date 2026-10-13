# Planned interviews

Planned interviews are independent local records with an explicit Paris calendar day and a manually declared source. They are not historical milestones. Creation, rescheduling, closure, cancellation and reopening never change applications, their events, CSV projections, documents or submissions. A closed follow-up does not establish that an interview happened.

## Storage contract

`interview_plans` is an additive SQLite table. `GET /api/state` includes `interviewPlans`; `GET /api/interview-plans` reads the collection and `PUT /api/interview-plans/:id` confirms an edit using the shared session, revision and atomic receipt protocol. Each edit appends a server-generated history entry containing the full values. The dossier identifier is immutable. Existing orphan links survive deletion; new missing links are refused. No delete route exists.

Actions can explicitly reference an interview through `interviewPlan: { id, scheduledDate }`, retaining the date observed when linked. This reference requires the same dossier and `prepare-interview` kind, cannot coexist with source-follow-up ownership, and permits at most one open preparation per interview. Rescheduling an interview never changes an action. Completing preparation never closes the interview.

Portable snapshots default to v5. Versions 1-4 restore with an empty interview collection; older exports refuse to discard interview records, references or read confirmations. Full encrypted SQLite backups preserve the table without changing the DPAPI envelope. No legacy date or status is converted into a plan.

## Validation

`tests/interviews.test.mjs` uses synthetic in-memory/temporary databases and a provider that refuses all calls. It checks provenance/calendar validation, immutable dossier links, lifecycle history, stale revisions, receipt replay, atomic rollback, unique preparation ownership, orphan handling and portable/encrypted restoration. Existing future milestones remain untouched.

## Management interface

The dossier summary and Actions page expose planned interviews, declared sources, immutable change history, closed/cancelled follow-ups and orphan links. Dates are day-only. A past date remains an unknown outcome, not a missed or completed interview. Refused/inactive dossiers are flagged without cancelling plans. Similar same-day plans are warned about but never merged.

Forms preserve drafts on failure or conflict. After synchronization, concurrent changes are displayed alongside the draft for explicit comparison; nothing is automatically retried or merged. Preparation reuses existing actions and keeps the date captured at attachment visible after a report.

## Reminders

Interview reminders reuse the existing shared Paris day clock and notification center: tomorrow, today, then **past date — realization not recorded in this follow-up**. Their stable identity is independent of preparation actions. Reading never closes either record; completing preparation never suppresses the appointment reminder. Changing the planned day or state clears obsolete read confirmation in the same transaction. Returning to an earlier date or reopening makes the reminder unread again. New confirmations for resolved or outdated alerts are refused; identical operation replay retains the original acknowledgement.

Closed/cancelled follow-ups have no reminder. Refused/inactive dossiers and orphan links do not imply cancellation. Orphan notifications link to the preserved follow-up in Actions. The dashboard counts past interview follow-ups separately from overdue tasks; an explicit planned interview supplies an existing follow-up instead of adding its dossier to the decision queue. Planning, action, journey and notification results are hidden during loading, uncertain writes and synchronization errors rather than displayed as false zeros.

There is no background service, system notification, provider call or automatic event conversion. Historical interview milestones, response metrics and Bilan calculations remain separate.

## Verified on 2026-10-13

- Complete suite: 116 tests passed. The 11 interview tests include real Windows DPAPI backup/restore, v1-v5 compatibility, source-date validation, same-day distinct appointments, receipt replay, stale read refusal, rollback, CSV refresh, orphan handling and byte-for-byte preservation of dossier records plus immutable document/submission collections.
- TypeScript and final production build passed; the existing Vite large-chunk warning remains.
- Synthetic production-browser checks at desktop 1440x1000 and mobile 390x844 covered invitation creation, preparation linkage, rescheduling without shifting preparation, closure/reopening, unchanged historical milestones, concurrent draft preservation and latest-value comparison, keyboard focus wrapping, distinct reminder identities/read confirmations, past-date wording, CSV-local provenance, inactive/orphan follow-ups and notification navigation.
- A real synthetic-server stop/restart preserved the browser draft; explicit synchronization renewed the session and a subsequent confirmation saved it. Separate injected loading/failure checks displayed unavailable state and recovered through synchronization. No real CSV, personal database or paid provider was used.
- Local review corrected restored preparation-date provenance, exposed concurrent confirmed values next to drafts, and hid unconfirmed zero counts. Independent review has not been performed. Each dependent PR remains unmerged.

The two temporary control tabs were closed and the viewport override reset. All three fixture-server PIDs used during restart checks were absent at cleanup; no identified children or listener on the control port remained. Existing services were preserved.
