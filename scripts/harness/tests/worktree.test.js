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
  const branches = execFileSync('git', ['branch', '--list', 'task/01-*'], { cwd: root, encoding: 'utf8' })
  assert.equal(branches.trim(), '', 'branch órfã deveria ser removida')
})

test('worktree: arquivo fora do escopo bloqueia o merge', async () => {
  const root = await makeProject()
  const started = startWorktree(root, '01')

  fs.writeFileSync(path.join(started.dir, 'fora-do-escopo.js'), 'x\n')
  assert.throws(() => finishWorktree(root, '01', { skipGates: true }), /fora do escopo/)

  assert.ok(!fs.existsSync(path.join(root, 'fora-do-escopo.js')), 'não deveria mergear')
  assert.ok(fs.existsSync(path.join(root, 'tasks/active/01-ajustar-main.md')), 'task deve seguir ativa')
  assert.ok(fs.existsSync(started.dir), 'worktree deve ser preservada')
})

// Task 98: máquina sem identidade git (runner do CI, instalação nova). Com
// `user.useConfigOnly=true` o git não adivinha nome/e-mail — todo comando do
// harness que cria commit (inclusive o rebase que reaplica commits) precisa
// passar a própria identidade.
function withoutGitIdentity(fn) {
  const keys = [
    'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL',
    'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0', 'EMAIL'
  ]
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]))
  const emptyGlobal = path.join(tmpdir(), 'gitconfig-vazio')
  fs.writeFileSync(emptyGlobal, '')
  for (const k of keys) delete process.env[k]
  Object.assign(process.env, {
    GIT_CONFIG_GLOBAL: emptyGlobal,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'user.useConfigOnly',
    GIT_CONFIG_VALUE_0: 'true'
  })
  const restore = () => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  }
  return Promise.resolve().then(fn).finally(restore)
}

test('worktree finish: rebase sobre base que avançou funciona sem identidade git configurada', async () => {
  await withoutGitIdentity(async () => {
    const root = await makeProject()
    const started = startWorktree(root, '01')

    // A base avança depois do start (squash de outra task, como num lote paralelo)
    // → o rebase precisa reaplicar o commit desta task.
    fs.writeFileSync(path.join(root, 'outro.txt'), 'mudança intercalada\n')
    execFileSync('git', ['add', 'outro.txt'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'feat(task-02): outra task'], { cwd: root, stdio: 'ignore' })

    fs.appendFileSync(path.join(started.dir, 'src', 'main.js'), '\n// ajuste sem identidade\n')
    const res = finishWorktree(root, '01', { handoff: 'ok' })
    assert.equal(res.finished.ok, true)
    assert.match(fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8'), /ajuste sem identidade/)
    assert.ok(fs.existsSync(path.join(root, 'outro.txt')), 'o commit intercalado continua na base')
  })
})
