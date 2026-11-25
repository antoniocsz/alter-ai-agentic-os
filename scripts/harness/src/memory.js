// `harness memory` — memória em níveis (feature memoria-em-niveis, task 118) + `prune` das
// sessões (legado: arquiva context/sessions antigas). Sessões são listadas em `harness session list`.
import path from 'node:path'
import { pruneSessions } from './lib/memory.js'
import { openDb } from './lib/db.js'
import { parseArgs, flagBool, flagString } from './lib/flags.js'
import {
  LEVELS,
  KINDS,
  STATUSES,
  LEVEL_LABEL,
  KIND_LABEL,
  MemoryError,
  addMemory,
  getMemory,
  globalDbFile,
  listMemories,
  memoryChain,
  openGlobalDb,
  searchMemories,
  setMemoryStatus,
  updateMemory
} from './lib/memories.js'

const USAGE = `uso: harness memory <subcomando>
  add "<texto>" --level <${LEVELS.join('|')}> [--scope s] [--kind <${KINDS.join('|')}>]
                [--tags a,b] [--ttl 7d] [--confidence 0.8]
  list   [--level n] [--status <${STATUSES.join('|')}>] [--all] [--limit n] [--json]
  search "<termo>" [--level n] [--all] [--json]
  show <id>
  approve <id> | reject <id> | outdate <id>
  update <id> "<novo texto>"
  prune [--days n] [--apply]        (sessões antigas → context/sessions/archive/)
  --global em list/search/show/approve/reject/outdate/update opera no banco global (${'~/.alter-harness/memory.db'})`

function out(text = '') {
  process.stdout.write(text + '\n')
}

function fmtRow(m) {
  const scope = m.scope ? `:${m.scope}` : ''
  const tags = m.tags?.length ? ` ${m.tags.map((t) => `#${t}`).join(' ')}` : ''
  const extra = [
    m.status !== 'active' ? m.status : null,
    m.expired ? 'expirada' : m.expires_at ? `expira ${m.expires_at.slice(0, 10)}` : null,
    m.version > 1 ? `v${m.version}` : null,
    m.confidence < 1 ? `confiança ${m.confidence}` : null,
    m.source === 'agent' ? `agente${m.source_agent ? ` ${m.source_agent}` : ''}${m.run_id ? ` · ${m.run_id}` : ''}` : null,
    m.score !== undefined ? `score ${m.score}` : null
  ].filter(Boolean)
  return `#${m.id} [${LEVEL_LABEL[m.level] ?? m.level}${scope} · ${KIND_LABEL[m.kind] ?? m.kind}] ${m.content}${tags}${extra.length ? `  (${extra.join(' · ')})` : ''}`
}

function idArg(raw) {
  if (!/^\d+$/.test(String(raw ?? ''))) throw new MemoryError(`id inválido: ${raw ?? '(vazio)'} (veja harness memory list)`)
  return Number(raw)
}

function withDb(root, global, fn) {
  const db = global ? openGlobalDb() : openDb(root)
  try {
    return fn(db)
  } finally {
    db.close()
  }
}

export async function memoryCmd(args = []) {
  const [sub, ...rest] = args
  const root = process.cwd()
  try {
    return await dispatch(root, sub, rest)
  } catch (err) {
    if (err instanceof MemoryError) throw new Error(err.message)
    throw err
  }
}

async function dispatch(root, sub, rest) {
  if (sub === 'prune') return pruneCmd(root, rest)
  const { positionals, flags } = parseArgs(rest)
  const json = flagBool(flags, 'json')
  const global = flagBool(flags, 'global')

  if (!sub || sub === 'list') {
    const limit = flagString(flags, 'limit') ? Number(flagString(flags, 'limit')) : 100
    const rows = withDb(root, global, (db) =>
      listMemories(db, { level: flagString(flags, 'level'), status: flagString(flags, 'status'), all: flagBool(flags, 'all'), limit })
    )
    if (json) return out(JSON.stringify(rows, null, 2))
    if (!rows.length) return out(global ? 'memória global vazia.' : 'nenhuma memória. grave com: harness memory add "<texto>" --level project')
    for (const r of rows) out(fmtRow(r))
    const pending = rows.filter((r) => r.status === 'proposed').length
    if (pending) out(`\n${pending} proposta(s) aguardando revisão: harness memory approve <id> | reject <id>`)
    return
  }

  if (sub === 'add') {
    const content = positionals.join(' ')
    const level = flagString(flags, 'level', 'project')
    const conf = flagString(flags, 'confidence')
    const input = {
      content,
      level,
      scope: flagString(flags, 'scope'),
      kind: flagString(flags, 'kind', 'fact'),
      tags: flagString(flags, 'tags'),
      ttl: flagString(flags, 'ttl'),
      confidence: conf === null ? undefined : Number(conf),
      source: 'human',
      project: path.basename(root)
    }
    const res = withDb(root, level === 'global', (db) => addMemory(db, input))
    if (json) return out(JSON.stringify(res, null, 2))
    const m = res.memory
    out(res.created ? `✅ memória #${m.id} gravada · ${LEVEL_LABEL[m.level]}${m.scope ? `:${m.scope}` : ''} · ${KIND_LABEL[m.kind]}${m.level === 'global' ? ` (${globalDbFile()})` : ''}` : `↺ já existia: #${m.id} (${m.status})`)
    if (res.similar.length) {
      out('⚠️  memórias ativas parecidas — confira se não há conflito (harness memory update/outdate):')
      for (const s of res.similar) out(`   ${fmtRow(s)}`)
    }
    return
  }

  if (sub === 'search') {
    const rows = withDb(root, global, (db) =>
      searchMemories(db, positionals.join(' '), { level: flagString(flags, 'level'), all: flagBool(flags, 'all') })
    )
    if (json) return out(JSON.stringify(rows, null, 2))
    if (!rows.length) return out(`nada encontrado para "${positionals.join(' ')}".`)
    for (const r of rows) out(fmtRow(r))
    return
  }

  if (sub === 'show') {
    const id = idArg(positionals[0])
    const { m, chain } = withDb(root, global, (db) => ({ m: getMemory(db, id), chain: memoryChain(db, id) }))
    if (!m) throw new MemoryError(`memória não encontrada: #${id}`)
    if (json) return out(JSON.stringify({ memory: m, versions: chain }, null, 2))
    out(fmtRow(m))
    out(`   origem: ${m.source}${m.source_agent ? ` (${m.source_agent})` : ''}${m.task_id ? ` · task ${m.task_id}` : ''}${m.run_id ? ` · ${m.run_id}` : ''}`)
    out(`   criada ${m.created_at} · atualizada ${m.updated_at} · acessos ${m.access_count}${m.last_access_at ? ` (último ${m.last_access_at})` : ''}`)
    if (chain.length > 1) {
      out('   versões:')
      for (const v of chain) out(`     v${v.version} #${v.id} [${v.status}] ${v.content}`)
    }
    return
  }

  const STATUS_OF = { approve: 'active', reject: 'rejected', outdate: 'outdated' }
  if (STATUS_OF[sub]) {
    const id = idArg(positionals[0])
    const m = withDb(root, global, (db) => setMemoryStatus(db, id, STATUS_OF[sub]))
    return out(json ? JSON.stringify(m, null, 2) : `✅ #${m.id} → ${m.status}`)
  }

  if (sub === 'update') {
    const id = idArg(positionals[0])
    const text = positionals.slice(1).join(' ')
    const m = withDb(root, global, (db) => updateMemory(db, id, text))
    return out(json ? JSON.stringify(m, null, 2) : `✅ #${id} → nova versão #${m.id} (v${m.version}); #${id} ficou outdated`)
  }

  throw new Error(USAGE)
}

function pruneCmd(root, rest) {
  const daysIdx = rest.indexOf('--days')
  const days = daysIdx !== -1 ? Number(rest[daysIdx + 1]) || 90 : 90
  const apply = rest.includes('--apply')
  const entries = pruneSessions(root, { days, apply })

  if (entries.length === 0) {
    out(`nenhuma sessão com mais de ${days} dia(s).`)
    return
  }
  const verb = apply ? 'arquivada(s)' : 'seria(m) arquivada(s)'
  out(`${entries.length} sessão(ões) ${verb} (> ${days} dias):`)
  for (const entry of entries) out(`  ${entry.file}`)
  if (!apply) out('  dry-run: rode com --apply para mover para context/sessions/archive/.')
}
