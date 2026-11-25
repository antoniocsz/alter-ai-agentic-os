// Execução competitiva (feature execucao-competitiva, task 124): a mesma task resolvida por
// várias tools em paralelo, cada uma numa worktree própria criada a partir do HEAD da worktree da
// task. O harness compara (status, uso, custo, tamanho, escopo), um juiz opcional recomenda e o
// humano escolhe: a vencedora é aplicada (squash, sem commit) na worktree da task; as outras são
// descartadas. Estado em `competitions` / `competitors`.
import fs from 'node:fs'
import path from 'node:path'
import { git, HARNESS_IDENTITY } from './worktree.js'
import { runTool } from './runner.js'
import { getRun } from './runs.js'
import { outOfScopeFromFiles } from './git.js'
import { worktreeDiff, worktreeSignature } from './flows.js'

export const COMPETITION_STATUSES = ['running', 'ready', 'picked', 'discarded', 'failed']
export const OPEN_COMPETITION = ['running', 'ready']
const JUDGE_DIFF_LIMIT = 25_000

export class CompetitionError extends Error {}

const nowIso = () => new Date().toISOString()

export function ensureCompetitionSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS competitions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      start_sha TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      judge_tool TEXT,
      judge_run_id TEXT,
      judge_winner TEXT,
      judge_notes TEXT,
      winner TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      finished_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_competitions_task ON competitions(task_id);
    CREATE TABLE IF NOT EXISTS competitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competition_id TEXT NOT NULL REFERENCES competitions(id),
      key TEXT NOT NULL,
      tool TEXT NOT NULL,
      model TEXT,
      dir TEXT NOT NULL,
      branch TEXT NOT NULL,
      run_id TEXT,
      status TEXT NOT NULL,
      error TEXT,
      files_changed INTEGER,
      insertions INTEGER,
      deletions INTEGER,
      out_of_scope_json TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_competitors_key ON competitors(competition_id, key);
  `)
}

/** `claude,codex:gpt-5,claude:opus` → [{ key, tool, model }] com chaves únicas (claude, codex, claude-2). */
export function parseCompetitors(raw) {
  if (!raw || raw === true) throw new CompetitionError('--tools exige a lista (ex.: --tools claude,codex)')
  const out = []
  for (const part of String(raw).split(',').map((s) => s.trim()).filter(Boolean)) {
    const [tool, ...rest] = part.split(':')
    if (!/^[a-z0-9-]+$/.test(tool)) throw new CompetitionError(`tool inválida em --tools: ${part}`)
    let key = tool
    for (let n = 2; out.some((c) => c.key === key); n++) key = `${tool}-${n}`
    out.push({ key, tool, model: rest.join(':') || null })
  }
  if (out.length < 2) throw new CompetitionError('competição exige ao menos 2 candidatas (ex.: --tools claude,codex)')
  if (out.length > 5) throw new CompetitionError('no máximo 5 candidatas')
  return out
}

function stamp(d = new Date()) {
  return d.toISOString().replace(/[-:TZ.]/g, '').slice(0, 17)
}

export function newCompetitionId(taskId) {
  const num = String(taskId ?? '').match(/^(\d+)-/)?.[1] ?? 'x'
  return `comp-${num}-${stamp()}`
}

function compOut(row) {
  if (!row) return null
  let plan = {}
  try {
    plan = JSON.parse(row.plan_json)
  } catch {}
  const { plan_json: _p, ...rest } = row
  return { ...rest, plan }
}

function competitorOut(row) {
  let out = []
  try {
    out = JSON.parse(row.out_of_scope_json ?? '[]')
  } catch {}
  const { out_of_scope_json: _o, ...rest } = row
  return { ...rest, out_of_scope: out }
}

export function getCompetition(db, id) {
  return compOut(db.prepare('SELECT * FROM competitions WHERE id = ?').get(id))
}

export function competitors(db, id) {
  return db.prepare('SELECT * FROM competitors WHERE competition_id = ? ORDER BY id').all(id).map(competitorOut)
}

export function listCompetitions(db, { taskId = null, limit = 30 } = {}) {
  const rows = taskId
    ? db.prepare('SELECT * FROM competitions WHERE task_id = ? ORDER BY created_at DESC LIMIT ?').all(taskId, limit)
    : db.prepare('SELECT * FROM competitions ORDER BY created_at DESC LIMIT ?').all(limit)
  return rows.map(compOut)
}

export function openCompetitionFor(db, taskId) {
  return compOut(
    db
      .prepare(`SELECT * FROM competitions WHERE task_id = ? AND status IN (${OPEN_COMPETITION.map(() => '?').join(',')}) ORDER BY created_at DESC LIMIT 1`)
      .get(taskId, ...OPEN_COMPETITION)
  )
}

function setCompetition(db, id, fields) {
  const keys = Object.keys(fields)
  db.prepare(`UPDATE competitions SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => fields[k]), nowIso(), id)
}

function setCompetitor(db, id, fields) {
  const keys = Object.keys(fields)
  db.prepare(`UPDATE competitors SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => fields[k]), id)
}

/**
 * Abre a competição: worktree de cada candidata a partir do HEAD da worktree da task (que precisa
 * estar limpa — a vencedora volta para ela). `taskWt` = { dir, path, branch }.
 */
export function createCompetition(root, db, { taskId, taskWt, candidates, plan = {}, judge = null }) {
  const open = openCompetitionFor(db, taskId)
  if (open) throw new CompetitionError(`a task já tem uma competição aberta: ${open.id} (${open.status}) — escolha: harness compete pick ${open.id} <candidata> · ou descarte: harness compete discard ${open.id}`)
  const dirty = git(taskWt.dir, ['status', '--porcelain']).trim()
  if (dirty) throw new CompetitionError(`a worktree da task tem mudanças não commitadas (${taskWt.path}) — a vencedora é aplicada sobre ela; commite ou descarte antes`)
  const startSha = git(taskWt.dir, ['rev-parse', 'HEAD']).trim()
  const id = newCompetitionId(taskId)
  const at = nowIso()
  db.prepare(
    'INSERT INTO competitions (id, task_id, status, start_sha, plan_json, judge_tool, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'
  ).run(id, taskId, 'running', startSha, JSON.stringify({ ...plan, candidates, judge }), judge?.tool ?? null, at, at)

  const base = path.basename(taskWt.dir)
  const branchBase = String(taskWt.branch ?? `task/${base}`).replace(/^task\//, '')
  const made = []
  try {
    for (const c of candidates) {
      const dir = path.join(path.dirname(taskWt.dir), `${base}--${c.key}`)
      const branch = `compete/${branchBase}/${c.key}`
      if (fs.existsSync(dir)) throw new CompetitionError(`worktree da candidata já existe no disco: ${dir} (rode harness compete discard)`)
      git(root, ['worktree', 'add', '-b', branch, dir, startSha])
      made.push({ dir, branch })
      db.prepare('INSERT INTO competitors (competition_id, key, tool, model, dir, branch, status) VALUES (?,?,?,?,?,?,?)').run(
        id, c.key, c.tool, c.model, path.relative(root, dir).replace(/\\/g, '/'), branch, 'pending'
      )
    }
  } catch (err) {
    for (const m of made) removeWorktree(root, m.dir, m.branch)
    db.prepare('DELETE FROM competitors WHERE competition_id = ?').run(id)
    db.prepare('DELETE FROM competitions WHERE id = ?').run(id)
    throw err instanceof CompetitionError ? err : new CompetitionError(`não consegui criar as worktrees: ${String(err.stderr ?? err.message).trim()}`)
  }
  return getCompetition(db, id)
}

function removeWorktree(root, dir, branch) {
  try {
    git(root, ['worktree', 'remove', '--force', dir])
  } catch {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
      git(root, ['worktree', 'prune'])
    } catch {}
  }
  try {
    git(root, ['branch', '-D', branch])
  } catch {}
}

/** Estatística da candidata contra o início: arquivos, linhas, fora do escopo. */
export function candidateStats(root, dir, startSha, scope = [], baseline = []) {
  git(dir, ['add', '-A'])
  const numstat = git(dir, ['diff', '--cached', '--numstat', startSha]).trim()
  let files = 0
  let ins = 0
  let del = 0
  const names = []
  for (const line of numstat.split('\n').filter(Boolean)) {
    const [a, d, ...name] = line.split('\t')
    files++
    ins += Number(a) || 0
    del += Number(d) || 0
    names.push(name.join('\t'))
  }
  const out = scope.length ? outOfScopeFromFiles(names, baseline, [...scope, 'context/', 'tasks/', '.tmp/']) : []
  return { files, insertions: ins, deletions: del, outOfScope: out }
}

/** Uma linha `VENCEDOR: <chave>` (ou NENHUM) no texto do juiz. */
export function parseWinner(text, keys) {
  const m = String(text ?? '').match(/^\s*[*_`>]*\s*VENCEDOR\s*[*_`]*\s*:\s*[*_`]*\s*([A-Za-z0-9-]+)/im)
  if (!m) return null
  const word = m[1].toLowerCase()
  if (word === 'nenhum' || word === 'none') return { winner: null, none: true }
  return keys.includes(word) ? { winner: word, none: false } : null
}

function lastTexts(db, runId) {
  return db
    .prepare("SELECT payload_json FROM run_events WHERE run_id = ? AND type = 'agent.message' ORDER BY seq DESC")
    .all(runId)
    .map((r) => {
      try {
        return JSON.parse(r.payload_json)?.text ?? ''
      } catch {
        return ''
      }
    })
    .filter(Boolean)
}

/**
 * Roda as candidatas em paralelo (até `max`), mede cada uma e, se houver juiz, roda o juiz na
 * worktree da task (só leitura). `prepare(agent, wt, role, extra)` monta o run (prepareRun).
 */
export async function runCompetition({ root, db, id, prepare, taskWt, scope = [], baseline = [], max = 2, env = process.env, signal = null, onEvent = () => {}, onCandidate = () => {} }) {
  const comp = getCompetition(db, id)
  if (!comp) throw new CompetitionError(`competição não encontrada: ${id}`)
  const list = competitors(db, id)
  let next = 0
  const worker = async () => {
    for (;;) {
      if (signal?.aborted) return
      const c = list[next++]
      if (!c) return
      const dir = path.join(root, c.dir)
      setCompetitor(db, c.id, { status: 'running' })
      onCandidate({ key: c.key, tool: c.tool, status: 'running' })
      let result
      try {
        const prep = prepare({ tool: c.tool, model: c.model }, { dir, path: c.dir, branch: c.branch, base: comp.start_sha }, 'implement', null)
        result = await runTool({
          db,
          taskId: comp.task_id,
          cwd: dir,
          driver: prep.driver,
          prompt: prep.prompt,
          opts: prep.opts,
          unsafe: prep.unsafe,
          env,
          signal,
          limit: prep.gate.limit ?? null,
          budgetOverride: prep.money.ignore,
          onStart: (runId) => setCompetitor(db, c.id, { run_id: runId }),
          onEvent: (ev) => onEvent({ ...ev, key: c.key })
        })
      } catch (err) {
        result = { runId: null, status: 'failed', error: err.message }
      }
      let stats = { files: null, insertions: null, deletions: null, outOfScope: [] }
      try {
        stats = candidateStats(root, dir, comp.start_sha, scope, baseline)
      } catch {}
      setCompetitor(db, c.id, {
        run_id: result.runId ?? null,
        status: result.status === 'completed' ? 'completed' : 'failed',
        error: result.status === 'completed' ? null : result.error ?? 'run falhou',
        files_changed: stats.files,
        insertions: stats.insertions,
        deletions: stats.deletions,
        out_of_scope_json: JSON.stringify(stats.outOfScope)
      })
      onCandidate({ key: c.key, tool: c.tool, status: result.status, error: result.error ?? null, stats })
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(max, list.length)) }, worker))

  if (signal?.aborted) {
    setCompetition(db, id, { status: 'failed', error: 'interrompido' })
    return getCompetition(db, id)
  }
  const done = competitors(db, id).filter((c) => c.status === 'completed' && c.files_changed > 0)
  if (!done.length) {
    setCompetition(db, id, { status: 'failed', error: 'nenhuma candidata concluiu com mudanças — descarte com: harness compete discard ' + id })
    return getCompetition(db, id)
  }

  const judge = comp.plan.judge
  if (judge && done.length >= 2) {
    const blocks = done.map((c) => {
      const d = worktreeDiff(path.join(root, c.dir), comp.start_sha)
      const body = d.diff.length > JUDGE_DIFF_LIMIT ? d.diff.slice(0, JUDGE_DIFF_LIMIT) + '\n… (cortado)' : d.diff
      return `=== CANDIDATA ${c.key} (${c.tool}${c.model ? `:${c.model}` : ''}) — ${c.files_changed} arquivo(s), +${c.insertions}/-${c.deletions}` +
        `${c.out_of_scope.length ? `, FORA DO ESCOPO: ${c.out_of_scope.join(', ')}` : ''} ===\n${body}`
    })
    const extra = `--- CANDIDATAS (diff de cada uma contra o ponto de partida) ---\n${blocks.join('\n\n')}`
    try {
      const prep = prepare(judge, null, 'judge', extra)
      const before = worktreeSignature(taskWt.dir)
      const res = await runTool({
        db,
        taskId: comp.task_id,
        cwd: taskWt.dir,
        driver: prep.driver,
        prompt: prep.prompt,
        opts: prep.opts,
        unsafe: prep.unsafe,
        env,
        signal,
        limit: prep.gate.limit ?? null,
        budgetOverride: prep.money.ignore,
        onEvent: (ev) => onEvent({ ...ev, key: 'juiz' })
      })
      let fields = { judge_run_id: res.runId }
      if (res.status !== 'completed') fields.judge_notes = `juiz falhou: ${res.error ?? 'run falhou'}`
      else if (worktreeSignature(taskWt.dir) !== before) fields.judge_notes = 'juiz alterou a worktree da task — recomendação descartada; confira a worktree'
      else {
        const text = lastTexts(db, res.runId).find((t) => /VENCEDOR/i.test(t)) ?? ''
        const parsed = parseWinner(text, done.map((c) => c.key))
        if (!parsed) fields.judge_notes = 'juiz não indicou vencedora (VENCEDOR: <chave> | NENHUM)'
        else {
          fields.judge_winner = parsed.none ? 'nenhum' : parsed.winner
          fields.judge_notes = text.slice(0, 4000)
        }
      }
      setCompetition(db, id, fields)
    } catch (err) {
      setCompetition(db, id, { judge_notes: `juiz não rodou: ${err.message}` })
    }
  }
  setCompetition(db, id, { status: 'ready', error: null })
  return getCompetition(db, id)
}

/** Aplica a vencedora (squash, sem commit) na worktree da task e remove todas as candidatas. */
export function pickCompetitor(root, db, id, key, taskWt) {
  const comp = getCompetition(db, id)
  if (!comp) throw new CompetitionError(`competição não encontrada: ${id}`)
  if (comp.status !== 'ready') throw new CompetitionError(`competição ${id} está ${comp.status} — só se escolhe com ela pronta (ready)`)
  const list = competitors(db, id)
  const c = list.find((x) => x.key === key)
  if (!c) throw new CompetitionError(`candidata inexistente: ${key} (opções: ${list.map((x) => x.key).join(', ')})`)
  if (c.status !== 'completed') throw new CompetitionError(`candidata ${key} não concluiu (${c.status}) — escolha outra`)
  if (git(taskWt.dir, ['status', '--porcelain']).trim()) throw new CompetitionError(`a worktree da task tem mudanças não commitadas (${taskWt.path}) — commite ou descarte antes de aplicar a vencedora`)
  const dir = path.join(root, c.dir)
  git(dir, ['add', '-A'])
  let hasStaged = true
  try {
    git(dir, ['diff', '--cached', '--quiet'])
    hasStaged = false
  } catch {}
  if (hasStaged) git(dir, [...HARNESS_IDENTITY, 'commit', '-m', `chore(compete): candidata ${key} (${c.tool})`])
  try {
    git(taskWt.dir, ['merge', '--squash', c.branch])
  } catch (err) {
    throw new CompetitionError(`não consegui aplicar ${key} na worktree da task: ${String(err.stderr ?? err.message).trim()}`)
  }
  for (const x of list) removeWorktree(root, path.join(root, x.dir), x.branch)
  setCompetition(db, id, { status: 'picked', winner: key, finished_at: nowIso() })
  return { competition: getCompetition(db, id), winner: c }
}

/** Descarta a competição: remove as worktrees e branches das candidatas. */
export function discardCompetition(root, db, id) {
  const comp = getCompetition(db, id)
  if (!comp) throw new CompetitionError(`competição não encontrada: ${id}`)
  if (['picked', 'discarded'].includes(comp.status)) throw new CompetitionError(`competição ${id} já está ${comp.status}`)
  const running = competitors(db, id).filter((c) => c.status === 'running' && c.run_id).map((c) => getRun(db, c.run_id)).filter((r) => r?.status === 'running')
  if (running.length) throw new CompetitionError(`há candidatas rodando (${running.map((r) => r.id).join(', ')}) — pare antes: harness run --stop <run>`)
  for (const c of competitors(db, id)) removeWorktree(root, path.join(root, c.dir), c.branch)
  setCompetition(db, id, { status: 'discarded', finished_at: nowIso() })
  return getCompetition(db, id)
}
