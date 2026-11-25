// `harness analytics [--by tool|model|task|agent|day] [--since 30d|all|AAAA-MM-DD] [--json]`
// (feature qualidade-e-analytics, task 129): tokens, custo, sucesso e qualidade das execuções.
import { openDb } from './lib/db.js'
import { parseArgs, flagBool, flagString } from './lib/flags.js'
import { reapOrphans } from './lib/runs.js'
import { GROUPS, analytics, parseSince } from './lib/analytics.js'

const fmtNum = (v) => (v === null || v === undefined ? 'n/d' : Number(v).toLocaleString('pt-BR'))
const fmtPct = (v) => (v === null || v === undefined ? 'n/d' : `${Math.round(v * 100)}%`)
const fmtCost = (v) => `$${Number(v ?? 0).toFixed(4)}`
function fmtDur(ms) {
  if (ms === null || ms === undefined) return 'n/d'
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

export async function analyticsCmd(args = []) {
  const root = process.cwd()
  const { flags } = parseArgs(args)
  const by = flagString(flags, 'by', 'tool')
  const since = parseSince(flagString(flags, 'since', '30d'))
  const db = openDb(root)
  let data
  try {
    reapOrphans(db)
    data = analytics(db, { by, since })
  } finally {
    db.close()
  }
  if (flagBool(flags, 'json')) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n')
    return
  }
  const t = data.totals
  const out = []
  out.push(`📊 execuções ${since ? `desde ${since.slice(0, 10)}` : '(todas)'} · por ${by}`)
  out.push(
    `   ${t.runs} run(s) · sucesso ${fmtPct(t.success_rate)} · tokens ${fmtNum(t.tokens_in)}/${fmtNum(t.tokens_out)} · custo ${fmtCost(t.cost_usd)}` +
      ` · gates ${fmtPct(t.quality_rate)}${t.unmeasured ? ` · ${t.unmeasured} sem uso reportado (fora das somas)` : ''}`
  )
  if (!data.groups.length) {
    out.push('   nenhuma execução no período.')
    process.stdout.write(out.join('\n') + '\n')
    return
  }
  const header = [by, 'runs', 'sucesso', 'tokens in/out', 'custo', 'duração média', 'gates ok', 'sem uso']
  const rows = data.groups.map((g) => [
    g.key,
    String(g.runs),
    fmtPct(g.success_rate),
    `${fmtNum(g.tokens_in)}/${fmtNum(g.tokens_out)}`,
    fmtCost(g.cost_usd),
    fmtDur(g.avg_duration_ms),
    fmtPct(g.quality_rate),
    String(g.unmeasured)
  ])
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
  const line = (cells) => '   ' + cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd()
  out.push('', line(header), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line))
  out.push('', `   outras visões: --by ${GROUPS.filter((g) => g !== by).join('|')} · --since 7d|all · painel: harness serve → /analytics`)
  process.stdout.write(out.join('\n') + '\n')
}
