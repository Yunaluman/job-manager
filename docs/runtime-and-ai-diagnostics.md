# Runtime and AI diagnostics — lot 3

## Start and stop

Use `npm run dev` for the local development instance on `127.0.0.1:5173`.
For a production instance, run `npm run build`, then `npm run server` (port 3001).
Keep one instance per database. The server reserves the port before opening the
database; a port collision must not trigger a second migration or stop another
instance. Stop your own foreground instance with Ctrl+C and verify its port has
closed. The runtime closes HTTP connections, Vite and SQLite on SIGINT/SIGTERM.
Do not kill all Node processes. Preserve any existing instance owned by the user.

Tests must use an isolated `JOBPILOT_DATA_DIR`, or in-memory fixtures with injected
providers. Record temporary PIDs and children; close and verify them after use.
The normal instance stores data under `%LOCALAPPDATA%/JobPilot` on Windows.

## Read a provider failure

Open **AI activity**, find the operation by its JobPilot attempt reference, then
expand **Diagnostic**. The page shows the function, provider, requested/returned
models, outcome, duration, reported tokens and known/unknown estimated cost.
Diagnostics add HTTP status, a recognized provider code, a validated request
reference and an explanation derived from fixed local text.

Only allowlisted codes and hex/UUID request identifiers are retained. Arbitrary
provider messages, prompts, CV text, generated letters, keys and raw response
bodies are excluded from telemetry. Diagnostics do not reconstruct old responses:
historical events without metadata show **Diagnostic non conservé**.

A 403 alone does not establish insufficient credit, unavailable model or a
particular subscription restriction. A recognized provider code can narrow the
reason. The original user-reported 403 remains unexplained until a new response
is observed during an explicitly requested operation. Tests never call paid AI.

No automatic retry follows refusal, timeout, restart or journal failure. An
interrupted request can have an unknown provider outcome and cost. Editing a
letter, copying text and local exports remain available when generation fails.
Failed requests retain drafts for correction. Reviewing a successful proposal
before it replaces edited text belongs to the unified preparation work in lot 4.

## Portable compatibility

Portable v7 introduces validated AI diagnostics. v1–v6 restore without inventing
missing diagnostics. Exporting an older format is refused when it would discard
diagnostics. Encrypted complete backups continue to preserve the SQLite journal.
Later lots extend v7 with native register and daily-proposal contracts.

## Validation and review

Use simulated 403 responses (known code and unknown code), non-JSON refusal,
transport interruption, malformed response, restart and journal write failure.
Verify one dispatch per explicit operation, persistent diagnostics, absence of
private content, v7 roundtrip, old-format rejection and retained browser drafts.
Independent review is requested on PR #24. Local checks are an auto-review.
