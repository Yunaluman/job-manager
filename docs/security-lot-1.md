# Lot 1: local credentials and access

## Acceptance requirements

1. No saved provider key or ciphertext is returned to the UI.
2. Provider calls run on the server, target fixed HTTPS endpoints and refuse redirects.
3. Persisted credentials use Windows DPAPI / CurrentUser, without a plaintext fallback.
4. Legacy keys are removed only after a persisted-ciphertext decrypt/compare succeeds; failures and conflicts roll back.
5. Every API route requires a per-process local session. Foreign Host/Origin, cross-site requests and non-JSON writes are rejected.
6. Development and production run through the same guarded loopback server. Occupied ports fail instead of reusing an unidentified process.
7. Documentation distinguishes browser-site protection from account-level malware, portable backups and historical plaintext remnants.
8. Git excludes environment secrets, databases and private key material.

## Validation

`node --test tests/security.test.mjs` covers persisted migration, encryption/readback failure rollback, conflicting browser migration, API authentication, Host/Origin/fetch metadata restrictions, settings-field validation, credential save/delete, fixed AI destinations, redirect policy, error redaction and a real Windows DPAPI round trip. Provider calls are mocked; these tests do not contact a paid provider.

The manual browser check uses an isolated `JOBPILOT_DATA_DIR`, a deliberately invalid fixture key and no provider call. Confirm saved-key presence survives reload, provider switching uses the correct presence flag, and removal updates the UI. TypeScript and production build must also pass.

## Review checklist

- Trace every source of provider secrets, every persistence write and every HTTP response.
- Attempt malformed migration and settings payloads without losing legacy values.
- Check protection failure and conflicts leave recoverable source data.
- Confirm no arbitrary URL reaches fetch; no caller-controlled bearer header or redirect is accepted.
- Inspect runtime HTML/session bootstrapping and the development websocket Host/Origin boundary.
- Check process cleanup and port collisions using isolated fixtures; never stop an existing service.
- Keep pre-existing analysis/application-link edits out of this lot's commit.

## Local database incident and recovery

The pre-migration encrypted snapshot exposed pre-existing broken indexes on `applications` and `settings`. Indexed queries incorrectly reported zero applications and missed the populated settings row. The initial migration therefore added an empty `main` row without encrypting the physical source key. A subsequent integrity check and table scans established that all original physical rows remained present.

The implementation now refuses corrupt databases before automatic migration. An explicit, narrowly scoped recovery utility verifies unchanged application/analysis rows against the encrypted snapshot, accepts only the observed index errors and expected empty duplicate, encrypts/verifies source keys, reconciles settings and reindexes inside a transaction. A corruption regression fixture tests failure before migration and this recovery. The real database recovery reports integrity `ok`, 1 application, 4 analyses and a protected Mistral key. No provider request or key rotation was performed.

## Limits and next lot

The bootstrap token prevents unrelated websites from using the API; any local program under the account can fetch the app page and obtain it. DPAPI cannot protect against that account's malware. Legacy custom credentials remain encrypted and disabled. Older WAL files and external backups may retain plaintext; this change makes no forensic-erasure claim.

Application writes/imports still need confirmed persistence, robust schema validation, reconciliation and backups. Those belong to lot 2/3. The OneDrive register is not connected or modified by this lot. A SaaS or multi-user deployment requires a separate authentication design.
