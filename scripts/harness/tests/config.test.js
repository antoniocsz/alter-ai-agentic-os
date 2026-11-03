import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readConfig, resolveConfig, validateConfig, DEFAULT_CONFIG } from '../src/lib/config.js'

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-config-'))
}

function writeConfig(root, cfg) {
  fs.writeFileSync(path.join(root, 'harness.json'), JSON.stringify(cfg))
}

test('readConfig: ausente retorna null; inválido lança erro claro', () => {
  const root = tmpdir()
  assert.equal(readConfig(root), null)
  fs.writeFileSync(path.join(root, 'harness.json'), '{ nope')
  assert.throws(() => readConfig(root), /harness\.json inválido/)
})

test('resolveConfig: aplica defaults e merge parcial', () => {
  const root = tmpdir()
  assert.deepEqual(resolveConfig(root), DEFAULT_CONFIG)

  writeConfig(root, { profile: 'script', gates: { finish: ['scope', 'test'] } })
  const cfg = resolveConfig(root)
  assert.equal(cfg.profile, 'script')
  assert.deepEqual(cfg.gates.finish, ['scope', 'test'])
  assert.deepEqual(cfg.gates.merge, DEFAULT_CONFIG.gates.merge)
  assert.equal(cfg.git.model, 'trunk')
})

test('validateConfig: aceita config válida', () => {
  const errors = validateConfig({
    profile: 'game',
    gates: { finish: ['scope', 'lint'], merge: ['test'] },
    git: { model: 'trunk', featureBranch: true },
    wip: { active: 2, queue: 5 }
  })
  assert.deepEqual(errors, [])
})

test('validateConfig: reprova perfil, gates, git e wip inválidos', () => {
  const errors = validateConfig({
    profile: 'mobile',
    gates: { finish: 'scope' },
    git: { model: 'svn', featureBranch: 'sim' },
    wip: { active: -1 }
  })
  assert.ok(errors.some((e) => e.includes('profile inválido')))
  assert.ok(errors.some((e) => e.includes('gates.finish')))
  assert.ok(errors.some((e) => e.includes('git.model')))
  assert.ok(errors.some((e) => e.includes('featureBranch')))
  assert.ok(errors.some((e) => e.includes('wip.active')))
})
