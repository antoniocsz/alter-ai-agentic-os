import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { computeMetrics } from '../src/lib/metrics.js'
import { openDb, logEvent } from '../src/lib/db.js'
import { tmpdir } from './helpers.js'

test('report: agrega gate_failed e worktree_finished', () => {
  const root = tmpdir()
  for (const d of ['tasks/queue', 'tasks/active', 'tasks/done', 'context/project/adr']) {
    fs.mkdirSync(path.join(root, d), { recursive: true })
  }
  fs.writeFileSync(path.join(root, 'context/project/overview.md'), '# Overview\n')
  fs.writeFileSync(path.join(root, 'context/project/stack.md'), '# Stack\n')

  const db = openDb(root)
  logEvent(db, '01-x.md', 'gate_failed', 'secrets')
  logEvent(db, '01-x.md', 'worktree_finished', 'task/01-x')
  db.close()

  const m = computeMetrics(root)
  assert.equal(m.gateFailures, 1)
  assert.equal(m.worktreeFinishes, 1)
})
