import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { timingSafeEqual } from 'node:crypto'

const script = fileURLToPath(new URL('./dpapi.ps1', import.meta.url))
export function createWindowsProtector() {
  function transform(operation, bytes) {
    if (process.platform !== 'win32') throw new Error('Windows credential protection is required.')
    try {
      const result = execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', script, '-Operation', operation], {
        input: bytes.toString('base64'), encoding: 'utf8', windowsHide: true, timeout: 15000,
        stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
      })
      return Buffer.from(result.trim(), 'base64')
    } catch { throw new Error('Windows credential protection failed.') }
  }
  return {
    protect: (value) => transform('Protect', Buffer.from(value, 'utf8')).toString('base64'),
    unprotect: (value) => transform('Unprotect', Buffer.from(value, 'base64')).toString('utf8'),
  }
}
export const PUBLIC_FIELDS = ['baseUrl', 'model', 'cvText', 'profileName', 'profileEmail', 'profilePhone', 'profileCity', 'profileTitle']
export const PROVIDERS = Object.freeze({ mistral: 'https://api.mistral.ai/v1', zai: 'https://api.z.ai/api/paas/v4' })
export function providerForUrl(url) { return Object.entries(PROVIDERS).find(([, value]) => value === url)?.[0] }
export function publicFields(settings) {
  return Object.fromEntries(PUBLIC_FIELDS.filter((key) => typeof settings[key] === 'string').map((key) => [key, settings[key]]))
}
export function assertDatabaseIntegrity(db) {
  const result = db.pragma('integrity_check')
  if (result.length !== 1 || result[0].integrity_check !== 'ok') throw new Error('Database integrity check failed. Stop and recover before migration.')
}
export function createCredentialStore(db, protector) {
  db.exec('CREATE TABLE IF NOT EXISTS credentials (provider TEXT PRIMARY KEY, encrypted TEXT NOT NULL)')
  const read = db.prepare('SELECT encrypted FROM credentials WHERE provider = ?')
  const write = db.prepare('INSERT INTO credentials (provider, encrypted) VALUES (?, ?) ON CONFLICT(provider) DO UPDATE SET encrypted = excluded.encrypted')
  const readSettings = () => JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'main'").get()?.value ?? '{}')
  const writeSettings = (settings) => db.prepare("INSERT INTO settings (key, value) VALUES ('main', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(settings))
  function save(provider, value) {
    write.run(provider, protector.protect(value))
    // Verify the persisted ciphertext before committing or removing plaintext.
    const recovered = Buffer.from(protector.unprotect(read.get(provider).encrypted), 'utf8')
    const original = Buffer.from(value, 'utf8')
    if (recovered.length !== original.length || !timingSafeEqual(recovered, original)) throw new Error('Credential verification failed.')
  }
  const migrate = db.transaction((legacy) => {
    assertDatabaseIntegrity(db)
    const settings = readSettings()
    const source = legacy ?? settings
    // Refuse a copied/corrupted database that this Windows account cannot decrypt.
    for (const row of db.prepare('SELECT encrypted FROM credentials').all()) protector.unprotect(row.encrypted)
    if (!source || Array.isArray(source) || typeof source !== 'object' || (source.keys !== undefined && (!source.keys || Array.isArray(source.keys) || typeof source.keys !== 'object'))) throw new Error('Invalid legacy credentials.')
    const keys = { ...(source.keys ?? {}) }
    if (Object.keys(keys).length > 16 || Object.keys(keys).some((provider) => !/^[A-Za-z0-9._-]{1,64}$/.test(provider))) throw new Error('Invalid legacy provider list.')
    if (source.apiKey) {
      const provider = providerForUrl(source.baseUrl) ?? (source.baseUrl ? 'custom' : 'mistral')
      if (keys[provider] && keys[provider] !== source.apiKey) throw new Error('Credential migration conflict.')
      keys[provider] = source.apiKey
    }
    if (source.mistralKey) {
      if (keys.mistral && keys.mistral !== source.mistralKey) throw new Error('Credential migration conflict.')
      keys.mistral = source.mistralKey
    }
    for (const [provider, value] of Object.entries(keys)) {
      if (typeof value !== 'string' || value.length > 4096) throw new Error('Invalid legacy credential.')
      if (!value) continue
      if (read.get(provider)) {
        if (protector.unprotect(read.get(provider).encrypted) !== value) throw new Error('Credential migration conflict.')
      } else save(provider, value)
    }
    writeSettings({ ...publicFields(source), ...publicFields(settings) })
  })
  return {
    migrate,
    settings() { return { ...publicFields(readSettings()), keyStatus: Object.fromEntries(Object.keys(PROVIDERS).map((provider) => [provider, !!read.get(provider)])) } },
    updateSettings(patch) { writeSettings({ ...publicFields(readSettings()), ...patch }) },
    set: db.transaction(save),
    remove(provider) { db.prepare('DELETE FROM credentials WHERE provider = ?').run(provider) },
    get(provider) { const row = read.get(provider); return row ? protector.unprotect(row.encrypted) : null },
  }
}
