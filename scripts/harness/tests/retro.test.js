import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { retroCmd } from '../src/retro.js'
import { sessionEnd } from '../src/lib/memory.js'
import { tmpdir, withSilentStdout } from './helpers.js'

function setup() {
  const root = tmpdir()
  for (const d of ['tasks/queue', 'tasks/active', 'tasks/done', 'context/project/adr']) {
    fs.mkdirSync(path.join(root, d), { recursive: true })
  }
  fs.writeFileSync(path.join(root, 'context/project/overview.md'), '# Overview\n')
  fs.writeFileSync(path.join(root, 'context/project/stack.md'), '# Stack\n')
  return root
}

test('retro: gera métricas + sessões e não sobrescreve sem --force', async () => {
  const root = setup()
  sessionEnd(root, 'sessão de teste com entrega X')

  const relative = 'context/project/retro/teste.md'
  await withSilentStdout(() => retroCmd(['--days', '365', '--out', relative], root))

  const content = fs.readFileSync(path.join(root, relative), 'utf8')
  assert.match(content, /Retrospectiva/)
  assert.match(content, /Métricas do período/)
  assert.match(content, /sessão de teste com entrega X/)

  await assert.rejects(
    withSilentStdout(() => retroCmd(['--days', '365', '--out', relative], root)),
    /já existe/
  )
  await withSilentStdout(() => retroCmd(['--days', '365', '--out', relative, '--force'], root))
})
