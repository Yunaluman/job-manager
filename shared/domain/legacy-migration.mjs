const canonical = (value) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item)

// Delete browser source only after a confirmed write or an identical server read.
export async function migrateLegacyList({ storage, key, current, save }) {
  const raw = storage.getItem(key)
  if (raw === null) return
  const rows = JSON.parse(raw)
  if (!Array.isArray(rows) || rows.some((row) => !row || typeof row.id !== 'string' || !row.id)) throw new Error('Anciennes données invalides ; source conservée.')
  const normalize = (items) => items.map(canonical).sort()
  if (rows.length && current.length) {
    if (canonical(normalize(rows)) !== canonical(normalize(current))) throw new Error('Anciennes données et base différentes : rapprochement nécessaire, source conservée.')
  } else if (rows.length) await save(rows)
  // Avoid deleting a source edited while its migration was in flight.
  if (storage.getItem(key) !== raw) throw new Error('Source modifiée pendant la migration ; elle est conservée.')
  storage.removeItem(key)
}
