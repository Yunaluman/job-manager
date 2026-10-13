import test from 'node:test'
import assert from 'node:assert/strict'
import { providerError } from '../server/provider-errors.mjs'

const base = { status: 403, provider: 'mistral', secret: 'fixture-secret', attemptId: 'fixture-attempt' }
test('known provider codes distinguish access, quota and model failures without echoing messages', () => {
  for (const [code, expected] of [['tier_not_allowed', 'plan API'], ['insufficient_permissions', 'permissions'], ['unknown_model', 'modèle'], ['insufficient_quota', 'quota']]) {
    const result = providerError({ ...base, response: { code, message: 'fixture-secret and private CV' } }).error
    assert.ok(result.includes(expected)); assert.ok(result.includes(code))
    assert.ok(!result.includes('fixture-secret')); assert.ok(!result.includes('private CV'))
  }
  assert.ok(providerError({ ...base, response: { error: { code: 'tier_not_allowed' } } }).error.includes('tier_not_allowed'))
})
test('unknown and non-JSON errors stay uncertain and suppress arbitrary provider content', () => {
  for (const response of [undefined, { code: 'private CV', message: 'fixture-secret' }, { error: { message: 'private CV' } }]) {
    const error = providerError({ ...base, response }).error
    assert.ok(error.includes('motif précis n’est pas identifié'))
    assert.ok(error.includes('fixture-attempt')); assert.ok(error.includes('Aucun nouvel essai automatique'))
    assert.ok(!error.includes('private CV')); assert.ok(!error.includes('fixture-secret'))
  }
})
test('only constrained request identifiers are relayed and credentials are excluded', () => {
  const trace = '12345678-1234-1234-1234-123456789abc'
  assert.ok(providerError({ ...base, headers: new Headers({ 'x-request-id': trace }) }).error.includes(trace))
  for (const value of ['fixture-secret', 'private CV', 'https://private.example']) {
    assert.ok(!providerError({ ...base, headers: new Headers({ 'x-request-id': value }) }).error.includes(value))
  }
  assert.ok(!providerError({ ...base, secret: trace, headers: new Headers({ 'x-request-id': trace }) }).error.includes(trace))
})
