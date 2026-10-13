# Unified candidature preparation — lot 4

The dossier now exposes Prepare, Follow-up and Offer tabs. Legacy `summary`, `documents`, `offer` and `history` links remain usable. Panels stay mounted so switching tabs preserves drafts.

## Documents

- The latest imported PDF is the default for a new dossier without a saved letter source. Existing letter sources take precedence; originals are never reconstructed from profile text.
- Original preview and download use the conserved bytes. Structured CV adaptation remains optional and visibly distinct.
- Source selection is persisted with the saved letter version. Before saving a letter, a selection is only local to the open dossier. Independent dossier selection and original references in send declarations belong to lot 5.
- Letter drafts can be copied, previewed and exported as PDF/DOCX without saving. The authenticated rendering route does not change the revision, write a version or declare an application sent.
- Saved versions remain immutable. Each letter can retain the original ID, exact extracted text, offer text, requested model and provider. Original/text mismatches and conflicting original/structured references are rejected for writes, rendering and restoration.
- A successful AI response opens a comparison. Applying or rejecting it is explicit; errors leave the manual text intact. No automatic paid retry is performed.
- Coordinates and layout are secondary options. Existing manual preparation and exports remain available without an AI provider.

## Compatibility and validation

Portable v7 retains generation provider provenance. Earlier exports/restores with this new field are rejected instead of pretending to support it. Historical versions without the field remain valid.

Validation used synthetic originals, an isolated SQLite database and simulated providers only:

- 145/145 serial tests passed, including exact original/text links, immutable versions, PDF/DOCX accents and v7 restoration.
- Architecture boundaries and production build passed. Existing large-chunk warnings remain.
- 1440×960 and 390×844 browser controls: original preview, copy, draft PDF/DOCX, source selection, save/reload, tab draft retention, AI comparison acceptance/rejection, 403 retention, legacy history links and keyboard navigation.
- Clear/dark mobile layouts had no document-level horizontal overflow; no browser runtime error was observed.
- The first full test run had an ECONNRESET in the Windows encrypted-backup fixture. An isolated repeat reproduced it. The fixture now opens fresh HTTP connections so blocking Windows protection cannot race a reused keep-alive connection; the full rerun passed.

Auto-review covered source validation, no-write rendering, draft preservation during pending saves and backwards-compatible tab navigation. Independent review is requested on the PR; it is not considered obtained by these checks.

The temporary browser and fixture server were closed, including identified child processes. The existing user instance on port 5173 was preserved.
