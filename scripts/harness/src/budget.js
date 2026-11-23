import { openDb } from './lib/db.js'
import { parseArgs, flagBool } from './lib/flags.js'
import { resolveConfig } from './lib/config.js'
import { activeDir, listTasks } from './lib/tasks.js'
import { readBudget, usageSummary, checkBudget } from './lib/budget.js'
import { reapOrphans } from './lib/runs.js'

const fmtTokens = (n) => Number(n).toLocaleString('pt-BR')
const fmtUsd = (n) => `$${Number(n).toFixed(2)}`

function cell(used, limit, fmt) {
  return limit === null || limit === undefined ? fmt(used) : `${fmt(used)} / ${fmt(limit)}`
}

function state(used, limits) {
  if (!limits) return '—'
  const over = ['tokens', 'usd'].some((m) => limits[m] !== null && limits[m] !== undefined && used[m] >= limits[m])
  if (over) return 'ESTOUROU'
  const near = ['tokens', 'usd'].some((m) => limits[m] && used[m] >= 0.8 * limits[m])
  return near ? 'perto (≥80%)' : 'ok'
}

/** `harness budget [--json]` — consumo medido contra os limites do harness.json (task 106). */
export async function budgetCmd(args) {
  const root = process.cwd()
  const { flags } = parseArgs(args)
  const budget = readBudget(resolveConfig(root))
  const db = openDb(root)
  try {
    reapOrphans(db)
    const summary = usageSummary(db)
    const active = listTasks(activeDir(root))
    const tasks = active.map((id) => {
      const used = summary.tasks[id] ?? { tokens: 0, usd: 0, runs: 0, unmeasured: 0 }
      const check = checkBudget(db, budget, { taskId: id, summary })
      return { task: id, ...used, ok: check.ok, violations: check.violations }
    })

    if (flagBool(flags, 'json')) {
      process.stdout.write(JSON.stringify({ budget, today: summary.today, month: summary.month, total: summary.total, active_tasks: tasks }, null, 2) + '\n')
      return
    }

    const out = []
    out.push(budget ? 'Orçamento — consumo MEDIDO contra os limites do harness.json' : 'Consumo MEDIDO (nenhum limite em harness.json → budget)')
    const rows = [
      [`hoje (${summary.today.date})`, summary.today, budget?.day],
      [`mês (${summary.month.month})`, summary.month, budget?.month],
      ...tasks.map((t) => [`task ${t.task}`, t, budget?.task])
    ]
    const table = [['escopo', 'tokens', 'usd', 'runs', 'estado']]
    for (const [label, used, limits] of rows) {
      table.push([
        label,
        cell(used.tokens, limits?.tokens, fmtTokens),
        cell(used.usd, limits?.usd, fmtUsd),
        String(used.runs),
        state(used, limits)
      ])
    }
    const widths = table[0].map((_, i) => Math.max(...table.map((r) => r[i].length)))
    for (const [i, r] of table.entries()) {
      out.push(r.map((c, j) => c.padEnd(widths[j])).join('  ').trimEnd())
      if (i === 0) out.push(widths.map((w) => '-'.repeat(w)).join('  '))
    }
    if (budget?.run) {
      const parts = [budget.run.tokens && `${fmtTokens(budget.run.tokens)} tokens`, budget.run.usd && fmtUsd(budget.run.usd)].filter(Boolean)
      out.push(`limite por execução: ${parts.join(' · ')}`)
    }
    if (summary.total.unmeasured > 0) {
      out.push(`⚠️  ${summary.total.unmeasured} run(s) sem uso reportado pela tool — não entram na soma (o consumido é um piso).`)
    }
    process.stdout.write(out.join('\n') + '\n')
  } finally {
    db.close()
  }
}
