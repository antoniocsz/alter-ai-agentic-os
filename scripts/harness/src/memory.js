import { pruneSessions, listSessions } from './lib/memory.js'

export async function memoryCmd(args = []) {
  const [sub, ...rest] = args
  const root = process.cwd()

  if (!sub || sub === 'list') {
    const limitIdx = rest.indexOf('--limit')
    const limit = limitIdx !== -1 ? Number(rest[limitIdx + 1]) || 10 : 10
    const rows = listSessions(root, limit)
    if (rows.length === 0) {
      process.stdout.write('nenhuma sessão ativa.\n')
      return
    }
    for (const row of rows) process.stdout.write(`${row.date}  ${row.summary.slice(0, 120)}\n`)
    return
  }

  if (sub === 'prune') {
    const daysIdx = rest.indexOf('--days')
    const days = daysIdx !== -1 ? Number(rest[daysIdx + 1]) || 90 : 90
    const apply = rest.includes('--apply')
    const entries = pruneSessions(root, { days, apply })

    if (entries.length === 0) {
      process.stdout.write(`nenhuma sessão com mais de ${days} dia(s).\n`)
      return
    }
    const verb = apply ? 'arquivada(s)' : 'seria(m) arquivada(s)'
    process.stdout.write(`${entries.length} sessão(ões) ${verb} (> ${days} dias):\n`)
    for (const entry of entries) process.stdout.write(`  ${entry.file}\n`)
    if (!apply) process.stdout.write('  dry-run: rode com --apply para mover para context/sessions/archive/.\n')
    return
  }

  throw new Error(
    'uso: harness memory <list|prune>\n' +
      '  list [--limit n]\n' +
      '  prune [--days n] [--apply]'
  )
}
