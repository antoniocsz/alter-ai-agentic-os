import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { init } from '../src/init.js'
import { startTask } from '../src/lib/pipeline.js'
import {
  startWorktree,
  finishWorktree,
  listWorktrees,
  pruneWorktrees
} from '../src/lib/worktree.js'
import { tmpdir } from './helpers.js'
import { execFileSync } from 'node:child_process'

const TASK = `# Task: Ajustar main
## Agente: \`coordinator\`
## Módulo: —
## Feature: —
## Escopo (arquivos que esta task vai tocar):
- \`src/main.js\`
## Depende de: [ ] —
## Contexto para ler: —
## Skills a carregar: —
## O que já existe: —
## O que criar:
- mudança em src/main.js
## Especificação: —
## Critério de conclusão:
- [ ] ok
## Complexidade: baixa
`

async function makeProject() {
  const root = path.join(tmpdir(), 'worktree-projeto')
  await init([root, '--profile', 'script', '--git'])
  fs.mkdirSync(path.join(root, 'tasks', 'queue'), { recursive: true })
  fs.writeFileSync(path.join(root, 'tasks', 'queue', '01-ajustar-main.md'), TASK)
  startTask(root, '01')
  return root
}

test('worktree: start cria árvore e branch; finish mergeia, conclui e limpa', async () => {
  const root = await makeProject()

  const started = startWorktree(root, '01')
  assert.ok(fs.existsSync(started.dir), 'worktree não criada')
  assert.equal(started.entry.branch, 'task/01-ajustar-main')
  assert.equal(listWorktrees(root).length, 1)

  fs.appendFileSync(path.join(started.dir, 'src', 'main.js'), '\n// ajuste da task\n')

  const res = finishWorktree(root, '01', { handoff: 'ajuste concluído' })
  assert.equal(res.finished.ok, true)
  assert.ok(!fs.existsSync(started.dir), 'worktree deveria ter sido removida')
  assert.equal(listWorktrees(root).length, 0)
  assert.ok(fs.existsSync(path.join(root, 'tasks', 'done', '01-ajustar-main.md')))

  const merged = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8')
  assert.match(merged, /ajuste da task/)

  const subject = execFileSync('git', ['log', '-1', '--format=%s'], {
    cwd: root,
    encoding: 'utf8'
  }).trim()
  assert.equal(subject, 'feat(task-01): ajustar main')
})

test('worktree: exige task ativa e prune limpa registro órfão', async () => {
  const root = path.join(tmpdir(), 'worktree-erros')
  await init([root, '--profile', 'script', '--git'])

  assert.throws(() => startWorktree(root, '99'), /task não está ativa/)

  fs.mkdirSync(path.join(root, 'tasks', 'queue'), { recursive: true })
  fs.writeFileSync(path.join(root, 'tasks', 'queue', '01-ajustar-main.md'), TASK)
  startTask(root, '01')
  const started = startWorktree(root, '01')

  fs.rmSync(started.dir, { recursive: true, force: true })
  const removed = pruneWorktrees(root)
  assert.equal(removed.length, 1)
  assert.equal(listWorktrees(root).length, 0)
})
