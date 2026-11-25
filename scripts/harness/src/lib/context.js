import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { queueDir, activeDir, doneDir, resolveTaskName, parseTask, norm } from './tasks.js'
import { tryOpenDb } from './db.js'
import { redact } from './redact.js'
import { resolveConfig } from './config.js'
import { DEFAULT_MEMORY_BUDGET, memoryLine, openGlobalDb, rankForTask, selectWithinBudget, touchMemories } from './memories.js'

/**
 * Pacote de contexto por task (feature `pacote-de-contexto`, task 103).
 *
 * Seleção DETERMINÍSTICA a partir do que a própria task declara — sem LLM, sem embeddings.
 * Seções em ordem de prioridade; com orçamento, as que não cabem saem inteiras (a task nunca sai).
 * Tokens são ESTIMADOS (caracteres/4) e sempre rotulados assim.
 */

export const DEFAULT_HANDOFFS = 3
// Defensivo (repo travado/enorme não pode pendurar o run); git normal responde em < 1s.
const GIT_TIMEOUT_MS = 10_000

export const estimateTokens = (text) => Math.ceil(String(text ?? '').length / 4)

const clean = (v) => String(v ?? '').replace(/`/g, '').trim()
const isEmpty = (v) => !v || v === '—' || v === '-'

function readIf(file) {
  try {
    return fs.readFileSync(file, 'utf8').replace(/^﻿/, '')
  } catch {
    return null
  }
}

/** Localiza a task em queue/active/done. */
export function locateTask(root, arg) {
  for (const [state, dir] of [['active', activeDir(root)], ['queue', queueDir(root)], ['done', doneDir(root)]]) {
    try {
      const name = resolveTaskName(dir, arg)
      return { name, state, file: path.join(dir, name) }
    } catch (err) {
      if (/ambíguo/.test(err.message)) throw err
    }
  }
  throw new Error(`task não encontrada em queue/, active/ nem done/: ${arg}`)
}

/** Blocos `## <heading>` de um markdown (heading inclusive, até o próximo `## `). */
function h2Blocks(text) {
  const lines = text.split(/\r?\n/)
  const blocks = []
  let cur = null
  for (const line of lines) {
    const m = line.match(/^##\s+(.+)$/)
    if (m) {
      if (cur) blocks.push(cur)
      cur = { heading: m[1].trim(), lines: [line] }
    } else if (cur) {
      cur.lines.push(line)
    }
  }
  if (cur) blocks.push(cur)
  return blocks.map((b) => ({ heading: b.heading, text: b.lines.join('\n').trim() }))
}

/** Os N handoffs mais recentes do status.md: maior número de task primeiro (sem número = mais antigo). */
export function recentHandoffs(statusText, n = DEFAULT_HANDOFFS) {
  return h2Blocks(statusText)
    .filter((b) => /^handoff\b/i.test(b.heading))
    .map((b, i) => ({ ...b, num: Number(b.heading.match(/task[s]?\s+(\d+)/i)?.[1] ?? -1), i }))
    .sort((a, b) => b.num - a.num || b.i - a.i)
    .slice(0, n)
}

function moduleOf(task) {
  const raw = clean(task.values?.['Módulo'] ?? '')
  if (isEmpty(raw)) return null
  return raw.match(/modules\/([a-z0-9-]+)/)?.[1] ?? raw.match(/[a-z][a-z0-9-]*/)?.[0] ?? null
}

function depsOf(task) {
  return clean(task.values?.['Depende de'] ?? '')
    .replace(/\[[ x]\]/gi, '')
    .split(',')
    .map((d) => d.trim())
    .filter((d) => !isEmpty(d))
}

function lastHandoffOf(db, taskId) {
  if (!db) return null
  try {
    return db
      .prepare("SELECT content, at FROM interactions WHERE task_id = ? AND content LIKE 'handoff:%' ORDER BY at DESC, id DESC LIMIT 1")
      .get(taskId) ?? null
  } catch {
    return null
  }
}

function git(root, args) {
  try {
    return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GIT_TIMEOUT_MS
    }).trim()
  } catch {
    return null
  }
}

function scopeSection(root, scope, isRepo) {
  if (!scope.length) return null
  const rows = scope.map((rel) => {
    const abs = path.join(root, rel)
    let what = 'não existe (será criado)'
    try {
      const st = fs.statSync(abs)
      what = st.isDirectory() ? 'diretório' : `${st.size} bytes`
    } catch {}
    const last = isRepo ? git(root, ['log', '-1', '--format=%h %ad %s', '--date=short', '--', rel]) : null
    return `- \`${rel}\` — ${what}${last ? ` · último commit: ${last}` : ''}`
  })
  return rows.join('\n')
}

function historySection(root, scope, isRepo) {
  if (!scope.length || !isRepo) return null
  const out = git(root, ['log', '-8', '--format=- %h %ad %s', '--date=short', '--', ...scope])
  return out || null
}

/**
 * Monta o pacote. `budget` (tokens estimados) opcional; sem orçamento, tudo entra.
 * Retorna { task, state, generated_at, estimated, total_tokens, budget, sections[], omitted[] }.
 */
export function buildContextPackage(root, arg, { budget = null, handoffs = DEFAULT_HANDOFFS, exclude = [], touch = false, env = process.env } = {}) {
  const loc = locateTask(root, arg)
  const task = parseTask(loc.file)
  const db = tryOpenDb(root)
  const candidates = []
  let memoryIds = []
  let memoryNote = null
  const add = (id, title, source, content) => {
    if (content === null || content === undefined || !String(content).trim()) return
    if (exclude.includes(id)) return
    candidates.push({ id, title, source, content: redact(String(content).trim()) })
  }

  try {
    add('task', `Task ${loc.name}`, norm(path.relative(root, loc.file)), task.raw)

    const agents = readIf(path.join(root, 'AGENTS.md'))
    if (agents) {
      const rules = h2Blocks(agents).filter((b) => /^(regras inegoci|guard rails)/i.test(b.heading))
      add('rules', 'Regras do projeto (AGENTS.md)', 'AGENTS.md', rules.map((b) => b.text).join('\n\n'))
    }

    const feature = clean(task.values?.Feature ?? '')
    if (!isEmpty(feature)) {
      const rel = `context/features/${feature}/spec.md`
      add('feature', `Spec da feature ${feature}`, rel, readIf(path.join(root, rel)))
    }

    const mod = moduleOf(task)
    if (mod) {
      const ctxRel = `context/modules/${mod}/context.md`
      const statusRel = `context/modules/${mod}/status.md`
      const status = readIf(path.join(root, statusRel))
      const parts = []
      const ctxText = readIf(path.join(root, ctxRel))
      if (ctxText) parts.push(ctxText.trim())
      if (status) {
        const hs = recentHandoffs(status, handoffs)
        if (hs.length) parts.push(`### Handoffs mais recentes (${statusRel})\n\n` + hs.map((h) => h.text.replace(/^## /, '#### ')).join('\n\n'))
      }
      add('module', `Módulo ${mod}`, [ctxText && ctxRel, status && statusRel].filter(Boolean).join(' + '), parts.join('\n\n'))
    }

    const deps = depsOf(task)
    if (deps.length) {
      const lines = []
      for (const dep of deps) {
        let depName = dep
        try {
          depName = locateTask(root, dep).name
        } catch {}
        const h = lastHandoffOf(db, depName)
        lines.push(`- **${depName}** — ${h ? `${h.content.replace(/^handoff:\s*/, '')} _(registrado em ${h.at})_` : 'sem handoff registrado no banco'}`)
      }
      add('deps', 'Dependências (handoffs registrados)', '.harness/harness.db', lines.join('\n'))
    }

    // Memória em níveis (task 119): só memórias ATIVAS relevantes para a task, com orçamento próprio.
    if (db && !exclude.includes('memory')) {
      const mem = memorySection(root, db, task, loc.name, env)
      if (mem) {
        add('memory', 'Memória do projeto (ativas, por relevância)', `.harness/harness.db${mem.global ? ' + memória global' : ''}`, mem.text)
        memoryIds = mem.ids
        memoryNote = mem.note
      }
    }

    const skillsRaw = clean(task.values?.['Skills a carregar'] ?? '')
    const skills = [...new Set(skillsRaw.match(/[a-z0-9-]+\.md/gi) ?? [])]
    const skillParts = skills
      .map((s) => ({ s, text: readIf(path.join(root, '.agents', s)) }))
      .filter((x) => x.text)
      .map((x) => `### .agents/${x.s}\n\n${x.text.trim()}`)
    if (skillParts.length) add('skills', 'Skills (.agents/)', skills.map((s) => `.agents/${s}`).join(', '), skillParts.join('\n\n'))

    const adrIds = [...new Set(task.raw.match(/ADR-\d{3}/g) ?? [])]
    const adrDir = path.join(root, 'context', 'project', 'adr')
    const adrParts = []
    for (const id of adrIds) {
      const file = fs.existsSync(adrDir) ? fs.readdirSync(adrDir).find((f) => f.startsWith(id)) : null
      const text = file ? readIf(path.join(adrDir, file)) : null
      if (text) adrParts.push(`### ${file}\n\n${text.trim()}`)
    }
    if (adrParts.length) add('adrs', 'ADRs citados', 'context/project/adr/', adrParts.join('\n\n'))

    const isRepo = task.scope.length > 0 && git(root, ['rev-parse', '--is-inside-work-tree']) === 'true'
    add('scope', 'Arquivos do escopo', '## Escopo + git', scopeSection(root, task.scope, isRepo))
    add('history', 'Commits recentes no escopo', 'git log', historySection(root, task.scope, isRepo))
  } finally {
    db?.close()
  }

  const sections = []
  const omitted = []
  let total = 0
  candidates.forEach((c, i) => {
    const tokens = estimateTokens(c.content)
    const section = { ...c, priority: i + 1, tokens }
    // Seções que não cabem saem inteiras; menores, de prioridade mais baixa, ainda entram se couberem.
    if (budget !== null && c.id !== 'task' && total + tokens > budget) {
      omitted.push({ id: c.id, title: c.title, tokens, reason: `não cabe no orçamento (${total}/${budget})` })
      return
    }
    total += tokens
    sections.push(section)
  })

  // Último acesso só quando a seção realmente entra no prompt de um run.
  if (touch && memoryIds.length && sections.some((s) => s.id === 'memory')) {
    const wdb = tryOpenDb(root)
    if (wdb) {
      try {
        touchMemories(wdb, memoryIds)
      } catch {} finally {
        wdb.close()
      }
    }
  }

  return {
    task: loc.name,
    state: loc.state,
    memory: memoryNote,
    generated_at: new Date().toISOString(),
    estimated: true,
    budget,
    total_tokens: total,
    sections,
    omitted
  }
}

/**
 * Seção de memória: candidatas por nível (task, agente da task, projeto, conhecimento e global
 * se `harness.json → memory.global`), ranqueadas por relevância à task e cortadas pelo orçamento
 * `memory.budget` (padrão 1500 tokens estimados; 0 desliga).
 */
function memorySection(root, db, task, taskId, env) {
  const cfg = resolveConfig(root).memory ?? {}
  const budget = cfg.budget ?? DEFAULT_MEMORY_BUDGET
  if (budget === 0) return null
  const agent = clean(task.values?.Agente ?? '').split(/\s/)[0] || null
  const query = [
    (task.raw.match(/^#\s*Task:\s*(.+)$/m)?.[1] ?? taskId.replace(/^\d+-|\.md$/g, '').replace(/-/g, ' ')),
    clean(task.values?.Feature ?? ''),
    moduleOf(task) ?? '',
    task.scope.join(' ').replace(/[/._-]+/g, ' '),
    clean(task.values?.['O que já existe'] ?? '').slice(0, 400)
  ].join(' ')
  let gdb = null
  try {
    if (cfg.global === true) {
      try {
        gdb = openGlobalDb(env)
      } catch {}
    }
    const ranked = rankForTask(db, { taskId, agent, query, globalDb: gdb })
    if (!ranked.length) return null
    const { items, omitted } = selectWithinBudget(ranked, budget)
    if (!items.length) return null
    const kinds = 'fato/decisão = verificado ou decidido; suposição/observação = confirmar antes de agir'
    const text =
      `Memórias aprovadas relevantes para esta task (${kinds}). Se alguma estiver desatualizada, diga no resumo.\n\n` +
      items.map(memoryLine).join('\n')
    return {
      text,
      ids: items.filter((m) => m.origin !== 'global').map((m) => m.id),
      global: items.some((m) => m.origin === 'global'),
      note: { items: items.length, omitted, budget }
    }
  } finally {
    gdb?.close()
  }
}

/** Markdown do pacote (para prompt ou arquivo). */
export function renderContextMarkdown(pkg) {
  const head = [
    `# Pacote de contexto — ${pkg.task}`,
    '',
    `> Gerado pelo harness em ${pkg.generated_at}. Tokens **estimados** (caracteres/4): ~${pkg.total_tokens}` +
      (pkg.budget !== null ? ` de ${pkg.budget} de orçamento` : '') +
      '.',
    pkg.omitted.length
      ? `> Omitidas por orçamento: ${pkg.omitted.map((o) => `${o.title} (~${o.tokens})`).join(', ')}.`
      : null
  ].filter((l) => l !== null)
  const body = pkg.sections.map(
    (s) => `---\n\n## [${s.id}] ${s.title}\n\n_fonte: ${s.source} · ~${s.tokens} tokens (estimado)_\n\n${s.content}`
  )
  return [...head, '', ...body].join('\n') + '\n'
}
