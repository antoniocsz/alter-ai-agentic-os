import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { profileCmd } from '../src/profile.js'
import { tmpdir, withSilentStdout } from './helpers.js'

test('profile set: troca perfil, adota gates do perfil e preserva git', async () => {
  const root = tmpdir()
  fs.writeFileSync(
    path.join(root, 'harness.json'),
    JSON.stringify({
      profile: 'web',
      gates: { finish: ['scope'], merge: [] },
      git: { model: 'trunk', featureBranch: false, baseBranch: 'develop' },
      wip: { active: 9, queue: 9 }
    })
  )

  await withSilentStdout(() => profileCmd(['set', 'script'], root))
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'harness.json'), 'utf8'))
  assert.equal(cfg.profile, 'script')
  assert.ok(cfg.gates.finish.includes('test'))
  assert.equal(cfg.git.baseBranch, 'develop')
  assert.equal(cfg.wip.active, 2)

  await assert.rejects(withSilentStdout(() => profileCmd(['set', 'mobile'], root)), /perfil inválido/)
})
