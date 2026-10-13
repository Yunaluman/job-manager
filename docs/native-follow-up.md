# Native candidature follow-up

This delivery implements journey redesign lot 5. JobPilot can adopt reviewed CSV copies as editable dossiers while retaining their immutable register provenance. No real register or automation is switched by deploying this feature.

## Adoption and compatibility

Use the existing CSV preview and reconciliation before importing copies. In Settings, review each selected copy's original cells, identifiers and dates, then explicitly confirm adoption. The authenticated adoption operation verifies an encrypted backup before its revision/receipt transaction. A replay does not repeat adoption or backup. An intervening write rejects adoption without changing the dossiers.

Adoption retains external identifiers, raw cells, fingerprints and dated evidence. A status without a date never becomes a sent or response event. Adopted copies reject further CSV replacement and provenance edits; their deletion is deliberately unavailable. Unadopted copies remain read-only. Historical document paths are references, not imported files.

The compatible CSV download includes original columns and identifiers, current native fields and only documented event dates. Unknown values stay blank. Existing historical document paths remain until a new declaration identifies different documents. Exporting does not write the source CSV or change the existing daily task. The daily-task transition remains a later explicit step.

## Preparation and sends

The dossier remembers its selected original, immutable structured CV version or profile text independently of any letter. Without a saved choice, the retained PDF original is the default. The send confirmation asks for the actual date, channel and documents; no letter is required. An original or a global/dossier CV version can be referenced, but another dossier's variant is refused.

`POST /api/submissions/confirm` records the declaration and advances a preparing dossier to applied in one transaction. Existing advanced statuses are preserved. The older declaration endpoint retains its status-independent behavior. Opening an offer or downloading a document does not declare a send. Cancelling an erroneous declaration preserves its original reference and cancellation time; it does not automatically rewrite status.

The timeline distinguishes human declarations, immutable register dates, retained archives and new JobPilot entries. Responses and follow-ups are separate dated events. A follow-up never counts as an employer response. Save failures preserve inputs; synchronization after a revision conflict does not discard the confirmation draft.

## Portable data and validation

Portable v7 includes adoption markers, preparation choices and declaration references/channels. Older exports refuse these fields rather than dropping them. v1-v6 restoration keeps absent values absent. Reference validation refuses missing originals, invalid source selections and mismatched document versions.

Validation uses synthetic files, in-memory SQLite databases and simulated providers. Automated checks cover adoption, backup/receipt replay, immutable provenance, preserved human corrections, rollback, source selection, CV-only declarations, cross-dossier rejection, v7 restoration, old-format refusal and response metrics. Desktop/mobile browser checks cover explicit adoption, retained selections after reload, downloads without writes, conflict/synchronization without draft loss, CV-only confirmation, response/follow-up recording and CSV download. No paid provider call or personal-data migration is part of validation.

This is a local self-review, not an independent approval. Independent PR review must be requested separately. The daily inbox and dashboard changes belong to lot 6.

Recorded checks: the full suite passed 149/149 tests; after self-review fixes, the 18 relevant tests passed, including one added regression test (150 distinct tests overall). TypeScript, module boundaries and the production build passed. Vite retains its existing large-chunk warning. The temporary browser/server and identified child processes were closed; the user's existing instance on port 5173 was preserved.
