import { createHash } from 'node:crypto'

// Revision and receipt updates commit atomically with the application mutation.
export function createWriteCoordinator(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS persistence_revision (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1), revision INTEGER NOT NULL);
    INSERT OR IGNORE INTO persistence_revision VALUES (1, 0);
    CREATE TABLE IF NOT EXISTS persistence_receipts (
      operation TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, acknowledgement TEXT NOT NULL);`)
  const revision = () => db.prepare('SELECT revision FROM persistence_revision WHERE singleton = 1').get().revision
  const reject = (message) => { throw Object.assign(new Error(message), { status: 409 }) }
  const commit = db.transaction(({ operation, expectedRevision, method, path, body }, mutate) => {
    if (typeof operation !== 'string' || !/^[0-9a-f-]{36}$/i.test(operation) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw Object.assign(new Error('Révision et identifiant d’opération requis.'), { status: 400 })
    }
    const fingerprint = createHash('sha256').update(JSON.stringify([method, path, expectedRevision, body ?? null])).digest('hex')
    const previous = db.prepare('SELECT fingerprint, acknowledgement FROM persistence_receipts WHERE operation = ?').get(operation)
    if (previous) {
      if (previous.fingerprint !== fingerprint) reject('Identifiant d’opération déjà utilisé pour une autre écriture.')
      return JSON.parse(previous.acknowledgement)
    }
    if (revision() !== expectedRevision) reject('Données modifiées ailleurs. Synchronise avant de poursuivre.')
    const result = mutate()
    const acknowledgement = { ok: true, revision: expectedRevision + 1, result }
    db.prepare('UPDATE persistence_revision SET revision = ? WHERE singleton = 1').run(acknowledgement.revision)
    db.prepare('INSERT INTO persistence_receipts VALUES (?, ?, ?)').run(operation, fingerprint, JSON.stringify(acknowledgement))
    return acknowledgement
  })
  return { revision, commit }
}
