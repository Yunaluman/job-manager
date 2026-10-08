import test from 'node:test'
import assert from 'node:assert/strict'
import { migrateLegacyList } from '../src/legacy-migration.mjs'

function fixture(rows) {
  let raw = JSON.stringify(rows)
  return { getItem: () => raw, removeItem: () => { raw = null }, replace: (value) => { raw = JSON.stringify(value) } }
}
test('legacy source remains until persistence succeeds', async () => {
  const storage = fixture([{ id: 'one' }])
  await assert.rejects(migrateLegacyList({ storage, key: 'legacy', current: [], save: async () => { throw new Error('offline') } }))
  assert.notEqual(storage.getItem(), null)
  await migrateLegacyList({ storage, key: 'legacy', current: [], save: async () => {} })
  assert.equal(storage.getItem(), null)
})
test('identical readback after a lost acknowledgement clears only the redundant source', async () => {
  const storage = fixture([{ id: 'one', company: 'Fixture' }])
  await migrateLegacyList({ storage, key: 'legacy', current: [{ company: 'Fixture', id: 'one' }], save: async () => { throw new Error('must not write') } })
  assert.equal(storage.getItem(), null)
})
test('conflicting data and a source modified during migration are preserved', async () => {
  const storage = fixture([{ id: 'one' }])
  await assert.rejects(migrateLegacyList({ storage, key: 'legacy', current: [{ id: 'different' }], save: async () => {} }))
  assert.notEqual(storage.getItem(), null)
  await assert.rejects(migrateLegacyList({ storage, key: 'legacy', current: [], save: async () => storage.replace([{ id: 'new' }]) }))
  assert.deepEqual(JSON.parse(storage.getItem()), [{ id: 'new' }])
})
