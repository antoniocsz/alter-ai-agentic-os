// Orquestração encadeada (feature orquestracao-encadeada, task 121): implementar → revisar →
// corrigir na mesma worktree, rodadas, aprovação humana, retomada e guarda do revisor só-leitura.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { openDb } from '../src/lib/db.js'
import { init } from '../src/init.js'
import { startTask } from '../src/lib/pipeline.js'
import { startWorktree } from '../src/lib/worktree.js'
import { flowSteps, getFlow, listFlows, nextStep, parseAgentSpec, parseVerdict } from '../src/lib/flows.js'
import * as codex from '../src/lib/runtimes/codex.js'
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
  const root = path.join(tmpdir(), 'proj-flow')
  await withSilentStdout(() => init([root, '--profile', 'script', '--git']))
  write(root, 'tasks/queue/07-exemplo.md', TASK)
  assert.equal(startTask(root, '07').ok, true)
  const wt = await withSilentStdout(() => startWorktree(root, '07'))
  return { root, wtDir: wt.dir }
}

function control(verdicts) {
  const dir = tmpdir()
  if (verdicts) fs.writeFileSync(path.join(dir, 'verdicts'), verdicts)
  return dir
}

const cli = (root, env, ...args) => spawnSync(process.execPath, [BIN, 'flow', ...args], { cwd: root, encoding: 'utf8', env })
const lastFlow = (root) => {
  const db = openDb(root)
  try {
    const f = listFlows(db)[0]
    return { flow: getFlow(db, f.id), steps: flowSteps(db, f.id) }
  } finally {
    db.close()
  }
}
const prompts = (dir) => fs.readdirSync(path.join(dir, 'prompts')).sort((a, b) => parseInt(a) - parseInt(b))

test('flows: parseVerdict, parseAgentSpec, nextStep e codex read-only', () => {
  assert.deepEqual(parseVerdict('ok\n**VEREDITO: APROVADO**'), { verdict: 'approved', notes: null })
  const ch = parseVerdict('vi\nVEREDITO: MUDANÇAS\n1. a.js: x')
  assert.equal(ch.verdict, 'changes')
  assert.match(ch.notes, /1\. a\.js: x/)
  assert.equal(parseVerdict('veredito: changes requested').verdict, 'changes')
  assert.equal(parseVerdict('sem nada'), null)
  assert.deepEqual(parseAgentSpec('codex:gpt-5', 'review'), { tool: 'codex', model: 'gpt-5' })
  assert.deepEqual(parseAgentSpec('claude', 'implement'), { tool: 'claude', model: null })
  assert.throws(() => parseAgentSpec(true, 'review'), /--review exige a tool/)

  const flow = { rounds: 2 }
  const st = (role, status, verdict = null) => ({ role, status, verdict })
  assert.deepEqual(nextStep(flow, []), { role: 'implement' })
  assert.deepEqual(nextStep(flow, [st('implement', 'completed')]), { role: 'review' })
  assert.deepEqual(nextStep(flow, [st('implement', 'completed'), st('review', 'completed', 'approved')]), { done: true })
  assert.deepEqual(nextStep(flow, [st('implement', 'completed'), st('review', 'completed', 'changes')]), { role: 'fix' })
  assert.ok(nextStep(flow, [st('implement', 'completed'), st('review', 'completed', 'changes'), st('fix', 'completed'), st('review', 'completed', 'changes')]).needsHuman)
  assert.deepEqual(nextStep(flow, [st('implement', 'failed')]), { retry: 'implement' })

  assert.deepEqual(codex.command({ readOnly: true }).slice(0, 4), ['exec', '--json', '--sandbox', 'read-only'])
  assert.deepEqual(codex.command({ readOnly: true, unsafe: true }).slice(0, 4), ['exec', '--json', '--sandbox', 'danger-full-access'])
})

test('harness flow: implementar → revisar (mudanças) → corrigir → revisar (aprovado); diff e notas chegam ao prompt', async () => {
  const { root, wtDir } = await project()
  const ctl = control('changes,approved')
  const env = fakeEnv({ FAKE_FLOW_DIR: ctl })
  const res = cli(root, env, '07', '--implement', 'claude', '--review', 'claude', '--no-context')
  assert.equal(res.status, 0, res.stderr + res.stdout)
  assert.match(res.stdout, /etapa 1: implementar · claude/)
  assert.match(res.stdout, /revisão: MUDANÇAS/)
  assert.match(res.stdout, /revisão: APROVADO/)
  assert.match(res.stdout, /harness worktree finish 07-exemplo\.md/)

  const { flow, steps } = lastFlow(root)
  assert.equal(flow.status, 'completed')
  assert.deepEqual(steps.map((s) => [s.role, s.status, s.verdict]), [
    ['implement', 'completed', null],
    ['review', 'completed', 'changes'],
    ['fix', 'completed', null],
    ['review', 'completed', 'approved']
  ])
  assert.ok(steps.every((s) => s.run_id), 'cada etapa é um run registrado')
  assert.equal(fs.readFileSync(path.join(wtDir, 'src', 'a.js'), 'utf8'), '// implement 1\n// fix 3\n')

  const files = prompts(ctl)
  assert.deepEqual(files.map((f) => f.replace(/^\d+-|\.txt$/g, '')), ['implement', 'review', 'fix', 'review'])
  const review = fs.readFileSync(path.join(ctl, 'prompts', files[1]), 'utf8')
  assert.match(review, /Você é o REVISOR/)
  assert.match(review, /MUDANÇA A REVISAR/)
  assert.match(review, /\/\/ implement 1/, 'diff da worktree (arquivo novo) vai no prompt do revisor')
  const fix = fs.readFileSync(path.join(ctl, 'prompts', files[2]), 'utf8')
  assert.match(fix, /REVISÃO A ATENDER[\s\S]*falta tratar entrada vazia/)

  const again = cli(root, env, '07', '--implement', 'claude', '--review', 'claude')
  assert.equal(again.status, 0, 'fluxo concluído não bloqueia um novo')
})

test('harness flow: --approve review pausa após a revisão; resume com --note leva a instrução à correção; rodadas esgotadas pedem humano', async () => {
  const { root } = await project()
  const ctl = control('changes,changes,approved')
  const env = fakeEnv({ FAKE_FLOW_DIR: ctl })
  const first = cli(root, env, '07', '--implement', 'claude', '--review', 'claude', '--rounds', '2', '--approve', 'review', '--no-context')
  assert.equal(first.status, 0, first.stderr)
  assert.match(first.stdout, /aguardando aprovação/)
  let { flow, steps } = lastFlow(root)
  assert.deepEqual([flow.status, steps.length], ['waiting_approval', 2])

  const blocked = cli(root, env, '07', '--implement', 'claude', '--review', 'claude')
  assert.notEqual(blocked.status, 0)
  assert.match(blocked.stderr, /já tem um fluxo aberto/)

  const resumed = cli(root, env, 'resume', flow.id, '--note', 'use early return')
  assert.equal(resumed.status, 0, resumed.stderr)
  ;({ flow, steps } = lastFlow(root))
  assert.equal(flow.status, 'needs_human', '2ª revisão com mudanças esgota as rodadas: pede humano')
  assert.match(flow.error, /2 revisão\(ões\) sem aprovação/)
  const fixPrompt = fs.readFileSync(path.join(ctl, 'prompts', prompts(ctl)[2]), 'utf8')
  assert.match(fixPrompt, /INSTRUÇÕES DO HUMANO[\s\S]*use early return/)
  assert.equal(flow.human_note, null, 'nota consumida')

  const more = cli(root, env, 'resume', flow.id)
  assert.equal(more.status, 0, more.stderr)
  ;({ flow, steps } = lastFlow(root))
  assert.equal(flow.rounds, 3, 'humano concede mais uma rodada')
  assert.equal(flow.status, 'completed')
  assert.match(cli(root, env, 'show', flow.id).stdout, /6\. revisar · claude · completed · APROVADO/)
})

test('harness flow: revisor que altera a worktree ou não dá veredito falha; resume repete a etapa; stop encerra', async () => {
  const { root, wtDir } = await project()
  const ctl = control('approved,none,approved')
  const bad = cli(root, fakeEnv({ FAKE_FLOW_DIR: ctl, FAKE_REVIEW_WRITE: '1' }), '07', '--implement', 'claude', '--review', 'claude', '--no-context')
  assert.notEqual(bad.status, 0)
  assert.match(bad.stdout, /o revisor alterou a worktree/)
  let { flow } = lastFlow(root)
  assert.equal(flow.status, 'failed')
  fs.rmSync(path.join(wtDir, 'revisor.txt'))

  const noVerdict = cli(root, fakeEnv({ FAKE_FLOW_DIR: ctl }), 'resume', flow.id)
  assert.notEqual(noVerdict.status, 0)
  assert.match(noVerdict.stdout, /revisor não deu veredito/)
  const ok = cli(root, fakeEnv({ FAKE_FLOW_DIR: ctl }), 'resume', flow.id)
  assert.equal(ok.status, 0, ok.stdout + ok.stderr)
  ;({ flow } = lastFlow(root))
  assert.equal(flow.status, 'completed')
  assert.notEqual(cli(root, fakeEnv(), 'resume', flow.id).status, 0, 'concluído não retoma')

  const ctl2 = control()
  const failing = cli(root, fakeEnv({ FAKE_FLOW_DIR: ctl2, FAKE_EXIT_ROLE: 'implement' }), '07', '--implement', 'claude', '--review', 'claude', '--no-context')
  assert.notEqual(failing.status, 0)
  ;({ flow } = lastFlow(root))
  assert.match(flow.error, /^implement: /)
  const stopped = cli(root, fakeEnv(), 'stop', flow.id)
  assert.equal(stopped.status, 0, stopped.stderr)
  assert.equal(lastFlow(root).flow.status, 'stopped')
  assert.match(cli(root, fakeEnv(), 'list').stdout, /stopped/)

  const oc = cli(root, fakeEnv(), '07', '--implement', 'opencode', '--review', 'claude')
  assert.notEqual(oc.status, 0)
  assert.match(oc.stderr, /implementar \(opencode\): .*exige --unsafe/)
  assert.notEqual(cli(root, fakeEnv(), '07', '--implement', 'claude').status, 0, '--review obrigatório')
  assert.notEqual(cli(root, fakeEnv(), '07', '--implement', 'claude', '--review', 'claude', '--approve', 'sempre').status, 0)
})
