# Candidature journey

## Lot 1: offers and decisions

Offers are collected manually with a pasted body and optional HTTP(S) link. Field suggestions are local and require review; no fetch or paid extraction occurs implicitly. Search criteria distinguish required constraints and preferences. Qualifications retain exact offer/CV source text, manual criterion assessments including unknowns, and optional indicative analysis with declared provenance. A score is never an automatic decision or measured hiring/ATS probability.

An explicit go decision creates one dossier in `a_postuler`, without a sent milestone/date or planning action. Later/rejected decisions remain offer records; rejection requires a reason. Changing the offer or criteria does not rewrite saved qualifications or dossier snapshots. All writes use confirmed revision/receipt transactions; orphan dossier links are retained and cannot silently generate replacements.

Portable snapshots default to v4, including the journey collections. Legacy v1/v2/v3 restores initialize empty collections; old exports refuse to omit new records. Document/version/submission tables are reserved empty in this lot so the v4 envelope remains stable across subsequent lots. All API routes remain session-protected. SQLite backup includes these tables without changing the encrypted envelope.

Next lots add structured letters/exports, structured CVs, then the unified dossier and explicitly declared sends. Each is delivered as a reviewed/fixed dependent PR toward development, with no automatic merge. Only synthetic sources, isolated databases and provider mocks are used for validation.
