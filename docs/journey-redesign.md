# Journey redesign

## Lot 1: analysis readability and drafts

Analysis Markdown is rendered as escaped React text with headings, emphasis and lists; HTML, links and images are inert. Historical scores remain explicitly indicative. Provider/model settings show the confirmed global model and pending edits without claiming model availability.

Every editor registers its dirty state with one layout-owned navigation blocker. Staying cancels navigation without saving and retains all drafts; leaving discards the page drafts. Confirmed form saves display success; profile text and structured CV versions have separate save commands.

Validation: TypeScript and Vite build passed. The existing suite passed 115 tests; the production runtime test initially failed because no production bundle existed in the fresh checkout, then passed after building. Synthetic browser checks covered two simultaneous drafts, a single blocker, stay/leave, escaped script text and mobile 390px with document width 384px. Local review performed; no independent review yet.

## Lot 2: retained CV originals

Immutable PDF/DOCX/TXT originals (5 MiB each) live in SQLite with exact base64 bytes, SHA-256 and server-extracted text. Authenticated upload uses revisions and receipts; download returns original bytes. PDF previews render original pages. DOCX previews render an allowlisted local approximation without links/images; legacy text has no fabricated original. Portable v6 and encrypted backups retain files and document source links; older exports refuse loss.

Validation: real synthetic PDF/DOCX imports, malformed/scanned/oversized refusal, stale writes, receipt replay, atomic rollback, tamper checks, v1-v5 empty restore and real Windows DPAPI backup restoration. Browser DOCX and PDF previews checked; a PDF worker URL issue found in the browser was fixed by a static asset import and verified after reload. Local review completed; independent review pending.

## Lot 3: reviewed CV prefill

Local proposals detect explicit labels and contact details. Explicit AI structuring sends only the retained source through the monitored provider route; server/client validate strict JSON and require every non-empty value and evidence to occur in the source. Unknown fields are omitted. Selected proposals update a compared draft; optional contact application updates a separate profile draft. Only a human save creates an immutable CV version, retaining original ID, source text, proposal mode/model and applied fields. Human corrections remain allowed.

Validation: 23 targeted tests passed (prefill, originals, CV versions and AI monitoring), TypeScript/build passed, synthetic browser local/AI proposals and selective application/version save checked, with 390px mobile width 384px. Local review completed; no independent review.

## Lot 4: explicit offer collection

Pasting text suggests fields only when empty and untouched. Explicit AI extraction does not overwrite human edits and requires extracted employer/title values in the source. URL retrieval is an authenticated explicit command with pinned validated DNS addresses, checks at every redirect, HTTP(S) public ports only, a 10s deadline and 1 MiB response limit. Scripts/resources are not executed; protected, incomplete and unsupported pages fall back to manual paste. Acquisition stores initial/final URLs, time and retrieved text alongside the reviewed offer; portable v6 retains it and old exports refuse loss.

Validation: 9 targeted tests passed, TypeScript/Vite build passed. Synthetic browser checks covered paste detection, private-destination refusal, retained human employer correction, simulated retrieval and confirmed save. Mobile width 390px/document 384px. Local review corrected overwrite paths and disabled fields during async commands; independent review pending.

## Lot 5: reviewed qualification and human decision

Strict source-backed AI proposals remain separate from human evaluations. Applying a proposal marks its provenance; corrections remain manual. Confirmed writes capture criteria, source text, CV version, model and proposals. The server computes a weighted documented-match score (required 2, preferred 1), excludes unknown weights and records coverage. No evaluated criteria means no score. Required incompatibility recommends rejection; required unknown or no evaluation recommends verification; otherwise continuation. Only a separate human decision prepares a dossier. Historical narrative scores remain labelled historical.

Source/criteria changes block saving until an explicit recovery preserves the previous draft for comparison. Revision conflicts retain drafts and expose synchronization. Portable v6 validates new provenance and refuses lossy old exports; v1-v5 restore without fabricated sources or proposals.

Validation: all 132 tests passed, including canonical simulated AI responses, evidence/schema rejection, deterministic scores, stale writes, receipt replay, v6 tampering and old formats. Browser checks confirmed proposal separation, 100/100 with required unknown recommending verification, explicit qualification save, separate decision and dossier creation, model pending/confirmed state and keyboard activation. Mobile 390px/document 384px. All tests used synthetic files/data and simulated providers. Local review completed; independent review pending.

Known limits: no OCR; DOCX preview approximates layout; analysis Markdown supports headings/emphasis/lists rather than full CommonMark; public-page extraction is intentionally conservative and may require manual paste. Original files remain locally unencrypted, like existing CV data; complete backups remain encrypted. The Vite build reports large document-rendering chunks.
