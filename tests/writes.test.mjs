import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { createWriteCoordinator } from '../server/writes.mjs'

function fixture(t) {
  const db = new Database(':memory:')
  t.after(() => db.close())
  db.exec('CREATE TABLE records (value TEXT)')
  return { db, coordinator: createWriteCoordinator(db) }
}
const request = (expectedRevision = 0) => ({ operation: randomUUID(), expectedRevision, method: 'PUT', path: '/applications/a', body: { id: 'a' } })

test('mutation, revision and receipt commit together; replay never repeats the mutation', (t) => {
  const { db, coordinator } = fixture(t)
  const input = request()
  let mutations = 0
  const mutate = () => { mutations++; db.prepare('INSERT INTO records VALUES (?)').run('saved'); return { id: 'a' } }
  const ack = coordinator.commit(input, mutate)
  assert.deepEqual(ack, { ok: true, revision: 1, result: { id: 'a' } })
  assert.deepEqual(coordinator.commit(input, mutate), ack)
  assert.equal(mutations, 1)
  assert.equal(coordinator.revision(), 1)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM records').get().count, 1)
})

test('stale tabs and conflicting operation reuse cannot write', (t) => {
  const { coordinator } = fixture(t)
  const input = request()
  coordinator.commit(input, () => 'saved')
  let called = false
  const mutate = () => { called = true }
  assert.throws(() => coordinator.commit(request(), mutate), { status: 409 })
  assert.throws(() => coordinator.commit({ ...input, body: { id: 'other' } }, mutate), { status: 409 })
  assert.equal(called, false)
  assert.equal(coordinator.revision(), 1)
})

test('failed persistence rolls back both data and revision and leaves no receipt', (t) => {
  const { db, coordinator } = fixture(t)
  const input = request()
  assert.throws(() => coordinator.commit(input, () => {
    db.prepare('INSERT INTO records VALUES (?)').run('partial')
    throw new Error('disk failure')
  }))
  assert.equal(coordinator.revision(), 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM records').get().count, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM persistence_receipts').get().count, 0)
  assert.equal(coordinator.commit(input, () => 'corrected').revision, 1)
})

test('missing preconditions fail before mutation', (t) => {
  const { coordinator } = fixture(t)
  for (const input of [{ ...request(), operation: '' }, { ...request(), expectedRevision: NaN }, { ...request(), expectedRevision: -1 }]) {
    assert.throws(() => coordinator.commit(input, () => { throw new Error('must not execute') }), { status: 400 })
  }
  assert.equal(coordinator.revision(), 0)
})
