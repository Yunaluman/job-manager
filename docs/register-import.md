# Read-only candidature register import

The existing candidature CSV is authoritative for imported dossiers. JobPilot is a
dated, read-only projection of explicitly selected rows, not a second writable
register. This feature never writes the source file, sends an application, contacts
an employer or calls a paid AI provider. Local dossiers created independently remain
editable; adopting one into the CSV register is an explicit reconciliation decision.

## Preview and reconciliation

The Settings page accepts UTF-8 (with or without BOM), semicolon CSV files up to
2 MB and 5,000 rows. Quoted delimiters, doubled quotes and multiline cells are
preserved. The known register columns are required; additional evidence columns
are retained verbatim. Malformed syntax and unknown statuses fail closed. Invalid
row identifiers, dates and URLs are visible in preview and cannot be selected.

Identifiers use `YYYY-NNN`. Existing external identifiers are the stable refresh
key. Company/title/location normalized for case, accents and punctuation provide
possible matches; matching URLs are additional candidate evidence. Similarity
never commits a match. No row is selected automatically. Reusing one target for
two rows or overwriting a different register identifier is rejected. Creating a new
dossier despite a possible duplicate requires explicit distinctness confirmation.

Before confirmation, the UI shows original cells, status, candidate dossiers and
the fields that reconciliation replaces, including dated events. Adopting a local
dossier preserves its internal ID, original creation timestamp, local enrichment
fields not represented by the CSV, free-text history and analysis links. Already
documented local milestones are retained as an immutable historical archive with
their original dates and provenance, including interviews absent from the CSV schema.
Identical CSV/local milestones are displayed once. Archive entries remain available
across refreshes and cannot be edited as a second register. Source business fields
and source-derived milestones become governed by the CSV. Original data remains
recoverable from the verified pre-import encrypted backup.

The file's SHA-256 is computed from the original UTF-8 bytes, including a BOM when
present. The original row cells have a separate checksum. These checksums identify
content; they do not prove the source's author or independently verify a job offer.
Imported dossiers display source name, external ID, import time and original cells.
CV and letter paths are shown as text; no external file is opened automatically.

Unchanged rows are reported and not rewritten. Rows missing from a newer file are
listed and their previous dated copies are retained; no inferred deletion, refusal
or archive transition occurs. Partial imports leave unselected dossiers unchanged.
The UI explicitly describes projections as imported copies, not live synchronized data.

## Status and date semantics

The original status string is retained and displayed. `a_preparer`, `postule`,
`sans_reponse`, `relance`, `entretien`, `offre` and `refus` map to appropriate
internal workflow positions. `abandonne` and `ecarte` retain separate archived and
excluded dispositions and Kanban columns; they do not become actionable leads or
due follow-ups. Historical dated sends still count after abandonment or refusal.

Dates accept ISO `YYYY-MM-DD` or explicit `DD/MM/YYYY` and must be real calendar
dates. Only named source dates generate milestones: `date_candidature` is a send,
`date_reponse` a response, and optional `date_entretien`, `date_offre`, `date_refus`
columns generate the corresponding event. Refusal status does not manufacture a
dated refusal from a response date. No date is inferred from status or import time.
All imported histories remain explicitly incomplete. CSV status changes therefore
never erase a previously documented local interview or send.

## Persistence and protection

`POST /api/register/preview` requires the local session but makes no database
mutation and returns the revision associated with the preview. The client must
recompute an outdated preview; it never silently reapplies old reconciliation choices.

`POST /api/register/import` uses the existing revision and operation receipt
protocol. Preflight rejects stale requests before backup and replays identical
receipts without additional backups or writes. The server verifies a DPAPI-encrypted
full SQLite backup before committing the selected projections atomically, rechecking
the revision after the asynchronous backup. Backup or database failure leaves data,
revision and receipts unchanged. A concurrent edit during backup prevents the import.
No automatic retry occurs; failure keeps the preview and selected choices for
explicit synchronization and recomputation.

Generic application PUT, DELETE and bulk replacement endpoints cannot edit,
forge, unlock or remove imported projections. Their status and event controls are
read-only in the UI. CV analyses and letter drafts can still be explicitly linked
to a projected dossier because they are local derivative artifacts, not a competing
application register. Portable v1/v2 and encrypted backups include projections;
portable restoration validates source hashes and the mapped business fields.

## Validation

Deterministic fixtures cover parser edge cases, original-cell preservation, duplicate
IDs and identities, status/date mapping, explicit adoption, stable refresh, missing
rows, immutable API guards, stale revisions, operation replay, backup failure,
transaction rollback and portable/encrypted restoration. The actual existing CSV
was parsed read-only: 31 rows, no invalid rows or duplicate identities, and its
SHA-256 remained unchanged. It was not imported into the user's real database.

Browser checks on a disposable database covered file selection, a 25-row paginated
preview with one invalid date, explicit adoption and three new dossiers, verified
pre-import backup, unchanged rows and stable refresh, blocked unconfirmed duplicates,
read-only dossier controls and separate archived/excluded Kanban groups. The adopted
dossier kept its dated interview and two linked manual artifacts. Two-tab conflict
and actual server shutdown retained the preview and choices; explicit synchronization,
recomputation and confirmation completed recovery without automatic retry.

The production bundle was checked in light/dark modes at 390, 768 and 1440 pixels
for the dashboard, applications, CV, letter and settings routes, with no global
horizontal overflow. Dossier and confirmation-window dimensions were checked at
the same widths; mobile Kanban screenshots verified both themes. These checks do
not constitute a complete accessibility audit or independent human review.
