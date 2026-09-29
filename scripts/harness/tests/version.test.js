import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { versionCmd, changelogCmd } from '../src/version.js'
import { openDb, recordInteraction } from '../src/lib/db.js'
import { tmpdir, write } from './helpers.js'

function makeRoot(version = '0.1.0') {
  const root = tmpdir()
  write(root, 'scripts/harness/package.json', JSON.stringify({ name: 'harness', version }))
  return root
}

function capture(fn) {
  const chunks = []
  const orig = process.stdout.write
  process.stdout.write = (c) => {
    chunks.push(String(c))
    return true
  }
  try {
    fn()
  } finally {
    process.stdout.write = orig
  }
  return chunks.join('')
}

function readVersion(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'scripts/harness/package.json'), 'utf8')).version
}

test('version: mostra a versão atual', () => {
  const root = makeRoot('1.2.3')
  assert.equal(capture(() => versionCmd([], root)), '1.2.3\n')
})

test('version --bump: patch, minor e major', () => {
  const root = makeRoot('1.2.3')
  versionCmd(['--bump', 'patch'], root)
  assert.equal(readVersion(root), '1.2.4')
  versionCmd(['--bump', 'minor'], root)
  assert.equal(readVersion(root), '1.3.0')
  versionCmd(['--bump', 'major'], root)
  assert.equal(readVersion(root), '2.0.0')
})

test('version --bump: registra interação no banco', () => {
  const root = makeRoot('0.1.0')
  versionCmd(['--bump', 'patch'], root)
  const db = openDb(root)
  const r = db.prepare("SELECT content FROM interactions WHERE kind='system'").get()
  db.close()
  assert.ok(r.content.includes('0.1.0 → 0.1.1'))
})

test('changelog: gera a partir dos handoffs, mais recentes primeiro', () => {
  const root = tmpdir()
  const db = openDb(root)
  recordInteraction(db, { taskId: '01-x.md', kind: 'note', content: 'handoff: lote 1 feito', source: 'agent' })
  recordInteraction(db, { taskId: '02-y.md', kind: 'note', content: 'handoff: lote 2 feito', source: 'agent' })
  recordInteraction(db, { taskId: '03-z.md', kind: 'prompt', content: 'handoff: não deveria aparecer', source: 'agent' })
  db.close()

  changelogCmd(['--out', 'CHANGELOG.md'], root)
  const content = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
  assert.ok(content.includes('01-x.md'))
  assert.ok(content.includes('lote 1 feito'))
  assert.ok(content.includes('02-y.md'))
  assert.ok(!content.includes('03-z.md'), 'prompt não é handoff')
  // mais recente primeiro (02 inserido depois de 01)
  assert.ok(content.indexOf('02-y.md') < content.indexOf('01-x.md'))
})

test('changelog: sem handoffs avisa', () => {
  const root = tmpdir()
  changelogCmd(['--out', 'CHANGELOG.md'], root)
  const content = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
  assert.ok(content.includes('nenhum handoff'))
})