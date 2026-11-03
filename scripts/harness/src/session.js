import { sessionEnd, listSessions } from './lib/memory.js'

export async function sessionCmd(args = []) {
  const [sub, ...rest] = args
  const root = process.cwd()

  if (sub === 'end') {
    const summary = rest
      .filter((a) => !a.startsWith('--'))
      .join(' ')
      .trim()
    const res = sessionEnd(root, summary)
    process.stdout.write(`✅ sessão registrada: ${res.file}\n`)
    return
  }

  if (sub === 'list') {
    const limitIdx = rest.indexOf('--limit')
    const limit = limitIdx !== -1 ? Number(rest[limitIdx + 1]) || 10 : 10
    const rows = listSessions(root, limit)
    if (rows.length === 0) {
      process.stdout.write('nenhuma sessão registrada.\n')
      return
    }
    for (const row of rows) {
      process.stdout.write(`${row.date}  ${row.summary.slice(0, 120)}\n`)
    }
    return
  }

  throw new Error(
    'uso: harness session <end|list>\n' +
      '  end "<resumo>"   grava a sessão no banco e em context/sessions/\n' +
      '  list [--limit n]'
  )
}
