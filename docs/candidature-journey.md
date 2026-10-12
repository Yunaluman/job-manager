# Candidature journey

## Lot 1: offers and decisions

Offers are collected manually with a pasted body and optional HTTP(S) link. Field suggestions are local and require review; no fetch or paid extraction occurs implicitly. Search criteria distinguish required constraints and preferences. Qualifications retain exact offer/CV source text, manual criterion assessments including unknowns, and optional indicative analysis with declared provenance. A score is never an automatic decision or measured hiring/ATS probability.

An explicit go decision creates one dossier in `a_postuler`, without a sent milestone/date or planning action. Later/rejected decisions remain offer records; rejection requires a reason. Changing the offer or criteria does not rewrite saved qualifications or dossier snapshots. All writes use confirmed revision/receipt transactions; orphan dossier links are retained and cannot silently generate replacements.

Portable snapshots default to v4, including the journey collections. Legacy v1/v2/v3 restores initialize empty collections; old exports refuse to omit new records. Document/version/submission tables are reserved empty in this lot so the v4 envelope remains stable across subsequent lots. All API routes remain session-protected. SQLite backup includes these tables without changing the encrypted envelope.

Next lots add structured letters/exports, structured CVs, then the unified dossier and explicitly declared sends. Each is delivered as a reviewed/fixed dependent PR toward development, with no automatic merge. Only synthetic sources, isolated databases and provider mocks are used for validation.

## Lot 2: structured letters and exports

Each confirmed save appends an immutable document version with structured fields, presentation settings, source text and a versioned template. Editing a previous version creates a new draft; ready is a human choice. Documents are separate from dossier/CSV records, and historical links survive dossier deletion. Legacy letter text is copied only after an explicit user command, with optional headers hidden initially; original analyses remain untouched.

Authenticated read-only exports generate DOCX (Calibri) and PDF (bundled Carlito with OFL license) in memory. A4, shared font sizes and margins, field visibility and paragraph ordering are applied by both renderers. The preview renders the actual generated PDF and supports enlarging it on mobile. Downloads do not record sends, complete actions or update application status. Subsequent external edits are unknown to JobPilot.

Regression coverage exercises immutable versions, concurrent writes, receipt replay, rollback, invalid dossier links, authenticated exports, accents and multi-page final paragraphs, portable v4 and encrypted backups. The PDF was visually checked in the browser; Word text/OOXML is covered but native visual rendering needs LibreOffice or Word on the validation machine. No document bytes are archived by the application.

## Lot 3: structured CVs and independent variants

Profile CV documents contain editable identity/contact/title, presentation, repeatable experience/education, skills, languages and links. Sections can be reordered/hidden and entries reordered. PDF/DOCX import preserves source text for manual verification; it does not infer a trustworthy structure or recreate a layout. The server clones a selected immutable CV version into a new candidature document; model changes never propagate. Both export renderers use the same ordered visible sections.

Qualifications and CV analyses can select a precise version. The server derives its visible text, verifies the dossier link and stores the exact source. Offer qualifications reject source changes since analysis, and portable restoration validates CV references. Indicative prompts expose documented matches, missing evidence and unknowns without asserting measured ATS compatibility; selected source text is not silently clipped. Old analyses and unstructured source workflows remain available.
