# AI diagnostics validation — lot 3

PR #26 was merged into `development` at `423385e`. The `shared` tree matches the
accepted lot 2 commit. PR #24 is extended on that base, with its old app-level
handler conflict resolved by retaining the extracted service and applying the
diagnostic behavior there.

## Automated checks

- 143/143 tests passed in the serial full suite (133.52 seconds).
- 18/18 targeted provider and monitoring tests passed.
- TypeScript, import-boundary checks and production build passed. The existing
  document-library chunk-size warning remains.
- Recognized and unknown refusals, non-JSON responses, invalid structured output,
  timeout/transport, startup interruption and journal failures are simulated.
- Tests verify durable diagnostics after app restart, public activity metadata,
  v7 roundtrip, v1–v6 compatibility and refusal of lossy old-format exports.
- Closed diagnostic schemas and secret-bearing reference tests reject raw or
  unrecognized content. No prompt, CV, generated letter or key enters telemetry.

## Browser checks

Playwright CLI drove Chrome against an isolated in-memory database with synthetic
identity, offers and credentials. The provider returned a simulated 403 with
`tier_not_allowed`; this is not evidence about the user's provider account.

The successful ten-check flow verifies a corrected letter retained on failure,
subsequent manual save, PDF and DOCX downloads, displayed code/explanation,
explicit unknown cost, diagnostic retained after page reload, no mobile page
overflow at 390×844, one provider dispatch per explicit operation and no browser
runtime errors. Desktop checks used 1440×960. Activity tables retain their local
horizontal scroll on small screens.

Browser fixtures, downloads and screenshots are ignored local artifacts under
`output/playwright`. Earlier selector corrections and repeated fixture-only
operations do not represent retries by JobPilot. No paid call or personal write
was made. The actual historical 403 cannot be reconstructed.

## Review and processes

This is an auto-review; independent review is requested on PR #24 and is not
claimed obtained. No automatic merge of lot 3.

The dedicated browser daemon/Chrome children and fixture server/esbuild child
were recorded and confirmed stopped. The user's JobPilot instance on port 5173
returned HTTP 200 after cleanup and remains active as requested.
