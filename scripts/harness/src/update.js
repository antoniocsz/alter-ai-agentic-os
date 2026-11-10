import fs from 'node:fs'
import path from 'node:path'
import { copyPath } from './lib/templates.js'
import { tryOpenDb, recordInteraction } from './lib/db.js'
import { resolveConfig } from './lib/config.js'
import {
  installAdapter,
  readAdaptersMarker,
  MCP_TARGETS,
  TOOLS,
  BROWSER_DEFAULT_PACKAGE,
  SANDBOX_DEFAULT,
  resolveSandbox
} from './lib/adapters.js'

const HARNESS_LAYER = ['AGENTS.md', '.agents', '.opencode', 'adapters', 'scripts']

function sourceVersion(src) {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(src, 'scripts', 'harness', 'package.json'), 'utf8')
    ).version
  } catch {
    return null
  }
}

/**
 * Reexecuta `installAdapter` para cada tool gravada em `.harness/adapters.json`
 * (marcador escrito pelo `adapter <tool>`), respeitando o perfil de sandbox salvo.
 * Idempotente; projeto sem marcador → nenhum sync (comportamento anterior).
 * Fonte sem `adapters/` → aviso claro e skip (não erro) — os adapters instalados
 * do projeto são preservados. Problemas do marcador (JSON/shape/sandbox) também
 * chegam como warnings para o update imprimir — nada trava a sincronização da camada.
 *
 * @returns {{ synced: string[], warnings: string[] }}
 */
function syncInstalledAdapters(src, root) {
  const marker = readAdaptersMarker(root)
  const warnings = [...marker.issues]
  if (marker.tools.length === 0) return { synced: [], warnings }

  if (!fs.existsSync(path.join(src, 'adapters'))) {
    warnings.push(
      `fonte do harness sem adapters/ (${src}) — adapters não ressincronizados (os instalados do projeto foram preservados)`
    )
    return { synced: [], warnings }
  }

  const profile = resolveConfig(root).profile
  const sandbox = resolveSandbox(marker.sandbox ?? SANDBOX_DEFAULT)
  const synced = []
  for (const tool of marker.tools) {
    if (!TOOLS.includes(tool)) {
      warnings.push(`tool desconhecida no marcador: ${JSON.stringify(tool)} — pulada`)
      continue
    }
    try {
      if (tool === 'browser') {
        if (!marker.browser || !MCP_TARGETS.includes(marker.browser.target)) {
          warnings.push('browser no marcador sem tool-alvo válida — sync do browser ignorado')
          continue
        }
        installAdapter('browser', root, {
          kit: src,
          name: path.basename(root),
          profile,
          tools: [marker.browser.target],
          browserPackage: marker.browser.package ?? BROWSER_DEFAULT_PACKAGE
        })
        synced.push(`browser → ${marker.browser.target}`)
        continue
      }
      installAdapter(tool, root, {
        kit: src,
        name: path.basename(root),
        profile,
        sandbox
      })
      synced.push(tool)
    } catch (err) {
      warnings.push(`${tool} não ressincronizado: ${err.message}`)
    }
  }
  return { synced, warnings }
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

  const adapterSync = syncInstalledAdapters(src, root)
  for (const warning of adapterSync.warnings) {
    process.stdout.write(`⚠️  aviso: ${warning}\n`)
  }

  const adaptersNote = adapterSync.synced.length
    ? `; adapters ressincronizados: ${adapterSync.synced.join(', ')}`
    : ''
  const db = tryOpenDb(root)
  if (db) {
    try {
      recordInteraction(db, {
        kind: 'system',
        content: `harness update: camada sincronizada de ${source}${version ? ` (v${version})` : ''}${adaptersNote}`,
        source: 'cli'
      })
    } catch {}
  }

  process.stdout.write(
    `✅ camada do harness sincronizada de ${source}${version ? ` (v${version})` : ''}\n` +
      `  atualizado: ${synced.join(', ')}\n` +
      (adapterSync.synced.length
        ? `  adapters ressincronizados: ${adapterSync.synced.join(', ')}\n`
        : '') +
      (args.includes('--no-restart') ? '' : '   reinicie o opencode para carregar os agents/config atualizados.\n')
  )
}