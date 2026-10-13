# Journey redesign

## Lot 1: analysis readability and drafts

Analysis Markdown is rendered as escaped React text with headings, emphasis and lists; HTML, links and images are inert. Historical scores remain explicitly indicative. Provider/model settings show the confirmed global model and pending edits without claiming model availability.

Every editor registers its dirty state with one layout-owned navigation blocker. Staying cancels navigation without saving and retains all drafts; leaving discards the page drafts. Confirmed form saves display success; profile text and structured CV versions have separate save commands.

Validation: TypeScript and Vite build passed. The existing suite passed 115 tests; the production runtime test initially failed because no production bundle existed in the fresh checkout, then passed after building. Synthetic browser checks covered two simultaneous drafts, a single blocker, stay/leave, escaped script text and mobile 390px with document width 384px. Local review performed; no independent review yet.
