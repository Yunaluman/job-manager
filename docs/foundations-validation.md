# Foundations validation — lot 2

## Scope

The approved prototype PR #25 was merged into `development` at `10b490f` before
starting this lot. Tailwind 4 was already installed; the production shell and
shared primitives now adopt the prototype's palette and compact presentation.
Business rules, HTTP contracts and persisted formats remain unchanged.

## Deterministic checks

- TypeScript passed after relocation and UI integration.
- Production Vite build passed; existing document-library chunk-size warnings
  remain. The final build includes the last dashboard layout adjustment.
- Architecture checks reject server-to-interface imports, shared-to-framework
  imports, component import types in contracts and feature imports in primitives.
- The first serial suite had 135/136 passing tests and one `ECONNRESET` in the
  Windows encrypted-original backup test. Its whole file passed 4/4 on isolated
  rerun. The second serial full-suite run passed **136/136**, with no build or
  browser running concurrently (108.98 seconds).

## Real browser checks

The Playwright CLI drove Chrome against an isolated, in-memory SQLite instance
on port 5319. Fixtures identify Alex Martin, Atelier Numérique, Horizon Data and
Studio Synthétique. No personal data, real register or paid provider was used.
Provider dispatch was injected with a synthetic 403 response.

- 1440×960 dashboard and application dialog: no horizontal overflow.
- 390×844: dashboard, offers, applications, profile, actions, AI activity and
  settings have no horizontal overflow.
- Mobile Escape closes navigation and restores the menu button's focus.
- Historical profile URL and other tool routes still load.
- A simulated provider refusal retains the analysis source draft.
- Light and dark themes apply; indigo primary-action colors were inspected.
- A synthetic application form saves and remains visible after page reload.
- Existing documented indicators appear before quick actions. Their calculations
  are deliberately unchanged; the new period/current-state KPIs belong to lot 6.
- No browser runtime errors occurred during the successful 15-check flow.

Screenshots are local ignored artifacts in `output/playwright/foundations-*`.
Fixed synthetic document exports belong to the prior prototype; this lot does
not claim to implement the unified dossier or change exports.

## Review and cleanup

This is an **auto-review**, not an independent review. Independent review is
requested on the lot 2 PR before merge, particularly for import boundaries,
preserved native form semantics and AI-service extraction.

The dedicated browser daemon, Chrome children, fixture server and esbuild child
were identified and confirmed stopped. JobPilot on port 5173 returned HTTP 200
after cleanup and remains running as requested. No temporary browser or fixture
server is intentionally left active. No automatic merge of this lot.
