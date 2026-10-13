# JobPilot — local application tracking

JobPilot tracks job applications, follow-ups, CV analyses and draft cover letters. It runs locally on Windows with Node.js 22+ and pnpm 9+.

## Run

```sh
pnpm install --frozen-lockfile
pnpm dev       # One process: Express + Vite on http://127.0.0.1:5173
pnpm build     # TypeScript check and production bundle
pnpm preview   # Express serves the bundle on http://127.0.0.1:3001
pnpm test      # Security regression tests, including real Windows DPAPI
```

Open the printed loopback URL. API requests require the current per-process session token supplied in the app's HTML; after restarting the server, reload existing browser tabs. Running Vite directly does not supply a session and is unsupported. Occupied ports cause startup to fail; no pre-existing service is reused or stopped.

## Features

- Dashboard, application table/kanban, follow-up dates and status history.
- Daily actions, a decision queue and in-app deadline notifications; see [planning behavior and roadmap](docs/actions-and-notifications.md).
- Planned interviews with declared sources, rescheduling history and independent in-app reminders; see [planned interviews](docs/interview-plans.md). A planned appointment does not count as a realized interview.
- Factual period comparisons by source and job title, with dossier-level evidence and explicit missing-data limits; see [strategy review](docs/strategy-review.md).
- Offer extraction with a local heuristic or a provider-assisted request.
- Local PDF/DOCX/TXT text extraction for CVs.
- CV review and draft cover letters, using manual copy/paste or an explicit API request.
- Profile and provider settings, complete credential-free JSON snapshots and application Excel exports.

AI output needs human review. A generated score is an estimate, not measured compatibility with an employer's ATS. Saving a draft or changing a status does not prove an application was sent.

## Data and credentials

The database is `%LOCALAPPDATA%\JobPilot\jobpilot.db`. `JOBPILOT_DATA_DIR` overrides the data directory for isolated tests; `JOBPILOT_PORT` overrides the loopback port. CVs, profile details, applications and analyses remain plaintext local data.

Saved provider keys are ciphertext in the separate `credentials` table, protected with **Windows DPAPI / CurrentUser**. Encryption and decryption use Windows PowerShell without profiles, with hidden child windows and piped input/output. Keys are never passed as command-line arguments. The server returns key-presence flags, not saved keys or their suffixes. A newly entered key necessarily exists briefly in its password field and is sent to the local server for protection.

On startup, legacy SQLite keys (`keys`, `apiKey`, `mistralKey`) are encrypted, read back and decrypted for comparison inside a transaction. Only a successful comparison allows removal of the plaintext fields. Failure or conflicting keys aborts migration and preserves the previous data. Legacy `jobpilot.settings.v1` browser data is removed only after the migration endpoint confirms success. Unsupported legacy provider keys are retained encrypted but cannot be used for requests.

Only the server sends provider keys. Allowed destinations are fixed HTTPS endpoints for Mistral and Z.ai; redirects and arbitrary/custom endpoints are refused. Each explicit request may transmit the CV, offer text and profile information included in its prompt to the selected provider. No claim of regulatory compliance follows from the provider label.

## Local access boundaries

Startup and credential migration first require a successful SQLite integrity check. A corrupted database is refused rather than migrated through unreliable indexes. Explicit offline migration (`node scripts/migrate-local-credentials.mjs <database-path>`) creates and verifies a DPAPI-encrypted consistent recovery snapshot before changing legacy credentials.

The HTTP server binds to `127.0.0.1`. Host and Origin checks reject foreign sites and DNS-rebinding hosts. All API routes require a random session token, and write requests require JSON. Cross-origin CORS access and embedding are disabled. Development uses the same guarded HTTP server as the API; Vite's permissive CORS mode is disabled.

This protects against other websites interacting with the local app. **It is not an identity boundary against programs running under your Windows account**: such programs can access the loopback bootstrap page and can use your DPAPI rights. Malicious browser extensions, compromised app code and account-level malware remain outside this protection. This is not a multi-user service or a deployable SaaS authentication scheme.

SQLite secure-delete is enabled for future changes. Migration does not guarantee forensic erasure of older WAL pages, browser files, filesystem snapshots or external backups. DPAPI ciphertext is tied to the Windows account; copying the database to another account does not produce usable credentials. Keep provider account recovery available rather than relying on an exported database for key portability.

## Backups

Portable v5 JSON snapshots include applications, analyses, CV/profile, public provider settings, AI monitoring, actions, notification read states, the application journey and planned interviews, without saved credentials. Older versions restore collections absent from their format as empty; old-format exports refuse to omit existing data. Excel exports contain applications only. Legacy JSON-array import replaces applications after confirmation and a verified encrypted backup. Full snapshots restore into a new database with the supplied CLI; see [the persistence and restoration guide](docs/persistence-lot-2.md) and [planned interviews](docs/interview-plans.md).

Use “Sauvegarder la base chiffrée” in Settings for a verified online SQLite backup, encrypted with Windows DPAPI and including protected credentials. Copy verified encrypted backups to a separate protected location for disk-loss recovery. Raw copying during use can omit WAL changes. Do not commit databases or backups to Git.

## Architecture

- `server/index.mjs`: loopback HTTP lifecycle, Vite development middleware or production assets.
- `server/app.mjs`: guarded API and server-only provider calls.
- `server/credentials.mjs` / `server/dpapi.ps1`: credential protection and verified migration.
- `src/api.ts`: session-authenticated local requests.
- `src/storage.ts`: application cache and exports.
- `src/cv.ts`: public settings, analyses and prompt builders.
- `tests/security.test.mjs`: migration rollback, access checks, destination restrictions and DPAPI.

Future changes must use typed branches such as `fix/local-credentials-and-access`, one PR per lot, and review/fix before the next lot. Do not deploy this local application as a public service by changing its bind address.

References: [Microsoft DPAPI](https://learn.microsoft.com/en-us/dotnet/standard/security/how-to-use-data-protection), [Vite server security options](https://vite.dev/config/server-options).
