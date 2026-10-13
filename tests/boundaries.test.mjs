import test from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { boundaryViolations, checkBoundaries } from '../scripts/check-boundaries.mjs'

const root = resolve('.')
test('all application imports obey the module boundaries', () => assert.deepEqual(checkBoundaries(root).errors, []))
test('server cannot reach interface through imports, exports, require or dynamic imports', () => {
  for (const source of ["import { x } from '../src/types'", "export * from '../src/types'", "import('../src/types')", "require('../src/types')"])
    assert.equal(boundaryViolations(resolve('server/example.mjs'), source, root).length, 1)
})
test('business contracts reject component import types and frameworks', () => {
  assert.equal(boundaryViolations(resolve('shared/contracts/example.ts'), "type X = import('../../src/components/CvPrefill').PrefillTrace", root).length, 1)
  assert.equal(boundaryViolations(resolve('shared/domain/example.mjs'), "import React from 'react'", root).length, 1)
})
test('UI primitives remain independent of feature data', () => {
  assert.equal(boundaryViolations(resolve('src/shared/ui/example.tsx'), "import { useData } from '../../data'", root).length, 1)
  assert.deepEqual(boundaryViolations(resolve('src/shared/ui/example.tsx'), "import React from 'react'; import { Button } from './Button'", root), [])
})
