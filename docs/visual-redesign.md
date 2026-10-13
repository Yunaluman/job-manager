# JobPilot visual redesign

## Scope and visual language

The shared shell now groups work, profile/documents and configuration. A navy sidebar, muted warm canvas, green primary actions, consistent card geometry, page hierarchy and touch-sized shared controls apply across all ten routes and dossier views. Status colors retain their meanings. No remote fonts, artwork or new dependency was introduced.

Dashboard shortcuts expose offer qualification, actions and evidence-based review. Profile starts with originals and contact details, with structured CV versions and legacy text behind native disclosures. CV editor sections remain mounted while collapsed, retaining drafts. CV analysis puts the selected result before history and separates sources from provider settings. Offers expose source/qualification/decision landmarks, a prominent weighted summary and compact criterion cards with optional source detail. The last saved qualification is explicitly identified when revisiting an offer, rather than hiding it below a new blank draft.

## Validation

- TypeScript and Vite production build passed. Vite retains its pre-existing large-chunk warning for document libraries.
- 132 tests passed with test concurrency limited to one. An earlier parallel run passed 131/132 with ECONNRESET during the encrypted-original backup test; the clean full rerun passed after stopping the browser fixture.
- All ten routes navigated on desktop 1280px and mobile 390px; document widths never exceeded viewport widths. A dossier view also passed the mobile overflow check.
- Browser checks covered light/dark themes, mobile menu/Escape/focus restoration, source import and preview, two simultaneous drafts, a single navigation guard, staying without losing edits, collapsing/reopening a CV editor, separate profile/version saves, mocked offer retrieval, reviewed qualification and explicit decision.
- Synthetic files/database and simulated providers only. No paid API call or personal-data mutation. Temporary fixture server PID 27244 and its children were confirmed stopped; the temporary browser tab closed. Existing user runtime on 5173 preserved.

Local review applied the React Best Practices skill checklist: stable keyed disclosures, native keyboard controls, retained component state, associated labels for edited source inputs, conditional heavy document rendering, and no business/API changes. Independent review remains pending. Screenshots are retained locally under output/redesign-*.png, not committed. This is a shared visual redesign and targeted UX restructuring, not a replacement of every field editor or a certified accessibility audit.
