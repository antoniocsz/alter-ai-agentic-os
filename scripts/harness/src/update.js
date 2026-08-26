import fs from 'node:fs'
import path from 'node:path'
import { copyPath } from './lib/templates.js'
import { tryOpenDb, recordInteraction } from './lib/db.js'

const HARNESS_LAYER = ['AGENTS.md', '.agents', '.opencode', 'scripts']

export async function update(args) {
  const root = process.cwd()
  const flagIdx = args.indexOf('--source')
  const source = (flagIdx !== -1 ? args[flagIdx + 1] : null) || process.env.HARNESS_SOURCE
  if (!source) {
    throw new Error('uso: harness update [--source <caminho-do-harness>] ou defina HARNESS_SOURCE')
  }

  const src = path.resolve(source)
  if (!fs.existsSync(path.join(src, 'AGENTS.md'))) {
    throw new Error(`fonte do harness inválida (sem AGENTS.md): ${src}`)
  }

  const synced = []
  for (const item of HARNESS_LAYER) {
    const from = path.join(src, item)
    if (!fs.existsSync(from)) {
      process.stderr.write(`   aviso: ${item} não encontrado na fonte\n`)
      continue
    }
    copyPath(from, path.join(root, item))
    synced.push(item)
  }

  const db = tryOpenDb(root)
  if (db) {
    try {
      recordInteraction(db, {
        kind: 'system',
        content: `harness update: camada sincronizada de ${source}`,
        source: 'cli'
      })
    } catch {}
  }

  process.stdout.write(
    `✅ camada do harness sincronizada de ${source}\n  atualizado: ${synced.join(', ')}\n` +
      (args.includes('--no-restart') ? '' : '   reinicie o opencode para carregar os agents/config atualizados.\n')
  )
}