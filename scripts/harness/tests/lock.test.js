import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { acquireLock, withLock, lockStatus } from '../src/lib/lock.js'
import { validate } from '../src/check.js'
import { tmpdir } from './helpers.js'

const lockFile = (root) => path.join(root, '.harness', 'lock')

test('lock: adquire, é reentrante no processo e libera', () => {
  const root = tmpdir()
  const lock = acquireLock(root)
  assert.ok(fs.existsSync(lockFile(root)))
  assert.equal(lockStatus(root).locked, true)

  const inner = acquireLock(root)
  assert.equal(inner.reentrant, true)

  lock.release()
  assert.equal(fs.existsSync(lockFile(root)), false)
})

test('lock: remove lock obsoleto automaticamente', () => {
  const root = tmpdir()
  fs.mkdirSync(path.join(root, '.harness'), { recursive: true })
  fs.writeFileSync(lockFile(root), '{"pid":999}\n')
  const old = new Date(Date.now() - 31 * 60_000)
  fs.utimesSync(lockFile(root), old, old)

  const lock = acquireLock(root, { staleMs: 60_000 })
  assert.ok(fs.existsSync(lockFile(root)))
  lock.release()
})

test('lock: timeout em lock ativo de outro processo', () => {
  const root = tmpdir()
  fs.mkdirSync(path.join(root, '.harness'), { recursive: true })
  fs.writeFileSync(lockFile(root), '{"pid":999}\n')

  assert.throws(() => acquireLock(root, { timeoutMs: 150 }), /pipeline ocupado/)
  fs.rmSync(lockFile(root))
})

test('check: reporta lock órfão', () => {
  const root = tmpdir()
  for (const d of ['context/project/adr', 'tasks/queue', 'tasks/active', 'tasks/done']) {
    fs.mkdirSync(path.join(root, d), { recursive: true })
  }
  fs.writeFileSync(path.join(root, 'context/project/overview.md'), '# Overview\n')
  fs.writeFileSync(path.join(root, 'context/project/stack.md'), '# Stack\n')

  fs.mkdirSync(path.join(root, '.harness'), { recursive: true })
  fs.writeFileSync(lockFile(root), '{"pid":999,"at":"2026-01-01T00:00:00Z"}\n')
  const old = new Date(Date.now() - 31 * 60_000)
  fs.utimesSync(lockFile(root), old, old)

  const r = validate(root)
  assert.ok(r.errors.some((e) => e.includes('lock órfão')), r.errors.join('\n'))
})

test('withLock: libera mesmo quando a função lança', () => {
  const root = tmpdir()
  assert.throws(() => withLock(root, () => {
    throw new Error('boom')
  }), /boom/)
  assert.equal(fs.existsSync(lockFile(root)), false)
})

test('lock: release não apaga lock roubado por outro dono', () => {
  const root = tmpdir()
  const lock = acquireLock(root)
  fs.writeFileSync(lockFile(root), JSON.stringify({ pid: 999, token: 'outro-dono' }) + '\n')

  lock.release()
  assert.ok(fs.existsSync(lockFile(root)), 'não deveria remover lock de outro dono')
  assert.equal(JSON.parse(fs.readFileSync(lockFile(root), 'utf8')).token, 'outro-dono')
})
