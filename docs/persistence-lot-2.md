# Lot 2 — confirmed persistence and recoverable backups

## Contract

Every application, analysis, settings and credential mutation requires a current revision and a unique operation ID. Data, revision and acknowledgement receipt commit in one SQLite transaction. Replaying an identical operation returns its original receipt; reusing its ID for different content or writing against stale data returns HTTP 409.

The browser serializes mutations and publishes confirmed data only after acknowledgement. A missing response, conflict or unusable acknowledgement blocks further writes until explicit synchronization. Writes are never retried automatically. Legacy browser sources are deleted only after confirmation or identical readback; conflicts retain the source.

## Backups and restoration

The complete portable JSON export contains applications, analyses, CV/profile and public provider settings. It excludes credentials. Its SHA-256 checksum detects accidental content changes; it does not authenticate the producer. Restore it into a **new** database:

```powershell
node scripts/restore-portable-snapshot.mjs snapshot.json NEW_DATABASE.db
```

The encrypted backup uses SQLite's online backup API, reads and checks the complete snapshot, protects it with Windows DPAPI, flushes it to disk and verifies persisted ciphertext before reporting success. It includes protected credentials and requires the same Windows account for restoration:

```powershell
node scripts/restore-encrypted-backup.mjs backup.json NEW_DATABASE.db
```

Both restoration tools exclusively create their destination and refuse to overwrite existing files. Keep the restored database separate until its contents are reviewed. Temporary plaintext SQLite files are removed after backup success or failure; this is not a forensic erasure guarantee. Backups remain in the application data directory, so copy verified encrypted backups to a separate protected location for disk-loss recovery.

The UI's legacy array import replaces applications only, after explicit confirmation and a verified encrypted backup. It does not import complete snapshots or reconcile the external candidature register. Reconciliation belongs to lot 3.

## Verification in progress

Deterministic tests cover acknowledgement ordering, failure rollback, conflicts, replay, source retention, tampered exports, exclusive restoration and real Windows DPAPI restoration. An isolated production browser check confirmed profile/CV persistence after reload, rejection of stale writes between two tabs, retained draft recovery after explicit synchronization, and creation of a backup through the UI. The resulting encrypted backup was restored with the CLI into a new database at revision 3. No browser console errors were recorded. Final failure checks, review and the pull request remain pending. This document does not claim the lot is complete.
