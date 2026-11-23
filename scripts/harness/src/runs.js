import { openDb, resolveTaskId } from './lib/db.js'
import { parseArgs, flagBool, flagString } from './lib/flags.js'
import { listRuns, runEvents, getRun, reapOrphans, runDurationMs } from './lib/runs.js'

function fmtDuration(ms) {
  if (ms === null || ms === undefined) return 'n/d'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

const fmtNum = (v) => (v === null || v === undefined ? 'n/d' : String(v))
const fmtCost = (v) => (v === null || v === undefined ? 'n/d' : `$${Number(v).toFixed(4)}`)

function toView(run) {
  return {
    id: run.id,
    task: run.task_id,
    tool: run.tool,
    model: run.model,
    status: run.status,
    started_at: run.started_at,
    finished_at: run.finished_at,
    duration_ms: runDurationMs(run),
    exit_code: run.exit_code,
    tokens_in: run.tokens_in,
    tokens_out: run.tokens_out,
    cost_usd: run.cost_usd,
    usage: run.measured ? 'medido' : 'n/d',
    unsafe: Boolean(run.unsafe),
    session_id: run.session_id,
    batch_id: run.batch_id ?? null,
    error: run.error
  }
}

/** `harness runs [<task>] [--batch <id>] [--json] [--limit n]` — execuções de agentes registradas. */
export async function runsCmd(args) {
  const root = process.cwd()
  const { positionals, flags } = parseArgs(args)
  const taskId = positionals[0] ? resolveTaskId(root, positionals[0]) : null
  const batchId = flagString(flags, 'batch')
  if (flags.batch === true) throw new Error('--batch exige o id do lote (ex.: harness runs --batch batch-20261123031500000)')
  const limit = Number(flagString(flags, 'limit', '50'))
  if (!Number.isInteger(limit) || limit <= 0) throw new Error(`--limit inválido: ${flags.limit} (use inteiro > 0)`)

  const db = openDb(root)
  try {
    reapOrphans(db)
    const rows = listRuns(db, { taskId: batchId ? null : taskId, batchId, limit })
      .filter((r) => !batchId || !taskId || r.task_id === taskId)
      .map(toView)
    if (flagBool(flags, 'json')) {
      process.stdout.write(JSON.stringify(rows, null, 2) + '\n')
      return
    }
    if (rows.length === 0) {
      process.stdout.write(`nenhuma execução registrada${batchId ? ` no lote ${batchId}` : ''}${taskId ? ` para ${taskId}` : ''}.\n`)
      return
    }
    const withBatch = rows.some((r) => r.batch_id)
    const header = ['run', ...(withBatch ? ['lote'] : []), 'task', 'tool', 'status', 'duração', 'tokens in/out', 'custo', 'uso']
    const lines = rows.map((r) => [
      r.id,
      ...(withBatch ? [r.batch_id ?? '—'] : []),
      r.task,
      r.tool + (r.unsafe ? ' (unsafe)' : ''),
      r.status,
      fmtDuration(r.duration_ms),
      `${fmtNum(r.tokens_in)}/${fmtNum(r.tokens_out)}`,
      fmtCost(r.cost_usd),
      r.usage
    ])
    const widths = header.map((h, i) => Math.max(h.length, ...lines.map((l) => String(l[i]).length)))
    const row = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ').trimEnd()
    process.stdout.write([row(header), row(widths.map((w) => '-'.repeat(w))), ...lines.map(row)].join('\n') + '\n')
  } finally {
    db.close()
  }
}

function summarize(e) {
  const p = e.payload
  if (p === null || p === undefined) return ''
  if (typeof p === 'string') return p
  const text = p.text ?? p.summary ?? p.name ?? p.path ?? p.reason ?? p.message
  if (text !== undefined) return String(text)
  return JSON.stringify(p)
}

/** `harness events <run> [--json] [--native]` — timeline normalizada de um run. */
export async function eventsCmd(args) {
  const root = process.cwd()
  const { positionals, flags } = parseArgs(args)
  const runId = positionals[0]
  if (!runId) throw new Error('uso: harness events <run> [--json] [--native]')

  const db = openDb(root)
  try {
    const run = getRun(db, runId)
    if (!run) throw new Error(`run não encontrado: ${runId} (veja \`harness runs\`)`)
    const events = runEvents(db, runId)
    if (flagBool(flags, 'json')) {
      process.stdout.write(JSON.stringify({ run: toView(run), events }, null, 2) + '\n')
      return
    }
    const v = toView(run)
    process.stdout.write(`# ${v.id} — ${v.task} (${v.tool}${v.model ? ` · ${v.model}` : ''}) — ${v.status}\n`)
    process.stdout.write(
      `   duração ${fmtDuration(v.duration_ms)} · tokens ${fmtNum(v.tokens_in)}/${fmtNum(v.tokens_out)} · custo ${fmtCost(v.cost_usd)} (${v.usage})\n\n`
    )
    if (events.length === 0) process.stdout.write('  (nenhum evento)\n')
    const showNative = flagBool(flags, 'native')
    for (const e of events) {
      const text = summarize(e).replace(/\s+/g, ' ').slice(0, 160)
      process.stdout.write(`  ${String(e.seq).padStart(4)} [${e.at}] ${e.type}${text ? ` — ${text}` : ''}\n`)
      if (showNative && e.native !== null) process.stdout.write(`       native: ${JSON.stringify(e.native)}\n`)
    }
  } finally {
    db.close()
  }
}
