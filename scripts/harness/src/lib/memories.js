// Memória em níveis (feature memoria-em-niveis, task 118). Zero deps: node:sqlite + FTS5.
//
// Níveis: global (entre projetos; banco no HOME, lido só com `memory.global: true`), project
// (compartilhada no projeto), knowledge (decisões técnicas/arquitetura), agent (de um agente),
// task (de uma task) e session (de uma execução; expira). Tipos separam fato verificado de
// decisão, descoberta, suposição e observação temporária. Estados: proposed → active | rejected;
// outdated quando substituída. Do humano entra `active`; do agente entra `proposed` (aprovação).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { redact } from './redact.js'

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')

export const LEVELS = ['global', 'project', 'knowledge', 'agent', 'task', 'session']
export const KINDS = ['fact', 'decision', 'discovery', 'assumption', 'observation']
export const STATUSES = ['proposed', 'active', 'outdated', 'rejected']
/** Níveis que exigem escopo (de quem é a memória). */
export const SCOPED = new Set(['agent', 'task', 'session'])
/** Peso do nível no ranking: o mais específico da task pesa mais. */
export const LEVEL_WEIGHT = { task: 1, knowledge: 0.9, agent: 0.8, project: 0.7, session: 0.6, global: 0.5 }
const KIND_WEIGHT = { fact: 1, decision: 1, discovery: 0.9, assumption: 0.7, observation: 0.6 }
/** TTL padrão por nível/tipo (dias); null = não expira. */
const DEFAULT_TTL_DAYS = { session: 14 }
const OBSERVATION_TTL_DAYS = 30
const HALF_LIFE_DAYS = 90
export const DEFAULT_MEMORY_BUDGET = 1500
const MAX_CONTENT = 2000

export class MemoryError extends Error {}

const nowIso = (d = new Date()) => d.toISOString()

/** Texto normalizado para dedupe: minúsculo, sem acento, espaços colapsados. */
export function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function hashOf(level, scope, content) {
  return createHash('sha256').update(`${level}\u0000${scope ?? ''}\u0000${normalizeText(content)}`).digest('hex')
}

/** `7d`, `12h`, `30` (dias) → ms. */
export function parseTtl(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const m = String(raw).trim().match(/^(\d+)\s*([dh]?)$/i)
  if (!m || Number(m[1]) <= 0) throw new MemoryError(`ttl inválido: ${raw} (ex.: 7d, 12h)`)
  return Number(m[1]) * (m[2].toLowerCase() === 'h' ? 3_600_000 : 86_400_000)
}

function parseTags(raw) {
  if (raw === null || raw === undefined || raw === '' || raw === true) return []
  const list = Array.isArray(raw) ? raw : String(raw).split(',')
  const tags = [...new Set(list.map((t) => String(t).trim().replace(/^#/, '').toLowerCase()).filter(Boolean))]
  for (const t of tags) if (!/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,40}$/u.test(t)) throw new MemoryError(`tag inválida: ${t}`)
  return tags
}

// ---------- esquema ----------

const ftsCache = new WeakMap()

/** Cria as tabelas (idempotente). Usado na migração do banco do projeto e no global. */
export function ensureMemorySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      scope TEXT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      content TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL,
      source_agent TEXT,
      task_id TEXT,
      run_id TEXT,
      project TEXT,
      confidence REAL NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      supersedes INTEGER,
      superseded_by INTEGER,
      hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_access_at TEXT,
      access_count INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_memories_level ON memories(level, scope, status);
    CREATE INDEX IF NOT EXISTS idx_memories_hash ON memories(hash);
  `)
  hasFts(db)
}

/** FTS5 disponível? (cria a tabela virtual na 1ª checagem; sem FTS5 a busca cai para LIKE). */
function hasFts(db) {
  if (ftsCache.has(db)) return ftsCache.get(db)
  let ok = false
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(content, tags, tokenize = 'unicode61 remove_diacritics 2')`)
    ok = true
  } catch {}
  ftsCache.set(db, ok)
  return ok
}

/** Diretório do harness no HOME (global). `HARNESS_HOME` sobrepõe (testes, CI, outro disco). */
export function harnessHome(env = process.env) {
  return env.HARNESS_HOME ? path.resolve(env.HARNESS_HOME) : path.join(os.homedir(), '.alter-harness')
}

export function globalDbFile(env = process.env) {
  return path.join(harnessHome(env), 'memory.db')
}

export function openGlobalDb(env = process.env) {
  const file = globalDbFile(env)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA busy_timeout = 5000')
  ensureMemorySchema(db)
  return db
}

// ---------- leitura de linhas ----------

function rowOut(row) {
  if (!row) return null
  let tags = []
  try {
    tags = JSON.parse(row.tags_json ?? '[]')
  } catch {}
  const { tags_json: _t, hash: _h, ...rest } = row
  return { ...rest, tags }
}

const isExpired = (row, now = Date.now()) => Boolean(row.expires_at) && Date.parse(row.expires_at) <= now

export function getMemory(db, id) {
  return rowOut(db.prepare('SELECT * FROM memories WHERE id = ?').get(Number(id)))
}

/** Cadeia de versões (da mais antiga à mais nova) que contém `id`. */
export function memoryChain(db, id) {
  let cur = db.prepare('SELECT * FROM memories WHERE id = ?').get(Number(id))
  if (!cur) return []
  while (cur.supersedes) {
    const prev = db.prepare('SELECT * FROM memories WHERE id = ?').get(cur.supersedes)
    if (!prev) break
    cur = prev
  }
  const chain = [cur]
  while (cur.superseded_by) {
    const next = db.prepare('SELECT * FROM memories WHERE id = ?').get(cur.superseded_by)
    if (!next) break
    chain.push(next)
    cur = next
  }
  return chain.map(rowOut)
}

// ---------- escrita ----------

function validateFields({ level, scope, kind, confidence }) {
  if (!LEVELS.includes(level)) throw new MemoryError(`nível inválido: ${level} (use ${LEVELS.join(', ')})`)
  if (SCOPED.has(level) && !scope) throw new MemoryError(`nível ${level} exige --scope (${level === 'agent' ? 'nome do agente' : level === 'task' ? 'id da task' : 'id da sessão/run'})`)
  if (!SCOPED.has(level) && scope) throw new MemoryError(`nível ${level} não tem escopo (remova --scope)`)
  if (scope && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(scope)) throw new MemoryError(`escopo inválido: ${scope}`)
  if (!KINDS.includes(kind)) throw new MemoryError(`tipo inválido: ${kind} (use ${KINDS.join(', ')})`)
  if (!(typeof confidence === 'number' && confidence >= 0 && confidence <= 1)) throw new MemoryError('confiança deve estar entre 0 e 1')
}

function ftsInsert(db, id, content, tags) {
  if (!hasFts(db)) return
  db.prepare('INSERT INTO memories_fts (rowid, content, tags) VALUES (?, ?, ?)').run(id, content, tags.join(' '))
}

/**
 * Grava uma memória. Retorna `{ memory, created, similar }`:
 * - duplicata (mesmo texto normalizado no mesmo nível/escopo, não rejeitada/obsoleta) → a existente,
 *   `created: false` (uma duplicata do humano promove a proposta a `active`);
 * - `similar`: memórias ativas do mesmo nível/escopo com termos em comum — checagem de conflito.
 */
export function addMemory(db, input, { now = new Date() } = {}) {
  const content = redact(String(input.content ?? '').trim())
  if (!content) throw new MemoryError('uso: harness memory add "<texto>" --level <nível>')
  if (content.length > MAX_CONTENT) throw new MemoryError(`memória longa demais (${content.length} > ${MAX_CONTENT} caracteres) — resuma`)
  const level = input.level ?? 'project'
  const scope = input.scope ? String(input.scope) : null
  const kind = input.kind ?? 'fact'
  const confidence = input.confidence === undefined || input.confidence === null ? 1 : Number(input.confidence)
  const source = input.source === 'agent' ? 'agent' : 'human'
  validateFields({ level, scope, kind, confidence })
  if (level === 'global' && source === 'agent') throw new MemoryError('agentes não escrevem na memória global')
  const tags = parseTags(input.tags)

  const hash = hashOf(level, scope, content)
  const dup = db
    .prepare("SELECT * FROM memories WHERE hash = ? AND status IN ('active','proposed') ORDER BY id DESC LIMIT 1")
    .get(hash)
  if (dup) {
    if (dup.status === 'proposed' && source === 'human') {
      db.prepare("UPDATE memories SET status = 'active', updated_at = ? WHERE id = ?").run(nowIso(now), dup.id)
    }
    return { memory: getMemory(db, dup.id), created: false, similar: [] }
  }

  let ttlMs = input.ttl !== undefined && input.ttl !== null ? parseTtl(input.ttl) : null
  if (ttlMs === null && DEFAULT_TTL_DAYS[level]) ttlMs = DEFAULT_TTL_DAYS[level] * 86_400_000
  if (ttlMs === null && kind === 'observation') ttlMs = OBSERVATION_TTL_DAYS * 86_400_000
  const expiresAt = ttlMs ? nowIso(new Date(now.getTime() + ttlMs)) : null

  const similar = findSimilar(db, { level, scope, content })
  const status = input.status ?? (source === 'human' ? 'active' : 'proposed')
  if (!STATUSES.includes(status)) throw new MemoryError(`status inválido: ${status}`)
  const stamp = nowIso(now)
  const res = db
    .prepare(
      `INSERT INTO memories (level, scope, kind, status, content, tags_json, source, source_agent, task_id, run_id, project,
        confidence, version, supersedes, hash, created_at, updated_at, expires_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      level, scope, kind, status, content, JSON.stringify(tags), source, input.sourceAgent ?? null, input.taskId ?? null,
      input.runId ?? null, input.project ?? null, confidence, input.version ?? 1, input.supersedes ?? null, hash, stamp, stamp, expiresAt
    )
  const id = Number(res.lastInsertRowid)
  ftsInsert(db, id, content, tags)
  return { memory: getMemory(db, id), created: true, similar }
}

/** Termos significativos (≥ 4 letras) para checar parecidas / montar consultas. */
function terms(text, max = 12) {
  const stop = new Set(['para', 'como', 'mais', 'esta', 'este', 'isso', 'essa', 'esse', 'pelo', 'pela', 'with', 'that', 'from', 'deve', 'quando', 'sobre', 'entre', 'todo', 'toda', 'cada', 'sempre', 'nunca', 'task', 'harness'])
  const out = []
  for (const w of normalizeText(text).split(' ')) {
    if (w.length >= 4 && !stop.has(w) && !out.includes(w)) out.push(w)
    if (out.length >= max) break
  }
  return out
}

function findSimilar(db, { level, scope, content }) {
  const words = terms(content, 8)
  if (!words.length) return []
  const hits = rawSearch(db, words.join(' OR '), { limit: 20 })
  return hits
    .filter((r) => r.status === 'active' && r.level === level && (r.scope ?? null) === (scope ?? null) && !isExpired(r))
    .slice(0, 3)
    .map(rowOut)
}

/** Muda o estado (approve → active, reject → rejected, outdate → outdated). */
export function setMemoryStatus(db, id, status, { now = new Date() } = {}) {
  if (!STATUSES.includes(status)) throw new MemoryError(`status inválido: ${status}`)
  const row = db.prepare('SELECT * FROM memories WHERE id = ?').get(Number(id))
  if (!row) throw new MemoryError(`memória não encontrada: ${id}`)
  if (row.status === status) return rowOut(row)
  if (status === 'active' && row.status !== 'proposed') {
    throw new MemoryError(`só memórias propostas podem ser aprovadas (#${id} está ${row.status})`)
  }
  if (status === 'rejected' && row.status !== 'proposed') {
    throw new MemoryError(`só memórias propostas podem ser rejeitadas (#${id} está ${row.status}) — use outdate`)
  }
  db.prepare('UPDATE memories SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(now), row.id)
  return getMemory(db, row.id)
}

/** Nova versão: grava a linha nova (mesmo nível/escopo/tipo/tags) e marca a anterior `outdated`. */
export function updateMemory(db, id, content, { now = new Date(), kind, tags, confidence } = {}) {
  const row = db.prepare('SELECT * FROM memories WHERE id = ?').get(Number(id))
  if (!row) throw new MemoryError(`memória não encontrada: ${id}`)
  if (row.status === 'outdated' || row.status === 'rejected') {
    throw new MemoryError(`#${id} está ${row.status}${row.superseded_by ? ` — a versão atual é #${row.superseded_by}` : ''}`)
  }
  const prev = rowOut(row)
  const res = addMemory(
    db,
    {
      content,
      level: row.level,
      scope: row.scope,
      kind: kind ?? row.kind,
      tags: tags ?? prev.tags,
      confidence: confidence ?? row.confidence,
      source: 'human',
      sourceAgent: row.source_agent,
      taskId: row.task_id,
      runId: row.run_id,
      project: row.project,
      version: row.version + 1,
      supersedes: row.id,
      ttl: row.expires_at ? Math.max(1, Math.ceil((Date.parse(row.expires_at) - now.getTime()) / 3_600_000)) + 'h' : null
    },
    { now }
  )
  if (!res.created) throw new MemoryError(`o texto novo é igual ao de #${res.memory.id}`)
  db.prepare("UPDATE memories SET status = 'outdated', superseded_by = ?, updated_at = ? WHERE id = ?").run(res.memory.id, nowIso(now), row.id)
  return res.memory
}

// ---------- consulta ----------

/** Consulta FTS5 segura a partir de texto livre (termos entre aspas; OR por padrão). */
export function ftsQuery(text, op = 'OR') {
  const words = normalizeText(text).split(' ').filter((w) => w.length >= 2).slice(0, 24)
  return words.map((w) => `"${w}"`).join(` ${op} `)
}

/** Busca crua: linhas com `score` (maior = mais relevante, 0..1). */
function rawSearch(db, query, { limit = 50 } = {}) {
  if (!query) return []
  if (hasFts(db)) {
    try {
      const rows = db
        .prepare(
          `SELECT m.*, bm25(memories_fts) AS rank FROM memories_fts JOIN memories m ON m.id = memories_fts.rowid
           WHERE memories_fts MATCH ? ORDER BY rank LIMIT ?`
        )
        .all(query, limit)
      // bm25 é negativo (menor = melhor): normaliza para 0..1 dentro do resultado.
      const best = Math.min(...rows.map((r) => r.rank), -1e-9)
      return rows.map((r) => ({ ...r, score: Math.max(0.05, r.rank / best) }))
    } catch {}
  }
  const words = query.replace(/"/g, '').split(/\s+(?:OR|AND)\s+/).filter(Boolean)
  const all = db.prepare("SELECT * FROM memories WHERE status IN ('active','proposed')").all()
  return all
    .map((r) => {
      const hay = normalizeText(`${r.content} ${r.tags_json}`)
      const hits = words.filter((w) => hay.includes(w)).length
      return { ...r, score: words.length ? hits / words.length : 0 }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

function filterRows(rows, { level = null, status = null, all = false, scope = null, now = Date.now() } = {}) {
  return rows.filter((r) => {
    if (level && r.level !== level) return false
    if (scope && r.scope !== scope) return false
    if (status) return r.status === status
    if (all) return true
    return (r.status === 'active' || r.status === 'proposed') && !isExpired(r, now)
  })
}

export function listMemories(db, opts = {}) {
  const rows = db.prepare('SELECT * FROM memories ORDER BY updated_at DESC, id DESC').all()
  return filterRows(rows, opts).slice(0, opts.limit ?? 100).map((r) => ({ ...rowOut(r), expired: isExpired(r) }))
}

export function searchMemories(db, text, opts = {}) {
  const q = ftsQuery(text)
  if (!q) throw new MemoryError('uso: harness memory search "<termo>"')
  return filterRows(rawSearch(db, q, { limit: 200 }), opts)
    .slice(0, opts.limit ?? 20)
    .map((r) => ({ ...rowOut(r), score: Number(r.score.toFixed(3)) }))
}

/** Marca leitura (último acesso + contador) das memórias entregues a um agente. */
export function touchMemories(db, ids, { now = new Date() } = {}) {
  const stmt = db.prepare('UPDATE memories SET last_access_at = ?, access_count = access_count + 1 WHERE id = ?')
  for (const id of ids) stmt.run(nowIso(now), id)
}

/**
 * Candidatas ativas para uma task, por nível: task (a própria), agent (o agente da task),
 * project, knowledge e — se `includeGlobal` — global. Pontuação = relevância textual (consulta
 * montada da task) × peso do nível × peso do tipo × confiança × recência.
 * Retorna `[{ ...memória, score, origin: 'project'|'global' }]` ordenado.
 */
export function rankForTask(db, { taskId, agent, query, globalDb = null, now = Date.now() }) {
  const out = []
  const collect = (conn, origin) => {
    const rows = conn.prepare("SELECT * FROM memories WHERE status = 'active'").all()
    // Consulta da task: só termos significativos (≥ 4 letras, sem palavras vazias) — "do", "de"
    // casariam qualquer memória.
    const q = terms(query ?? '', 24).map((w) => `"${w}"`).join(' OR ')
    const textual = new Map(rawSearch(conn, q, { limit: 500 }).map((r) => [r.id, r.score]))
    for (const r of rows) {
      if (isExpired(r, now)) continue
      const own =
        (r.level === 'task' && r.scope === taskId) ||
        (r.level === 'agent' && agent && r.scope === agent) ||
        r.level === 'project' ||
        r.level === 'knowledge' ||
        (r.level === 'global' && origin === 'global')
      if (!own) continue
      // Memória da própria task/agente vale mesmo sem casar texto; as compartilhadas precisam casar.
      const rel = textual.get(r.id) ?? (r.level === 'task' || r.level === 'agent' ? 0.5 : 0)
      if (rel <= 0) continue
      const ageDays = Math.max(0, (now - Date.parse(r.updated_at)) / 86_400_000)
      const recency = 0.5 + 0.5 * Math.pow(0.5, ageDays / HALF_LIFE_DAYS)
      const score = rel * (LEVEL_WEIGHT[r.level] ?? 0.5) * (KIND_WEIGHT[r.kind] ?? 0.7) * r.confidence * recency
      out.push({ ...rowOut(r), score: Number(score.toFixed(4)), origin })
    }
  }
  collect(db, 'project')
  if (globalDb) collect(globalDb, 'global')
  return out.sort((a, b) => b.score - a.score || a.id - b.id)
}

const LEVEL_LABEL = { task: 'task', agent: 'agente', project: 'projeto', knowledge: 'conhecimento', global: 'global', session: 'sessão' }
const KIND_LABEL = { fact: 'fato', decision: 'decisão', discovery: 'descoberta', assumption: 'suposição', observation: 'observação' }

export function memoryLine(m) {
  const tags = m.tags?.length ? ` ${m.tags.map((t) => `#${t}`).join(' ')}` : ''
  const conf = m.confidence < 1 ? ` (confiança ${m.confidence})` : ''
  return `- [${LEVEL_LABEL[m.level] ?? m.level} · ${KIND_LABEL[m.kind] ?? m.kind}] ${m.content}${tags}${conf} _(#${m.id}${m.origin === 'global' ? ' global' : ''})_`
}

/** Seleciona dentro do orçamento (tokens ≈ chars/4) e devolve `{ items, tokens, omitted }`. */
export function selectWithinBudget(ranked, budget = DEFAULT_MEMORY_BUDGET, maxItems = 25) {
  const items = []
  let tokens = 0
  let omitted = 0
  for (const m of ranked) {
    const cost = Math.ceil(memoryLine(m).length / 4)
    if (items.length >= maxItems || tokens + cost > budget) {
      omitted++
      continue
    }
    items.push(m)
    tokens += cost
  }
  return { items, tokens, omitted }
}

export { LEVEL_LABEL, KIND_LABEL }

// ---------- agentes propõem (bloco MEMÓRIA:) — task 119 ----------

const KIND_WORDS = {
  fato: 'fact', fact: 'fact',
  decisao: 'decision', decision: 'decision',
  descoberta: 'discovery', discovery: 'discovery',
  suposicao: 'assumption', assumption: 'assumption', hipotese: 'assumption',
  observacao: 'observation', observation: 'observation'
}
const LEVEL_WORDS = {
  task: 'task', tarefa: 'task',
  projeto: 'project', project: 'project',
  conhecimento: 'knowledge', knowledge: 'knowledge', arquitetura: 'knowledge',
  agente: 'agent', agent: 'agent'
}
export const MAX_HARVEST = 10

/**
 * Lê o bloco `MEMÓRIA:` do resumo final do agente. Linhas aceitas:
 *   - decisão: texto #tag
 *   - descoberta [projeto]: texto
 * Nível padrão `task`; `[projeto]`, `[conhecimento]`, `[agente]` mudam o nível. Linhas que não
 * seguem o formato são ignoradas. Máximo de MAX_HARVEST itens.
 */
export function parseMemoryBlock(text) {
  const lines = String(text ?? '').split(/\r?\n/)
  let start = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*(?:\*\*)?mem[oó]ria(?:\*\*)?\s*:?\s*(?:\*\*)?\s*$/i.test(lines[i])) {
      start = i
      break
    }
  }
  if (start === -1) return []
  const items = []
  for (const raw of lines.slice(start + 1)) {
    const line = raw.trim()
    if (!line) {
      if (items.length) break
      continue
    }
    const m = line.match(/^[-*]\s*([\p{L}]+)\s*(?:\[([\p{L}]+)\])?\s*:\s*(.+)$/u)
    if (!m) {
      if (items.length) break
      continue
    }
    const kind = KIND_WORDS[normalizeText(m[1])]
    const level = m[2] ? LEVEL_WORDS[normalizeText(m[2])] : 'task'
    if (!kind || !level) continue
    const tags = [...m[3].matchAll(/(?:^|\s)#([\p{L}\p{N}][\p{L}\p{N}._-]{0,40})/gu)].map((x) => x[1].toLowerCase())
    const content = m[3].replace(/(?:^|\s)#[\p{L}\p{N}][\p{L}\p{N}._-]{0,40}/gu, '').trim()
    if (content.length < 8) continue
    items.push({ kind, level, content, tags })
    if (items.length >= MAX_HARVEST) break
  }
  return items
}

/**
 * Fim de run concluído: grava o bloco `MEMÓRIA:` da última mensagem do agente que o contém como
 * memórias `proposed` (origem agente, task e run). Retorna as memórias criadas.
 */
export function harvestRunMemories(db, runId) {
  const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId)
  if (!run || run.status !== 'completed') return []
  const texts = db
    .prepare("SELECT payload_json FROM run_events WHERE run_id = ? AND type = 'agent.message' ORDER BY seq DESC")
    .all(runId)
    .map((r) => {
      try {
        return JSON.parse(r.payload_json)?.text ?? ''
      } catch {
        return ''
      }
    })
  const source = texts.find((t) => /mem[oó]ria/i.test(t) && parseMemoryBlock(t).length)
  if (!source) return []
  let agent = null
  try {
    agent = String(db.prepare('SELECT agent FROM tasks WHERE id = ?').get(run.task_id)?.agent ?? '').replace(/`/g, '').trim() || null
  } catch {}
  const created = []
  for (const item of parseMemoryBlock(source)) {
    const scope = item.level === 'task' ? run.task_id : item.level === 'agent' ? agent : null
    if (item.level === 'agent' && !scope) continue
    try {
      const res = addMemory(db, {
        content: item.content,
        level: item.level,
        scope,
        kind: item.kind,
        tags: item.tags,
        source: 'agent',
        sourceAgent: agent ?? run.tool,
        taskId: run.task_id,
        runId,
        confidence: item.kind === 'assumption' ? 0.6 : 0.8
      })
      if (res.created) created.push(res.memory)
    } catch {}
  }
  return created
}
