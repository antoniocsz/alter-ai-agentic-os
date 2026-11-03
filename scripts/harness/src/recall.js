import { recall } from './lib/memory.js'

export async function recallCmd(args = []) {
  const limitIdx = args.indexOf('--limit')
  const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) || 20 : 20
  const term = args
    .filter((a, i) => !a.startsWith('--') && !(limitIdx !== -1 && i === limitIdx + 1))
    .join(' ')
    .trim()

  const hits = recall(process.cwd(), term, { limit })

  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify({ term, hits }, null, 2) + '\n')
    return
  }

  if (hits.length === 0) {
    process.stdout.write(`nada encontrado para "${term}".\n`)
    return
  }

  for (const hit of hits) {
    const prefix = hit.project ? `[${hit.project}] ` : ''
    process.stdout.write(`${prefix}${hit.kind} · ${hit.source}\n  ${hit.text}\n`)
  }
}
