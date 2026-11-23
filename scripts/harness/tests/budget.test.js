import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { openDb } from '../src/lib/db.js'
import { startRun, finishRun } from '../src/lib/runs.js'
import { validateConfig } from '../src/lib/config.js'
import { readBudget, usageSummary, checkBudget, effectiveRunLimit, formatViolation } from '../src/lib/budget.js'
import { tmpdir, write } from './helpers.js'

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/harness.js')
const NOW = new Date(2026, 10, 23, 15, 0, 0) // 23/11/2026 15h (horário local)
const at = (d) => d.toISOString()

/** Run concluído com uso (ou sem uso, quando `usage` é null), iniciado em `when`. */
function seedRun(db, taskId, when, usage) {
  const id = startRun(db, { taskId, tool: 'claude' })
  finishRun(db, id, { status: 'completed', exitCode: 0, usage })
  db.prepare('UPDATE runs SET started_at = ? WHERE id = ?').run(at(when), id)
  return id
}

function seeded() {
  const root = tmpdir()
  const db = openDb(root)
  seedRun(db, '01-a.md', new Date(2026, 10, 23, 9), { tokensIn: 1000, tokensOut: 500, costUsd: 1.5 }) // hoje
  seedRun(db, '01-a.md', new Date(2026, 10, 23, 10), null) // hoje, sem uso reportado
  seedRun(db, '02-b.md', new Date(2026, 10, 5, 10), { tokensIn: 2000, tokensOut: 0, costUsd: 3 }) // mês
  seedRun(db, '02-b.md', new Date(2026, 9, 30, 10), { tokensIn: 9000, tokensOut: 1000, costUsd: 9 }) // mês passado
  seedRun(db, '03-c.md', new Date(2026, 10, 23, 11), { tokensIn: 100, tokensOut: 50, costUsd: null }) // codex: sem USD
  return { root, db }
}

test('validateConfig: budget válido passa; escopo, métrica e valores inválidos reprovam', () => {
  assert.deepEqual(validateConfig({ profile: 'bare', budget: { run: { tokens: 300000, usd: 5 }, day: { usd: 50 } } }), [])
  const errors = validateConfig({ profile: 'bare', budget: { week: { usd: 1 }, day: { usd: 0 }, run: { tokens: 1.5, eur: 2 } } })
  for (const frag of ['budget.week: escopo desconhecido', 'budget.day.usd deve ser número > 0', 'budget.run.tokens deve ser inteiro', 'budget.run.eur: métrica desconhecida']) {
    assert.ok(errors.some((e) => e.includes(frag)), frag)
  }
  assert.ok(validateConfig({ profile: 'bare', budget: 10 }).some((e) => e.includes('budget deve ser um objeto')))
  assert.equal(readBudget({}), null)
  assert.deepEqual(readBudget({ budget: { day: { usd: 50 } } }), { run: null, task: null, day: { tokens: null, usd: 50 }, month: null })
})

test('usageSummary: soma só uso medido por dia/mês local e por task; conta os não medidos', () => {
  const { db } = seeded()
  const s = usageSummary(db, { now: NOW })
  assert.deepEqual([s.today.tokens, s.today.usd, s.today.runs, s.today.unmeasured], [1650, 1.5, 3, 1])
  assert.deepEqual([s.month.tokens, s.month.usd, s.month.runs], [3650, 4.5, 4])
  assert.deepEqual([s.tasks['02-b.md'].tokens, s.tasks['02-b.md'].usd], [12000, 12], 'task soma todo o histórico')
  assert.equal(s.tasks['03-c.md'].usd, 0, 'sem USD reportado não vira custo')
  assert.equal(s.total.unmeasured, 1)
  db.close()
})

test('checkBudget + effectiveRunLimit: violações, saldo e limite do run', () => {
  const { db } = seeded()
  const budget = readBudget({ budget: { run: { tokens: 5000, usd: 5 }, task: { usd: 10 }, day: { usd: 2 }, month: { tokens: 100000 } } })

  const b = checkBudget(db, budget, { taskId: '02-b.md', now: NOW })
  assert.equal(b.ok, false)
  assert.deepEqual(b.violations.map((v) => [v.scope, v.metric]), [['task', 'usd']], 'task 02 já gastou $12 de $10')
  assert.match(formatViolation(b.violations[0]), /task: \$12\.00 de \$10\.00/)

  const a = checkBudget(db, budget, { taskId: '01-a.md', now: NOW })
  assert.equal(a.ok, true)
  assert.equal(a.remaining.usd, 0.5, 'menor saldo: dia ($2 - $1,50)')
  assert.equal(a.remaining.tokens, 100000 - 3650)
  assert.deepEqual(effectiveRunLimit(budget, a.remaining), { tokens: 5000, usd: 0.5 })

  const tight = readBudget({ budget: { day: { usd: 1.5 } } })
  const c = checkBudget(db, tight, { taskId: '01-a.md', now: NOW })
  assert.deepEqual(c.violations.map((v) => v.scope), ['day'], 'atingir o limite já bloqueia')
  assert.equal(effectiveRunLimit(null, {}), null)
  assert.equal(checkBudget(db, null, { taskId: '01-a.md' }).ok, true)
  db.close()
})

test('harness budget (CLI): sem limites mostra o consumo; com limites mostra estado e aviso de não medidos', () => {
  const { root, db } = seeded()
  db.prepare("UPDATE runs SET started_at = ?").run(at(new Date())) // tudo "hoje" no relógio real
  db.close()
  write(root, 'tasks/active/01-a.md', '# Task: a\n')
  const cli = (args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' })

  const plain = cli(['budget'])
  assert.equal(plain.status, 0, plain.stderr)
  assert.match(plain.stdout, /nenhum limite em harness\.json/)
  assert.match(plain.stdout, /1 run\(s\) sem uso reportado/)

  write(root, 'harness.json', JSON.stringify({ profile: 'bare', budget: { day: { usd: 10 }, task: { usd: 1 }, run: { tokens: 1000 } } }))
  const limited = cli(['budget'])
  assert.match(limited.stdout, /^hoje \(\d{4}-\d{2}-\d{2}\)\s+[\d.]+\s+\$13\.50 \/ \$10\.00\s+5\s+ESTOUROU/m)
  assert.match(limited.stdout, /task 01-a\.md\s+.*\$1\.50 \/ \$1\.00\s+2\s+ESTOUROU/)
  assert.match(limited.stdout, /limite por execução: 1\.000 tokens/)

  const json = JSON.parse(cli(['budget', '--json']).stdout)
  assert.equal(json.budget.day.usd, 10)
  assert.equal(json.today.usd, 13.5)
  assert.equal(json.active_tasks[0].ok, false)
  assert.equal(json.active_tasks[0].violations[0].scope, 'task')
})
