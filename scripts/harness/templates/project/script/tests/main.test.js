import { test } from 'node:test'
import assert from 'node:assert/strict'
import { main } from '../src/main.js'

test('main sem args retorna 0', () => {
  assert.equal(main([]), 0)
})
