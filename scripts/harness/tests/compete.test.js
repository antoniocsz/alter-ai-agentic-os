// Execução competitiva (feature execucao-competitiva, task 124): candidatas em worktrees
// próprias, comparação, juiz opcional (só leitura) e escolha aplicada na worktree da task.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { openDb } from '../src/lib/db.js'
import { init } from '../src/init.js'
import { startTask } from '../src/lib/pipeline.js'
import { startWorktree } from '../src/lib/worktree.js'
import { competitors, getCompetition, listCompetitions, parseCompetitors, parseWinner } from '../src/lib/competitions.js'
import { tmpdir, write, withSilentStdout } from './helpers.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FAKE = path.join(HERE, 'fixtures', 'runtimes', 'fake-flow-agent.js')
const BIN = path.resolve(HERE, '../bin/harness.js')

function fakeEnv(extra = {}) {
  const dir = tmpdir()
  for (const name of ['claude', 'opencode']) {
    if (process.platform === 'win32') {
      fs.writeFileSync(path.join(dir, `${name}.cmd`), `@"${process.execPath}" "${FAKE}" %*\r\n`)
    } else {
      const file = path.join(dir, name)
      fs.writeFileSync(file, `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" "$@"\n`)
      fs.chmodSync(file, 0o755)
    }
  }
  return { ...process.env, PATH: dir + path.delimiter + (process.env.PATH ?? ''), ...extra }
}

const TASK = `# Task: exemplo
## Agente: \`backend\` | Módulo: — | Prioridade: P2 | Tipo: feat
## Feature: —
## Escopo (arquivos que esta task vai tocar):
- \`src/a.js\`
## Depende de: —
## Contexto para ler: —
## Skills a carregar: —
## O que já existe: —
## O que criar: —
## Especificação: —
## Critério de conclusão:
- [ ] ok
## Complexidade: baixa
`

async function project() {
  const root = path.join(tmpdir(), 'proj-compete')
  await withSilentStdout(() => init([root, '--profile', 'script', '--git']))
  write(root, 'tasks/queue/07-exemplo.md', TASK)
  assert.equal(startTask(root, '07').ok, true)
  const wt = await withSilentStdout(() => startWorktree(root, '07'))
  return { root, wtDir: wt.dir }
}

const cli = (root, env, ...args) => spawnSync(process.execPath, [BIN, 'compete', ...args], { cwd: root, encoding: 'utf8', env })
const state = (root) => {
  const db = openDb(root)
  try {
    const c = listCompetitions(db)[0]
    return { comp: getCompetition(db, c.id), list: competitors(db, c.id) }
  } finally {
    db.close()
  }
}
const gitOut = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' })

test('compete: parseCompetitors e parseWinner', () => {
  assert.deepEqual(parseCompetitors('claude,codex:gpt-5,claude:opus'), [
    { key: 'claude', tool: 'claude', model: null },
    { key: 'codex', tool: 'codex', model: 'gpt-5' },
    { key: 'claude-2', tool: 'claude', model: 'opus' }
  ])
  assert.throws(() => parseCompetitors('claude'), /ao menos 2/)
  assert.throws(() => parseCompetitors(true), /--tools exige/)
  assert.deepEqual(parseWinner('blá\n**VENCEDOR: claude-2**', ['claude', 'claude-2']), { winner: 'claude-2', none: false })
  assert.deepEqual(parseWinner('VENCEDOR: NENHUM', ['claude']), { winner: null, none: true })
  assert.equal(parseWinner('VENCEDOR: outro', ['claude']), null)
  assert.equal(parseWinner('sem linha', ['claude']), null)
})

test('harness compete: candidatas em paralelo, comparação, juiz recomenda, pick aplica na worktree da task e limpa', async () => {
  const { root, wtDir } = await project()
  const env = fakeEnv({ FAKE_JUDGE_PICK: 'claude-2', FAKE_OUTSCOPE_MODEL: 'modelo-b' })
  const res = cli(root, env, '07', '--tools', 'claude:modelo-a,claude:modelo-b', '--judge', 'claude', '--no-context')
  assert.equal(res.status, 0, res.stderr + res.stdout)
  assert.match(res.stdout, /🏁 comp-07-/)
  assert.match(res.stdout, /claude vs claude-2/)
  assert.match(res.stdout, /juiz \(claude\): recomenda claude-2/)
  assert.match(res.stdout, /fora do escopo: fora\.js/)

  let { comp, list } = state(root)
  assert.equal(comp.status, 'ready')
  assert.equal(comp.judge_winner, 'claude-2')
  assert.deepEqual(list.map((c) => [c.key, c.status, c.files_changed]), [['claude', 'completed', 1], ['claude-2', 'completed', 2]])
  assert.deepEqual(list[1].out_of_scope, ['fora.js'])
  for (const c of list) assert.ok(fs.existsSync(path.join(root, c.dir)), 'worktree da candidata existe')
  assert.equal(gitOut(wtDir, 'status', '--porcelain').trim(), '', 'worktree da task intacta até a escolha')

  const bad = cli(root, env, 'pick', comp.id, 'nao-existe')
  assert.notEqual(bad.status, 0)
  assert.match(bad.stderr, /candidata inexistente/)

  const picked = cli(root, env, 'pick', comp.id, 'claude')
  assert.equal(picked.status, 0, picked.stderr)
  assert.match(fs.readFileSync(path.join(wtDir, 'src', 'a.js'), 'utf8'), /modelo modelo-a/)
  assert.ok(!fs.existsSync(path.join(wtDir, 'fora.js')))
  ;({ comp, list } = state(root))
  assert.deepEqual([comp.status, comp.winner], ['picked', 'claude'])
  for (const c of list) assert.ok(!fs.existsSync(path.join(root, c.dir)), 'candidatas removidas')
  assert.doesNotMatch(gitOut(root, 'branch', '--list', 'compete/*'), /compete\//, 'branches removidas')
  assert.match(gitOut(wtDir, 'status', '--porcelain'), /src\/a\.js/, 'vencedora fica pendente na worktree da task')

  const dirty = cli(root, env, '07', '--tools', 'claude,claude')
  assert.notEqual(dirty.status, 0)
  assert.match(dirty.stderr, /mudanças não commitadas/)
})

test('harness compete: candidata que falha, juiz que altera a worktree, discard e validações', async () => {
  const { root, wtDir } = await project()
  const env = fakeEnv({ FAKE_FAIL_MODEL: 'quebra', FAKE_JUDGE_WRITE: '1' })
  const res = cli(root, env, '07', '--tools', 'claude:ok-1,claude:quebra,claude:ok-2', '--judge', 'claude', '--max-parallel', '1', '--no-context')
  assert.equal(res.status, 0, res.stderr + res.stdout)
  let { comp, list } = state(root)
  assert.deepEqual(list.map((c) => c.status), ['completed', 'failed', 'completed'])
  assert.equal(comp.judge_winner, null)
  assert.match(comp.judge_notes, /juiz alterou a worktree/)
  fs.rmSync(path.join(wtDir, 'juiz.txt'))

  const pickFailed = cli(root, env, 'pick', comp.id, 'claude-2')
  assert.notEqual(pickFailed.status, 0)
  assert.match(pickFailed.stderr, /não concluiu/)

  const again = cli(root, env, '07', '--tools', 'claude,claude')
  assert.notEqual(again.status, 0)
  assert.match(again.stderr, /competição aberta/)

  const discard = cli(root, env, 'discard', comp.id)
  assert.equal(discard.status, 0, discard.stderr)
  ;({ comp, list } = state(root))
  assert.equal(comp.status, 'discarded')
  for (const c of list) assert.ok(!fs.existsSync(path.join(root, c.dir)))
  assert.match(cli(root, env, 'show', comp.id).stdout, /discarded/)
  assert.match(cli(root, env, 'list').stdout, /discarded/)

  assert.match(cli(root, env, '07', '--tools', 'claude').stderr, /ao menos 2/)
  assert.match(cli(root, env, '07', '--tools', 'claude,opencode').stderr, /opencode.*exige --unsafe/)
  assert.match(cli(root, env, '99', '--tools', 'claude,claude').stderr, /task não está ativa/)
})
