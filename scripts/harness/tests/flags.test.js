import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseArgs, flagString, flagBool } from '../src/lib/flags.js'

test('parseArgs: posicional + flags em qualquer ordem', () => {
  const a = parseArgs(['--scope', 'a,b', 'minha descrição', '--priority', 'P1'])
  assert.deepEqual(a.positionals, ['minha descrição'])
  assert.equal(a.flags.scope, 'a,b')
  assert.equal(a.flags.priority, 'P1')

  const b = parseArgs(['minha', 'descrição', '--feature=billing', '--keep'])
  assert.deepEqual(b.positionals, ['minha', 'descrição'])
  assert.equal(b.flags.feature, 'billing')
  assert.equal(b.flags.keep, true)
})

test('flagString/flagBool respeitam defaults e booleanos', () => {
  const { flags } = parseArgs(['--handoff', 'ok', '--skip-gates'])
  assert.equal(flagString(flags, 'handoff'), 'ok')
  assert.equal(flagString(flags, 'kind', 'note'), 'note')
  assert.equal(flagBool(flags, 'skip-gates'), true)
  assert.equal(flagBool(flags, 'keep'), false)
})
