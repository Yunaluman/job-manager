import test from 'node:test'
import assert from 'node:assert/strict'
import { createConfirmedStore } from '../src/persistence-core.mjs'

const initial = () => ({ revision: 0, applications: [], analyses: [], settings: {} })
const operation = (value) => ({
  method: 'PUT', path: 'applications', body: [value],
  apply: (state, result) => ({ ...state, applications: result }),
})

test('writes are serialized and never published before acknowledgement', async () => {
  const calls = []
  let release
  const store = createConfirmedStore({ initialState: initial(), load: async () => initial(),
    persist: async (op, revision) => {
      calls.push(revision)
      if (revision === 0) await new Promise((resolve) => { release = resolve })
      return { ok: true, revision: revision + 1, result: op.body }
    },
  })
  await store.refresh()
  const first = store.mutate(() => operation('first'))
  const second = store.mutate(() => operation('second'))
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(calls, [0])
  assert.deepEqual(store.getState().applications, [])
  assert.equal(store.getStatus().pending, 2)
  release()
  await Promise.all([first, second])
  assert.deepEqual(calls, [0, 1])
  assert.deepEqual(store.getState().applications, ['second'])
  assert.equal(store.getState().revision, 2)
  assert.equal(store.getStatus().pending, 0)
})

for (const outcome of ['unknown', 'conflict']) {
  test(`${outcome} freezes queued writes until explicit synchronization`, async () => {
    let calls = 0
    const store = createConfirmedStore({ initialState: initial(), load: async () => initial(),
      persist: async () => { calls++; throw Object.assign(new Error('failure'), { outcome }) },
    })
    await store.refresh()
    const results = await Promise.allSettled([
      store.mutate(() => operation('a')), store.mutate(() => operation('b')),
    ])
    assert.ok(results.every((result) => result.status === 'rejected'))
    assert.equal(calls, 1)
    assert.equal(store.getStatus().blocked, true)
    assert.deepEqual(store.getState(), initial())
    await store.refresh()
    assert.equal(store.getStatus().blocked, false)
  })
}

test('a rejected write leaves confirmed data intact and permits a correction', async () => {
  let calls = 0
  const store = createConfirmedStore({ initialState: initial(), load: async () => initial(),
    persist: async (op, revision) => {
      if (++calls === 1) throw Object.assign(new Error('invalid input'), { outcome: 'rejected' })
      return { ok: true, revision: revision + 1, result: op.body }
    },
  })
  await store.refresh()
  await assert.rejects(store.mutate(() => operation('bad')))
  assert.deepEqual(store.getState(), initial())
  assert.equal(store.getStatus().blocked, false)
  await store.mutate(() => operation('corrected'))
  assert.deepEqual(store.getState().applications, ['corrected'])
})

test('invalid acknowledgements and failed local application require synchronization', async () => {
  for (const ack of [{ ok: true, revision: 9 }, { ok: true, revision: 1 }]) {
    const store = createConfirmedStore({ initialState: initial(), load: async () => initial(), persist: async () => ack })
    await store.refresh()
    await assert.rejects(store.mutate(() => ({ ...operation('a'), apply() { throw new Error('unusable result') } })))
    assert.equal(store.getStatus().blocked, true)
    assert.deepEqual(store.getState(), initial())
  }
})

test('failed initial load blocks writes without retrying', async () => {
  let loads = 0
  let writes = 0
  const store = createConfirmedStore({ initialState: initial(), load: async () => { loads++; throw new Error('offline') },
    persist: async () => { writes++ },
  })
  await assert.rejects(store.refresh())
  await assert.rejects(store.mutate(() => operation('a')))
  assert.equal(loads, 1)
  assert.equal(writes, 0)
  assert.equal(store.getStatus().pending, 0)
})
