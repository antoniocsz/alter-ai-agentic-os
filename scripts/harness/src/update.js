import fs from 'node:fs'
import path from 'node:path'
import { copyPath } from './lib/templates.js'
import { tryOpenDb, recordInteraction } from './lib/db.js'

const HARNESS_LAYER = ['AGENTS.md', '.agents', '.opencode', 'scripts']

function sourceVersion(src) {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(src, 'scripts', 'harness', 'package.json'), 'utf8')
    ).version
  } catch {
    return null
  }
}

export async function update(args) {
  const root = process.cwd()
  const flagIdx = args.indexOf('--source')
  const source = (flagIdx !== -1 ? args[flagIdx + 1] : null) || process.env.HARNESS_SOURCE
  if (!source) {
    throw new Error('uso: harness update [--source <caminho-do-harness>] [--dry-run] ou defina HARNESS_SOURCE')
  }
  const dryRun = args.includes('--dry-run')

  const src = path.resolve(source)
  if (!fs.existsSync(path.join(src, 'AGENTS.md'))) {
    throw new Error(`fonte do harness inválida (sem AGENTS.md): ${src}`)
  }

  const version = sourceVersion(src)
  const found = HARNESS_LAYER.filter((item) => fs.existsSync(path.join(src, item)))

  if (dryRun) {
    process.stdout.write(
      `🔎 dry-run: camada do harness em ${src}${version ? ` (v${version})` : ''}\n` +
        `  copiaria: ${found.join(', ')} → ${root}\n`
    )
    return
  }

  const currentAgents = path.join(root, 'AGENTS.md')
  if (fs.existsSync(currentAgents)) {
    const backups = path.join(root, '.harness', 'backups')
    fs.mkdirSync(backups, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    fs.copyFileSync(currentAgents, path.join(backups, `AGENTS.md.${stamp}`))
  }

  const synced = []
  for (const item of found) {
    copyPath(path.join(src, item), path.join(root, item))
    synced.push(item)
  }

  const db = tryOpenDb(root)
  if (db) {
    try {
      recordInteraction(db, {
        kind: 'system',
        content: `harness update: camada sincronizada de ${source}${version ? ` (v${version})` : ''}`,
        source: 'cli'
      })
    } catch {}
  }

  process.stdout.write(
    `✅ camada do harness sincronizada de ${source}${version ? ` (v${version})` : ''}\n` +
      `  atualizado: ${synced.join(', ')}\n` +
      (args.includes('--no-restart') ? '' : '   reinicie o opencode para carregar os agents/config atualizados.\n')
  )
}