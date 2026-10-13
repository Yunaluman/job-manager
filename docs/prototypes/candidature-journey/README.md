# Candidature journey prototype — lot 1

This is a standalone product prototype, not an integrated application or a migration. It uses synthetic data only. It does not call application APIs, AI providers, storage or external job sites. Reloading resets all drafts and mock declarations.

## Open and review

Run `node docs/prototypes/candidature-journey/build-preview.mjs` to create the self-contained preview at `output/jobpilot-prototype.html`. It embeds the styles, scripts and synthetic downloads. It works offline as a local HTML file or through the existing Vite instance. The modular source `index.html` can alternatively be served by a plain static server; Vite's ignored-worktree module handling is unsuitable for that source entrypoint.

If JobPilot runs on port 5173 in the parent repository, the worktree preview is available at:

`http://127.0.0.1:5173/@fs/C:/Projects/job_manager/output/journey-redesign/output/jobpilot-prototype.html`

No additional server is needed in that case. Do not stop the existing user instance for validation.

## Review flow

1. Dashboard: four KPIs first, today's actions, offers and recent activity.
2. Offers: filter or search, examine matches and unknowns, prepare one dossier. Preparing the same offer reopens its dossier.
3. Preparation: original CV first, optional letter. Type a draft, switch tabs and return; it stays in memory.
4. AI proposal: simulated suggestion requires acceptance before replacing the draft. The error scenario refuses generation and retains the draft.
5. Follow-up: confirm a mock send with a date, channel and optional letter; add a response, planned interview or reminder. No external action is sent.
6. Documents and AI activity: inspect the proposed library and diagnostic presentation.

The footer switches normal, empty, loading and error states. The sidebar switches light/dark themes. The mobile menu and dossier tabs support keyboard navigation.

## Deliberate prototype limits

- PDF and DOCX buttons download fixed, labelled synthetic specimens. They do not reflect text edits, company changes or date changes made in the prototype. The enlarged letter preview reflects the current draft, but is an HTML reading preview, not the final PDF renderer.
- CV preview and selection use the one synthetic original. Real upload, alternate CV selection, AI calls, search-task integration, durable storage, CSV adoption and exports of edited content belong to subsequent lots.
- The reference date is October 13, 2026. No automatic live date, reminder, provider quota or real history is inferred.
- Presentation fields are read-only examples. Real document forms remain untouched.
- The activity page shows invented diagnostics, clearly marked as such; it does not explain the user's real 403.

Generate the sample documents with `node docs/prototypes/candidature-journey/generate-samples.mjs`. This calls only the existing local renderers.

## Delivery gate

Product review of the dashboard, offers and dossier layout is required before lot 2. Lot 1 must not imply approval of the final design or completion of the full implementation plan. No automatic merge.

Validation evidence and review status are recorded in `validation.md`.
