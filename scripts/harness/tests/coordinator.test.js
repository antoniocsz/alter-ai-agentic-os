// Coordenador de tarefas (feature coordenador-de-tarefas, task 137): plano por agente, validação
// (escopo, dependências, ACs), aprovação que cria as tasks e execução em ondas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parsePlanBlock, specAcs, validatePlan, waves } from '../src/lib/coordinator.js'
import { parseTask, queueDir } from '../src/lib/tasks.js'
import { init } from '../src/init.js'
import { tmpdir, write, withSilentStdout } from './helpers.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FAKE = path.join(HERE, 'fixtures', 'runtimes', 'fake-flow-agent.js')
const BIN = path.resolve(HERE, '../bin/harness.js')

function fakeEnv(extra = {}) {
  const dir = tmpdir()
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(dir, 'claude.cmd'), `@"${process.execPath}" "${FAKE}" %*\r\n`)
  } else {
    const file = path.join(dir, 'claude')
    fs.writeFileSync(file, `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" "$@"\n`)
    fs.chmodSync(file, 0o755)
  }
  return { ...process.env, PATH: dir + path.delimiter + (process.env.PATH ?? ''), ...extra }
}

const t = (id, scope, deps = [], extra = {}) => ({ id, title: `t ${id}`, scope, depends_on: deps, criteria: ['ok'], ...extra })

test('coordenador: parse do bloco, ondas, validação de escopo/dependências/ACs', () => {
  assert.deepEqual(parsePlanBlock('x\n--- PLANO ---\n```json\n{"tasks":[]}\n```\n--- FIM ---'), { tasks: [] })
  assert.equal(parsePlanBlock('--- PLANO ---\nnão é json\n--- FIM ---'), null)
  assert.equal(parsePlanBlock('sem bloco'), null)
  assert.deepEqual(specAcs('- [ ] AC-1 — a\n- [ ] AC-2 — b\nAC-1 de novo'), ['AC-1', 'AC-2'])

  assert.deepEqual(waves([t('A', ['a']), t('B', ['b'], ['A']), t('C', ['c'], ['A']), t('D', ['d'], ['B', 'C'])]), [['A'], ['B', 'C'], ['D']])
  assert.throws(() => waves([t('A', ['a'], ['B']), t('B', ['b'], ['A'])]), /ciclo/)

  const ok = validatePlan({ tasks: [t('T1', ['src/a.js'], [], { acs: ['AC-1'] }), t('T2', ['src/a.js', 'src/b.js'], ['T1'], { acs: ['AC-9'] })] }, { specAcList: ['AC-1', 'AC-2'] })
  assert.deepEqual(ok.errors, [], 'escopo compartilhado entre tasks encadeadas é permitido')
  assert.deepEqual(ok.plan.waves, [['T1'], ['T2']])
  assert.ok(ok.warnings.some((w) => /AC-9 não existe na spec/.test(w)))
  assert.ok(ok.warnings.some((w) => /ACs da spec sem task: AC-2/.test(w)))

  const errs = (plan) => validatePlan(plan).errors.join('\n')
  assert.match(errs({ tasks: [t('T1', ['src/a.js']), t('T2', ['src/a.js'])] }), /T1 e T2 tocam src\/a\.js sem dependência/)
  assert.match(errs({ tasks: [t('T1', ['a'], ['T2']), t('T2', ['b'], ['T1'])] }), /ciclo/)
  assert.match(errs({ tasks: [t('T1', ['a'], ['T9'])] }), /depende de T9, que não está no plano/)
  assert.match(errs({ tasks: [t('T1', ['../fora.js'])] }), /caminho inválido/)
  assert.match(errs({ tasks: [t('T1', ['C:/x.js'])] }), /caminho inválido/)
  assert.match(errs({ tasks: [{ id: 'T1', title: 'x', scope: ['a'] }] }), /sem critério de conclusão/)
  assert.match(errs({ tasks: [t('T1', [])] }), /sem escopo/)
  assert.match(errs({ tasks: [t('T1', ['a']), t('T1', ['b'])] }), /ids repetidos/)
  assert.match(errs({ tasks: [t('T1', ['a'], [], { type: 'xyz' })] }), /type inválido/)
  assert.match(errs({}), /sem lista `tasks`/)
  assert.match(validatePlan({ tasks: Array.from({ length: 3 }, (_, i) => t(`T${i}`, [`f${i}`])) }, { maxTasks: 2 }).errors.join(), /máximo 2/)
})

async function project() {
  const root = path.join(tmpdir(), 'proj-coord')
  await withSilentStdout(() => init([root, '--profile', 'script', '--git']))
  write(root, 'context/features/f1/spec.md', '# Spec: f1\n\n## Critérios de aceitação\n- [ ] AC-1 — a existe\n- [ ] AC-2 — b existe\n')
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'harness.json'), 'utf8'))
  cfg.wip = { ...(cfg.wip ?? {}), active: 5 }
  write(root, 'harness.json', JSON.stringify(cfg))
  spawnSync('git', ['-C', root, 'add', '-A'])
  spawnSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'spec'])
  return root
}

const cli = (root, env, ...args) => spawnSync(process.execPath, [BIN, 'coordinate', ...args], { cwd: root, encoding: 'utf8', env })

test('harness coordinate: plano do agente → edição → aprovação cria tasks com dependências → onda pronta roda', async () => {
  const root = await project()
  const env = fakeEnv()
  const planned = cli(root, env, 'plan', 'f1', '--tool', 'claude')
  assert.equal(planned.status, 0, planned.stderr + planned.stdout)
  assert.match(planned.stdout, /onda 1 \(podem rodar em paralelo\)[\s\S]*T1 +implementar a[\s\S]*T2 +implementar b[\s\S]*onda 2[\s\S]*T3 +documentar a e b/)
  const id = planned.stdout.match(/(plan-f1-\d+)/)[1]

  const shown = JSON.parse(cli(root, env, 'show', id, '--json').stdout)
  assert.equal(shown.status, 'proposed')
  shown.plan.tasks[1].title = 'implementar b (editado)'
  write(root, '.tmp/plano.json', JSON.stringify(shown))
  const edited = cli(root, env, 'edit', id, '--file', '.tmp/plano.json')
  assert.equal(edited.status, 0, edited.stderr)
  assert.match(edited.stdout, /implementar b \(editado\)/)
  shown.plan.tasks[2].depends_on = ['T9']
  write(root, '.tmp/ruim.json', JSON.stringify(shown))
  assert.match(cli(root, env, 'edit', id, '--file', '.tmp/ruim.json').stderr, /depende de T9/)

  const approved = cli(root, env, 'approve', id)
  assert.equal(approved.status, 0, approved.stderr)
  const files = fs.readdirSync(queueDir(root)).filter((f) => /-implementar|-documentar/.test(f)).sort()
  assert.equal(files.length, 3)
  const t3 = parseTask(path.join(queueDir(root), files.find((f) => /documentar/.test(f))))
  const nums = files.filter((f) => /implementar/.test(f)).map((f) => f.slice(0, 2))
  assert.equal(String(t3.values['Depende de']).replace(/[`\[\] ]/g, ''), nums.join(','), 'T3 depende das tasks criadas para T1 e T2')
  const t1 = fs.readFileSync(path.join(queueDir(root), files.find((f) => /implementar-a/.test(f))), 'utf8')
  assert.match(t1, /## Feature: f1/)
  assert.match(t1, /- \[ \] a\(\) retorna 1\n- \[ \] teste passa/)
  assert.match(t1, /- `src\/a\.js` → função a/)
  assert.match(t1, /## Especificação: a\(\) retorna 1/)
  assert.doesNotMatch(t1, /\[verificação objetiva\]|\[estado atual do código\]/)
  assert.notEqual(cli(root, env, 'approve', id).status, 0, 'aprovar de novo é recusado')

  const dry = cli(root, env, 'next', id, '--tool', 'claude', '--dry-run')
  assert.match(dry.stdout, /próxima onda de .*: T1 .*T2 /)
  assert.doesNotMatch(dry.stdout, /T3/)

  const ran = cli(root, env, 'next', id, '--tool', 'claude', '--review', 'claude', '--no-context')
  assert.equal(ran.status, 0, ran.stderr + ran.stdout)
  assert.match(ran.stdout, /✅ T1 .*: completed/)
  assert.match(ran.stdout, /✅ T2 .*: completed/)
  const status = JSON.parse(cli(root, env, 'status', id, '--json').stdout)
  assert.deepEqual(status.items.map((i) => [i.id, i.state, i.flow?.status ?? null, i.ready]), [
    ['T1', 'active', 'completed', false],
    ['T2', 'active', 'completed', false],
    ['T3', 'queue', null, false]
  ])
  assert.match(cli(root, env, 'next', id, '--tool', 'claude').stdout, /nada pronto: .* em andamento/)

  // Integração simulada: T1 e T2 concluídas → T3 fica pronta.
  for (const it of status.items.slice(0, 2)) fs.renameSync(path.join(root, 'tasks', 'active', it.task), path.join(root, 'tasks', 'done', it.task))
  assert.match(cli(root, env, 'next', id, '--tool', 'claude', '--dry-run').stdout, /próxima onda de .*: T3 /)
  assert.match(cli(root, env, 'list').stdout, /approved · 3 task\(s\)/)
})

test('harness coordinate: guardas — coordenador que escreve, resposta sem bloco, plano inválido, rejeição', async () => {
  const root = await project()
  const w = cli(root, fakeEnv({ FAKE_PLAN: 'write' }), 'plan', 'f1', '--tool', 'claude')
  assert.notEqual(w.status, 0)
  assert.match(w.stderr, /alterou arquivos/)
  fs.rmSync(path.join(root, 'coordenador.txt'))
  assert.match(cli(root, fakeEnv({ FAKE_PLAN: 'noblock' }), 'plan', 'f1', '--tool', 'claude').stderr, /sem o bloco --- PLANO ---/)
  assert.match(cli(root, fakeEnv({ FAKE_PLAN: 'overlap' }), 'plan', 'f1', '--tool', 'claude').stderr, /plano do coordenador inválido[\s\S]*T1 e T2 tocam src\/a\.js/)
  assert.match(cli(root, fakeEnv(), 'plan', 'nao-existe', '--tool', 'claude').stderr, /feature sem spec/)
  assert.match(cli(root, fakeEnv(), 'plan', 'f1', '--tool', 'claude', '--max-tasks', '50').stderr, /--max-tasks inválido/)

  const ok = cli(root, fakeEnv(), 'plan', 'f1', '--tool', 'claude')
  const id = ok.stdout.match(/(plan-f1-\d+)/)[1]
  assert.match(cli(root, fakeEnv(), 'approve', id, '--only', 'T3').stderr, /T3 depende de T1, que ficaria de fora/)
  assert.equal(cli(root, fakeEnv(), 'reject', id).status, 0)
  assert.match(cli(root, fakeEnv(), 'approve', id).stderr, /está rejected/)
  assert.match(cli(root, fakeEnv(), 'next', id, '--tool', 'claude').stderr, /aprove antes/)
})
