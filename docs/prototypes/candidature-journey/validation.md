# Lot 1 validation

## Executed

- Browser: isolated Playwright CLI session `jobpilot-prototype`, Chrome, viewport 1440 × 960 and mobile 390 × 844.
- 24 browser acceptance checks passed: dashboard KPI order, desktop overflow, offer search/category filters, draft retention across pointer and keyboard tab navigation, preserving corrections when declining a simulated proposal, accepting a proposal, original CV download, letter PDF/DOCX downloads, reopening the same dossier, explicit send confirmation, source CV reference, confirmed-send-only KPI increments, four scenario states, mobile offers/applications/documents/dossier overflow, mobile Escape focus restoration, error and recovery draft retention.
- Synthetic downloads were compared byte-for-byte and SHA-256 with their source specimens; all three match.
- Both sample PDFs were parsed locally: one page each, expected synthetic identity present, no replacement character in extracted text.
- JavaScript syntax checks passed for the prototype, fixtures and standalone-preview builder.
- The self-contained preview reports no browser console errors or warnings. The original modular file route was unsuitable for Vite's ignored worktree handling; the standalone builder removes that dependency and embeds all resources.
- Desktop dashboard, offers, dossier and mobile dashboard/dossier screenshots were visually inspected. Light and dark presentations were captured. This is not a comprehensive accessibility certification or a native Word pagination check.

## Corrections from local review

- Preserve keyboard focus on the selected dossier tab after rerender.
- Show the offer score in the mobile dashboard even when the desktop score column is hidden.
- Preserve only the letter explicitly selected in the mock send's document list.
- Label the export actions clearly and disclose fixed synthetic specimens and session-only drafts.
- Use a self-contained preview so the user can inspect it without an additional persistent server.

## Artifacts

Local artifacts are in `output/playwright/`: browser-check results, downloaded specimens and `prototype-*.png` screenshots. The portable preview is `output/jobpilot-prototype.html`.

## Review and boundaries

Local self-review completed. Independent review and user product review remain pending. No automatic merge. Lot 2 waits for product feedback on this concrete prototype.

Only synthetic fixtures and the existing local document renderer were used. No paid provider calls, application API writes, CSV changes, personal-data imports or production-route modifications occurred. The user's JobPilot instance on 5173 is reused for read-only delivery of the standalone HTML and remains active. No temporary server was started. The separate control browser was closed. Its daemon PID 21160 and all eight identified descendant processes were confirmed absent afterward.
