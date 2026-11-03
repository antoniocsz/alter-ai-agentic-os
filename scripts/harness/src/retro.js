import fs from 'node:fs'
import path from 'node:path'
import { computeMetrics, formatTable } from './lib/metrics.js'
import { listSessions } from './lib/memory.js'
import { localDate, localMonth } from './lib/dates.js'

export async function retroCmd(args = [], root = process.cwd()) {
  const flag = (name, fallback) => {
    const idx = args.indexOf(name)
    return idx !== -1 ? args[idx + 1] : fallback
  }
  const days = Number(flag('--days', 30)) || 30
  const month = localMonth()
  const out = path.resolve(root, flag('--out', `context/project/retro/${month}.md`))
  const force = args.includes('--force')

  if (fs.existsSync(out) && !force) {
    throw new Error(`retrospectiva já existe: ${path.relative(root, out)} (use --force para sobrescrever)`)
  }

  const metrics = computeMetrics(root, { days })
  const cutoff = localDate(new Date(Date.now() - days * 86_400_000))
  const sessions = listSessions(root, 30).filter((s) => !s.date || s.date >= cutoff)

  const lines = [
    `# Retrospectiva — ${month}`,
    '',
    `> Gerada por \`harness retro --days ${days}\` em ${new Date().toISOString().slice(0, 10)}.`,
    '> Preencha as seções qualitativas e transforme em tasks quando fizer sentido.',
    '',
    '## Métricas do período',
    '',
    '```',
    formatTable(metrics),
    '```',
    '',
    '## Sessões',
    ''
  ]
  if (sessions.length === 0) lines.push('(nenhuma sessão no período)')
  for (const s of sessions) lines.push(`- ${s.date}: ${s.summary.slice(0, 160)}`)

  lines.push(
    '',
    '## O que funcionou',
    '',
    '- ',
    '',
    '## O que atrapalhou',
    '',
    '- ',
    '',
    '## Ações (dono + prazo)',
    '',
    '- [ ] ',
    ''
  )

  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, lines.join('\n'))
  process.stdout.write(`✅ retrospectiva gerada: ${path.relative(root, out)}\n`)
}
