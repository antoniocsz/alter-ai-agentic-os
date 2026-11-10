import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  parseEvery,
  nextRun,
  loadRoutines,
  fireRoutine,
  startScheduler,
  routinesFile
} from '../src/routines.js'
import { createTaskFile, slugify } from '../src/task.js'
import { openDb } from '../src/lib/db.js'
import { queueDir, listTasks } from '../src/lib/tasks.js'
import { tmpdir, write } from './helpers.js'

const SPEC = {
  routines: [
    {
      id: 'retro-semanal',
      every: 'weekly@seg@09:00',
      task: {
        title: 'Retro da semana',
        module: 'harness',
        priority: 'P2',
        agent: 'backend',
        scope: ['context/project/retro/'],
        type: 'docs'
      },
      dedupe: true
    }
  ]
}

const BIN = path.resolve(fileURLToPath(import.meta.url), '../../bin/harness.js')

const writeRoutines = (root, data) => {
  fs.mkdirSync(path.dirname(routinesFile(root)), { recursive: true })
  fs.writeFileSync(routinesFile(root), typeof data === 'string' ? data : JSON.stringify(data))
}

function runCli(root, args) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' })
}

function eventsOf(root, taskId) {
  const db = openDb(root)
  const rows = db.prepare('SELECT * FROM task_events WHERE task_id = ? ORDER BY id').all(taskId)
  db.close()
  return rows
}

function routineEvents(root) {
  const db = openDb(root)
  const events = db.prepare("SELECT * FROM task_events WHERE event LIKE 'routine%' ORDER BY id").all()
  const interactions = db.prepare("SELECT * FROM interactions WHERE source = 'routines' ORDER BY id").all()
  db.close()
  return { events, interactions }
}

test('nextRun: intervalos (+15m, +1h, +90m)', () => {
  const agora = new Date(2026, 10, 9, 12, 0, 0, 0)
  assert.equal(nextRun('15m', agora).getTime(), agora.getTime() + 15 * 60_000)
  assert.equal(nextRun('1h', agora).getTime(), agora.getTime() + 3_600_000)
  assert.equal(nextRun('90m', agora).getTime(), agora.getTime() + 90 * 60_000)
})

test('nextRun: daily — hoje, depois da meia-noite e no dia seguinte (fuso local)', () => {
  // `now` por componentes locais e comparação em epoch: hora/dia construídos via
  // UTC deslocariam em fuso não-neutro e o teste pegaria a derivada.
  const segundaManha = new Date(2026, 10, 9, 8, 15)
  assert.equal(nextRun('daily@09:00', segundaManha).getTime(), new Date(2026, 10, 9, 9, 0).getTime())

  const quaseMeiaNoite = new Date(2026, 10, 9, 23, 50)
  assert.equal(nextRun('daily@00:15', quaseMeiaNoite).getTime(), new Date(2026, 10, 10, 0, 15).getTime())
  assert.equal(nextRun('daily@23:30', quaseMeiaNoite).getTime(), new Date(2026, 10, 10, 23, 30).getTime())

  const pontual = new Date(2026, 10, 9, 9, 0)
  assert.equal(nextRun('daily@09:00', pontual).getTime(), new Date(2026, 10, 10, 9, 0).getTime())
})

test('nextRun: weekly — próximo dia da semana e +7 dias cruzando meia-noite', () => {
  const terca = new Date(2026, 10, 10, 10, 0)
  assert.equal(nextRun('weekly@dom@09:00', terca).getTime(), new Date(2026, 10, 15, 9, 0).getTime())
  assert.equal(nextRun('weekly@ter@12:00', terca).getTime(), new Date(2026, 10, 10, 12, 0).getTime())
  assert.equal(nextRun('weekly@ter@07:00', terca).getTime(), new Date(2026, 10, 17, 7, 0).getTime())
  assert.equal(nextRun('weekly@sab@08:00', terca).getTime(), new Date(2026, 10, 14, 8, 0).getTime())
  assert.equal(nextRun('weekly@sáb@08:00', terca).getTime(), new Date(2026, 10, 14, 8, 0).getTime())
})

test('parseEvery/nextRun: every inválido → null e throw com mensagem clara', () => {
  for (const bad of [
    '15x', 'm', '0m', '0h', '',
    'daily@25:00', 'daily@09:99', 'daily@0900',
    'weekly@seg@09:00:00', 'weekly@coiso@09:00', 'weekly@seg@24:00'
  ]) {
    assert.equal(parseEvery(bad), null, JSON.stringify(bad))
  }
  assert.throws(() => nextRun('15x'), /every inválido/)
})

test('loadRoutines: exemplo da spec é válido (metadados, dedupe)', () => {
  const root = tmpdir()
  writeRoutines(root, SPEC)
  const { routines, errors } = loadRoutines(root)
  assert.deepEqual(errors, [])
  assert.equal(routines.length, 1)
  const [r] = routines
  assert.equal(r.id, 'retro-semanal')
  assert.equal(r.every, 'weekly@seg@09:00')
  assert.equal(r.dedupe, true)
  assert.equal(r.task.description, 'Retro da semana')
  assert.equal(r.task.module, 'harness')
  assert.equal(r.task.agent, 'backend')
  assert.equal(r.task.priority, 'P2')
  assert.equal(r.task.type, 'docs')
  assert.deepEqual(r.task.scope, ['context/project/retro/'])
})

test('loadRoutines: arquivo ausente → nenhuma rotina, nenhum erro', () => {
  const root = tmpdir()
  const { routines, errors } = loadRoutines(root)
  assert.deepEqual(routines, [])
  assert.deepEqual(errors, [])
})

test('loadRoutines: JSON quebrado e estrutura errada → erro claro, nada carregado', () => {
  const root = tmpdir()
  writeRoutines(root, '{"routines": [')
  let res = loadRoutines(root)
  assert.equal(res.routines.length, 0)
  assert.match(res.errors[0], /routines\.json inválido \(JSON\)/)

  writeRoutines(root, '{"routines": "nope"}')
  res = loadRoutines(root)
  assert.match(res.errors[0], /lista de rotinas/)

  writeRoutines(root, '[{"id":"x"}]')
  res = loadRoutines(root)
  assert.match(res.errors[0], /deve ser um objeto/)
})

test('loadRoutines: AC-1 — rotina inválida é ignorada com mensagem clara, válida sobrevive', () => {
  const root = tmpdir()
  writeRoutines(root, {
    routines: [
      { id: 'ok', every: '15m', task: { title: 'Tarefa ok' } },
      { id: 'quebrada', every: '1x', task: { title: '', priority: 'P9' } }
    ]
  })
  const { routines, errors } = loadRoutines(root)
  assert.equal(routines.length, 1)
  assert.equal(routines[0].id, 'ok')
  assert.equal(errors.length, 1)
  const msg = errors[0]
  assert.match(msg, /rotina "quebrada" é inválida e foi ignorada/)
  assert.match(msg, /every "1x" inválido/)
  assert.match(msg, /task\.title é obrigatório/)
  assert.match(msg, /task\.priority "P9" inválida/)
})

test('loadRoutines: valida id, tipo, scope, dedupe e id duplicado', () => {
  const root = tmpdir()
  writeRoutines(root, {
    routines: [
      { id: 'Deuída', every: '15m', task: { title: 'T' } },
      { id: 'tipo-ruim', every: '15m', task: { title: 'T', type: 'mergear' } },
      { id: 'scope-ruim', every: '15m', task: { title: 'T', scope: 'src/a.ts' } },
      { id: 'dedupe-ruim', every: '15m', task: { title: 'T' }, dedupe: 'yes' }
    ]
  })
  const { routines, errors } = loadRoutines(root)
  assert.deepEqual(routines, [])
  assert.equal(errors.length, 4)
  const msg = errors.join('\n')
  assert.match(msg, /rotina "Deuída"[\s\S]*?id inválido/)
  assert.match(msg, /rotina "tipo-ruim"[\s\S]*?task\.type "mergear" inválido/)
  assert.match(msg, /rotina "scope-ruim"[\s\S]*?lista de paths/)
  assert.match(msg, /rotina "dedupe-ruim"[\s\S]*?dedupe deve ser boolean/)

  writeRoutines(root, {
    routines: [
      { id: 'dup', every: '15m', task: { title: 'T' } },
      { id: 'dup', every: '1h', task: { title: 'T' } }
    ]
  })
  const again = loadRoutines(root)
  assert.equal(again.routines.filter((r) => r.id === 'dup').length, 1)
  assert.match(again.errors.join('\n'), /id duplicado "dup"/)
})

test('fireRoutine: cria task na queue com metadados e registra eventos (AC-2, AC-6)', () => {
  const root = tmpdir()
  writeRoutines(root, SPEC)

  const res = fireRoutine('retro-semanal', root)
  assert.equal(res.ok, true)
  assert.equal(res.created, true)
  assert.equal(res.skipped, false)
  assert.equal(res.task, '01-retro-da-semana.md')

  const content = fs.readFileSync(path.join(queueDir(root), res.task), 'utf8')
  assert.match(content, /# Task: Retro da semana/)
  assert.match(content, /## Módulo: `harness`/)
  assert.match(content, /## Prioridade: P2/)
  assert.match(content, /## Tipo: docs/)
  assert.match(content, /## Agente: `backend`/)
  assert.match(content, /- `context\/project\/retro\/`/)

  const events = eventsOf(root, res.task)
  assert.ok(events.some((e) => e.event === 'routine_fired' && e.message.includes('retro-semanal')))
  const { interactions } = routineEvents(root)
  assert.ok(
    interactions.some((i) => i.content.includes('routine_fired') && i.meta_json?.includes('retro-semanal'))
  )
})

test('fireRoutine: dedupe — segunda execução com mesmo título → skip logado, sem arquivo novo (AC-3)', () => {
  const root = tmpdir()
  writeRoutines(root, SPEC)

  const first = fireRoutine('retro-semanal', root)
  assert.equal(first.created, true)

  const second = fireRoutine('retro-semanal', root)
  assert.equal(second.ok, true)
  assert.equal(second.created, false)
  assert.equal(second.skipped, true)
  assert.equal(second.dedupe, true)
  assert.equal(second.task, '01-retro-da-semana.md')
  assert.deepEqual(listTasks(queueDir(root)), ['01-retro-da-semana.md'])

  const events = eventsOf(root, '01-retro-da-semana.md')
  assert.ok(events.some((e) => e.event === 'routine_skipped' && e.message.includes('dedupe')))
  const { interactions } = routineEvents(root)
  assert.ok(interactions.some((i) => i.content.includes('routine_skipped')))
})

test('fireRoutine: dedupe considera queue e active; concluída (done) não bloqueia', () => {
  const active = tmpdir()
  writeRoutines(active, SPEC)
  write(active, 'tasks/active/07-retro-da-semana.md', '# Task: Retro da semana\n')
  let res = fireRoutine('retro-semanal', active)
  assert.equal(res.skipped, true)
  assert.equal(res.task, '07-retro-da-semana.md')
  assert.deepEqual(listTasks(queueDir(active)), [])

  const concluded = tmpdir()
  writeRoutines(concluded, SPEC)
  write(concluded, 'tasks/done/05-retro-da-semana.md', '# Task: Retro da semana\n')
  res = fireRoutine('retro-semanal', concluded)
  assert.equal(res.created, true)
  assert.equal(res.task, '06-retro-da-semana.md')
  assert.ok(fs.existsSync(path.join(queueDir(concluded), '06-retro-da-semana.md')))
})

test('fireRoutine: sem dedupe cria task nova em cada disparo', () => {
  const root = tmpdir()
  writeRoutines(root, {
    routines: [{ id: 'triagem', every: '1h', task: { title: 'Triagem de bugs recebidos' } }]
  })
  const first = fireRoutine('triagem', root)
  const second = fireRoutine('triagem', root)
  assert.equal(first.created, true)
  assert.equal(second.created, true)
  assert.deepEqual(
    listTasks(queueDir(root)),
    ['01-triagem-de-bugs-recebidos.md', '02-triagem-de-bugs-recebidos.md']
  )
})

test('fireRoutine: rotina inexistente → erro e rotina_error registrado no banco (AC-6)', () => {
  const root = tmpdir()
  const res = fireRoutine('fantasma', root)
  assert.equal(res.ok, false)
  assert.match(res.error, /rotina não encontrada/)
  assert.ok(routineEvents(root).events.some((e) => e.task_id === 'routine:fantasma' && e.event === 'routine_error'))
})

test('fireRoutine: rotina com schema inválido → erro claro citando o schema (AC-1 + AC-6)', () => {
  const root = tmpdir()
  writeRoutines(root, {
    routines: [{ id: 'quebrada', every: '1x', task: { title: 'T' } }]
  })
  const res = fireRoutine('quebrada', root)
  assert.equal(res.ok, false)
  assert.match(res.error, /every "1x" inválido/)
  assert.ok(routineEvents(root).events.some((e) => e.task_id === 'routine:quebrada' && e.event === 'routine_error'))
  assert.deepEqual(listTasks(queueDir(root)), [])
})

test('startScheduler: stub até a integração do serve (task 86)', () => {
  const res = startScheduler()
  assert.equal(res.running, false)
  assert.match(res.reason, /task 86/)
})

test('createTaskFile: título → nome de arquivo igual ao CLI, valida prioridade, AC e título', () => {
  const root = tmpdir()
  assert.equal(slugify('Retro da semana'), 'retro-da-semana')
  const created = createTaskFile(root, { description: 'Mãe com acento' })
  assert.equal(created.name, '01-mae-com-acento.md')
  assert.ok(fs.existsSync(path.join(queueDir(root), created.name)))
  assert.match(fs.readFileSync(path.join(queueDir(root), created.name), 'utf8'), /## Prioridade: P2/)

  assert.throws(() => createTaskFile(root, { description: 'x', priority: 'P9' }), /prioridade inválida/)
  assert.throws(() => createTaskFile(root, { description: 'x', acs: ['AC-x'] }), /AC inválido/)
  assert.throws(() => createTaskFile(root, {}), /título/)
})

test('regressão: `harness task` (CLI) preserva o comportamento legado', () => {
  const root = tmpdir()
  const ok = runCli(root, [
    'task', 'Corrigir dedupe das rotinas', '--module', 'harness', '--priority', 'P1',
    '--type', 'fix', '--scope', 'scripts/harness/src/routines.js,scripts/harness/src/task.js',
    '--feature', 'rotinas', '--acs', 'AC-1,AC-2', '--dep', '82'
  ])
  assert.equal(ok.status, 0, ok.stdout + ok.stderr)
  assert.match(ok.stdout, /task criada: tasks[\\\/]queue[\\\/]01-corrigir-dedupe-das-rotinas\.md/)

  const content = fs.readFileSync(path.join(queueDir(root), '01-corrigir-dedupe-das-rotinas.md'), 'utf8')
  assert.match(content, /# Task: Corrigir dedupe das rotinas/)
  assert.match(content, /## Agente: `backend`/)
  assert.match(content, /## Módulo: `harness`/)
  assert.match(content, /## Feature: rotinas/)
  assert.match(content, /## Prioridade: P1/)
  assert.match(content, /## Tipo: fix/)
  assert.match(content, /## ACs: AC-1, AC-2/)
  assert.match(content, /## Depende de: \[ \] `82`/)
  assert.match(content, /- `scripts\/harness\/src\/routines\.js`/)
  assert.match(content, /- `scripts\/harness\/src\/task\.js`/)
  assert.match(content, /## Skills a carregar: codegen\.md \+ backend\.md/)

  const desc = runCli(root, ['task'])
  assert.notEqual(desc.status, 0)
  assert.match(desc.stderr, /uso: harness task/)
})
