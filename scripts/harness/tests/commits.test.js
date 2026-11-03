import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COMMIT_TYPES,
  conventionalCommit,
  commitForTask,
  normalizeCommitType,
  taskScope,
  taskSubject
} from '../src/lib/commits.js'

test('commits: monta mensagem conventional com escopo da task', () => {
  assert.equal(
    commitForTask('02-adicionar-modo-verbose.md', 'feat'),
    'feat(task-02): adicionar modo verbose'
  )
  assert.equal(taskScope('12-payment-webhook.md'), 'task-12')
  assert.equal(taskSubject('12-payment-webhook.md'), 'payment webhook')
  assert.equal(conventionalCommit({ type: 'fix', subject: 'corrige bug' }), 'fix: corrige bug')
})

test('commits: valida tipos', () => {
  assert.equal(normalizeCommitType(undefined), 'feat')
  assert.equal(normalizeCommitType('FIX'), 'fix')
  assert.throws(() => normalizeCommitType('hotfix'), /tipo de commit inválido/)
  assert.ok(COMMIT_TYPES.includes('docs'))
})
