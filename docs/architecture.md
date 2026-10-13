# Module boundaries — lot 2

JobPilot remains a React / Express / SQLite monolith. HTTP payloads, revisions,
write receipts, backup formats and business rules are unchanged in this lot.

## Ownership

- `shared/domain`: framework-independent calculations, validation and prompts.
- `shared/contracts`: domain contracts, including document prefill provenance.
- `src/features`: offers, applications, documents, planning, activity, dashboard
  and settings pages and their feature components.
- `src/shared/ui`: Tailwind visual primitives (button, field, badge, panel and
  page heading). These do not import feature state or persistence.
- `src/components`: application shell and cross-feature navigation/draft guards.
- `server/modules/ai/service.mjs`: provider dispatch, source validation, attempt
  journaling, concurrency, response validation and timeout handling. The app
  registers the existing authenticated `/api/ai` endpoint with this service.
- Existing server persistence and document adapters remain in `server`; further
  route/service/repository separation is incremental, not a completed rewrite.

The server cannot import `src`. Shared code cannot depend on frameworks or on
server/UI modules. Shared UI primitives cannot depend on feature modules. The
TypeScript parser checks static imports, re-exports, import types, `require` and
literal dynamic imports. Run `npm run check:architecture`; the build also checks
these rules. Regression tests exercise forbidden imports as well as this tree.

Previous `src/*.mjs`, declarations and domain contract entry points re-export the
shared modules for compatibility. New code should import the shared owner directly.
Status colors stay in the UI adapter, outside business contracts.

## Visual system

Tailwind 4 was already installed and configured through the Vite plugin. No second
styling dependency is added. Tokens and Tailwind component classes live in
`src/index.css`. The approved prototype supplies the light canvas, white sidebar,
indigo primary actions, compact typography and spacing. Dark theme and mobile
navigation retain the existing behavior. Common button and field wrappers preserve
native props, refs, labels, disabled states and existing submission semantics.

Four primary links are visible: dashboard, offers, applications and documents
(currently the existing `/profil` page). Historical tools and URLs remain accessible.
Existing documented indicators appear first, in a compact responsive grid; their
calculations are unchanged. The new dossier workflow and dashboard metrics are subsequent lots: this change
does not claim that the prototype's synthetic behavior has been integrated.
