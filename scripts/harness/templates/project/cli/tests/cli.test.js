import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run } from '../src/index.js'

test('sem argumentos mostra ajuda', async () => {
  assert.equal(await run([]), 0)
})

test('comando desconhecido retorna erro', async () => {
  assert.equal(await run(['nope']), 1)
})
