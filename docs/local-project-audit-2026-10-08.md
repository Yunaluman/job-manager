# JobPilot local audit — 2026-10-08

> Follow-up correction during security lot 1: the initial indexed count of 0 applications was incorrect. Pre-existing broken SQLite indexes hid 1 application and the populated settings row. Read-only table scans and the encrypted pre-migration snapshot established the original rows were present. Targeted recovery restored valid indexes; the live database now contains 1 application, 4 analyses, the preserved CV/profile and a DPAPI-protected Mistral key. See `security-lot-1.md`. The findings below document the original code before lot 1.

## Verified state

- GitHub repository: https://github.com/Break-Carrier/job-manager, private, default branch `main`, last push reported by GitHub: 2026-07-04.
- Local branch: `development`, HEAD `c083b9f`. Local remote-tracking refs are not proof of current remote synchronization.
- Pre-existing uncommitted changes in `src/cv.ts`, `src/pages/CvPage.tsx`, and `src/pages/LetterPage.tsx` link analyses and letters to applications. Preserved.
- Stack: React, TypeScript, Vite, Express, better-sqlite3. No test script or CI directory found.
- Real database: `C:\Users\there\AppData\Local\JobPilot\jobpilot.db`. Read-only queries found 0 applications and 4 analyses; a CV and a non-empty Mistral key are present. No non-empty legacy `apiKey` or `mistralKey` settings were found.
- Settings, including API keys, are stored as plaintext JSON in `settings`, row `main`, field `keys.mistral`. `/api/settings` returns those keys to the browser. The browser calls the selected provider directly.
- Database WAL and SHM companion files exist. A live copy of only the `.db` file is not a reliable backup procedure; use a SQLite backup operation or a confirmed clean shutdown before copying.
- Pattern scan: 31 working files and 92 locally available historical Git blobs, with no candidates. This does not prove no secrets exist. Browser profiles, external backups, dependencies, build artifacts and unfetched remote history were not inspected. No provider call was made; key validity is unknown.
- Legacy browser storage can contain `jobpilot.settings.v1`, potentially with older key fields. Its actual presence was not checked.
- `.gitignore` excludes `*.local` but does not explicitly exclude `.env`, `.env.*`, database files or private key files.
- Existing OneDrive conventions confirm `D:\OneDrive\Documents\CV ET LM\04_suivi\candidatures.csv` as the authoritative register; Excel is a generated projection.

## Findings and priorities

### 1. Prevent data loss before importing the register

- `src/api.ts:13`: writes are fire-and-forget; callers cannot await confirmed persistence. UI changes may appear successful despite failed writes, and overlapping updates can arrive out of order.
- `src/storage.ts:23` and `src/cv.ts:106`: migration deletes legacy browser entries before the asynchronous write succeeds.
- `src/storage.ts:125` and `server/index.mjs:50`: JSON import accepts any array, replaces all applications and reports success before persistence is confirmed. Add schema validation, preview, merge/deduplication, a backup, and confirmed completion.
- The advertised complete JSON backup actually contains only applications (`src/storage.ts:121`), excluding profile, CV and analyses. Provide a versioned complete backup with secrets excluded by default.

### 2. Contain credentials

- Move provider calls to the local server; return only provider configuration and key-presence indicators to the browser.
- Store credentials in an operating-system credential store or encrypt them with an OS-protected key. Merely moving plaintext keys to `.env` does not provide encryption.
- Validate provider destinations and HTTPS; custom `baseUrl` currently receives a bearer key without destination enforcement.
- Add explicit ignored patterns for secrets and local databases, plus a repeatable secret scan.
- Correct the Mistral-only claims in README and source comments: Z.ai and custom endpoints are supported by the code.
- Loopback binding limits network exposure but is not authentication. Validate Host/Origin and request schemas before extending local access or introducing a remote deployment. No exploit was executed.

### 3. Integrate with the existing application workflow

First implement a read-only CSV import preview using UTF-8 BOM and semicolon delimiters. Preserve external IDs (`AAAA-NNN`) and deduplicate by normalized company, title and location, with source URL as additional evidence. Keep CSV authoritative during this phase.

Do not overwrite statuses blindly: CSV vocabulary differs from the UI, and archived/excluded offers need explicit mappings. Preserve offer verification dates, source evidence, rejection reasons, experience requirements, salary fields, CV/letter paths, response dates and human approval. The current `Application` model lacks many of these fields.

Only after reconciliation should a deliberate decision establish a single writable source. Two independent writable registers would cause drift. Keep generated letters as drafts, and require actual send evidence before marking an application sent. Current provider-assisted parsing does not verify an offer's existence or accessibility.

### 4. Correct metrics and AI claims

- `src/pages/Dashboard.tsx:99`: the sent counter excludes refused applications, although those were also sent. Its interview-rate denominator therefore changes when an application is refused.
- Source interview statistics use current status, losing earlier interviews after refusal. Derive funnel milestones from structured dated events.
- A model-generated score is an estimate, not measured ATS compatibility. Plaintext extraction cannot establish all layout/parsing defects in the original file. Separate demonstrated experience, projects and missing skills; never recommend adding unsupported skills.
- Add explicit request timeout/cancellation and model-result validation. Show when extraction falls back to heuristics.

### 5. Operational and UI follow-up

- Validate mobile layout: the fixed 240px sidebar and 32px content padding leave little space on narrow screens. Browser rendering was not tested in this audit.
- Verify a service identity before reusing an occupied API port; the current server assumes any listener on port 3001 is compatible.
- Replace the README command that kills arbitrary listeners with shutdown instructions scoped to known project process IDs.
- Add meaningful deterministic tests for migration failures, imports, deduplication, status mapping and funnel metrics before connecting the live register.

## Validation and limits

TypeScript build-mode checking and the Vite production build passed. Vite reported a bundle-size warning above 500 kB. No development server or browser was launched, no application records were changed, no keys were exposed, and no Git push or commit was performed. Static findings were not tested through browser interactions or failure injection.

Repeat the bounded, value-redacted local audit with `node scripts/audit-local-secrets.mjs`. It reads the real user database and locally available Git history; database access may require permission outside the project sandbox.
