import fs from 'node:fs'
import path from 'node:path'
import { DB_DIR, tryOpenDb, logEvent, recordInteraction } from './lib/db.js'
import { queueDir, activeDir, listTasks } from './lib/tasks.js'
import { createTaskFile, slugify } from './task.js'
import { normalizeCommitType } from './lib/commits.js'

export const ROUTINES_FILE = 'routines.json'
export const DEFAULT_TICK_MS = 30_000

const WEEKDAYS = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6, sáb: 6 }
const EVERY_HINT = 'use <n>m, <n>h, daily@HH:MM ou weekly@<seg|ter|qua|qui|sex|sab|dom>@HH:MM'

const isClock = (hour, minute) => hour <= 23 && minute <= 59

/**
 * Parser de `every`: `<n>m`, `<n>h`, `daily@HH:MM`, `weekly@<dia>@HH:MM`.
 * Retorna { kind, ... } ou null quando inválido.
 */
export function parseEvery(every) {
  const raw = String(every ?? '').trim().toLowerCase()

  const interval = raw.match(/^(\d+)(m|h)$/)
  if (interval) {
    const size = Number(interval[1])
    return size >= 1 ? { kind: 'interval', unit: interval[2], size } : null
  }

  const daily = raw.match(/^daily@(\d{1,2}):(\d{2})$/)
  if (daily) {
    const hour = Number(daily[1])
    const minute = Number(daily[2])
    return isClock(hour, minute) ? { kind: 'daily', hour, minute } : null
  }

  const weekly = raw.match(/^weekly@([a-zá]+)@(\d{1,2}):(\d{2})$/)
  if (weekly) {
    const weekday = WEEKDAYS[weekly[1]]
    const hour = Number(weekly[2])
    const minute = Number(weekly[3])
    return weekday === undefined || !isClock(hour, minute) ? null : { kind: 'weekly', weekday, hour, minute }
  }

  return null
}

/** Próxima execução de um `every` válido, no fuso local. Lança em `every` inválido. */
export function nextRun(every, now = new Date()) {
  const spec = parseEvery(every)
  if (!spec) throw new Error(`every inválido: ${JSON.stringify(every)} (${EVERY_HINT})`)
  if (spec.kind === 'interval') {
    const ms = (spec.unit === 'm' ? 60_000 : 3_600_000) * spec.size
    return new Date(now.getTime() + ms)
  }
  const target = new Date(
    now.getFullYear(), now.getMonth(), now.getDate(), spec.hour, spec.minute, 0, 0
  )
  if (spec.kind === 'daily' && target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1)
  }
  if (spec.kind === 'weekly') {
    target.setDate(target.getDate() + ((spec.weekday - now.getDay() + 7) % 7))
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 7)
  }
  return target
}

/** Caminho do registro de rotinas: `.harness/routines.json` (gitignored, junto do banco). */
export function routinesFile(root = process.cwd()) {
  return path.join(root, DB_DIR, ROUTINES_FILE)
}

/**
 * Lê e valida `.harness/routines.json` (AC-1). Rotina inválida NÃO derruba o
 * consumidor (serve/agendador): sai em `errors` com mensagem clara e não entra
 * em `routines`. Arquivo ausente é estado válido (nenhuma rotina agendada).
 */
export function loadRoutines(root = process.cwd()) {
  const file = routinesFile(root)
  const result = { routines: [], errors: [], file }
  if (!fs.existsSync(file)) return result

  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    result.errors.push(`routines.json inválido (JSON): ${err.message}`)
    return result
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    result.errors.push('routines.json deve ser um objeto { "routines": [...] }')
    return result
  }
  if (!Array.isArray(parsed.routines)) {
    result.errors.push('routines.json precisa de "routines": [] (lista de rotinas)')
    return result
  }

  const seen = new Set()
  parsed.routines.forEach((entry, index) => {
    const label = labelFor(entry, index)
    let routine
    try {
      routine = parseRoutine(entry, label)
    } catch (err) {
      result.errors.push(err.message)
      return
    }
    if (seen.has(routine.id)) {
      result.errors.push(`${label}: id duplicado "${routine.id}" (rotina ignorada)`)
      return
    }
    seen.add(routine.id)
    result.routines.push(routine)
  })

  return result
}

function labelFor(entry, index) {
  const id = entry && typeof entry === 'object' && !Array.isArray(entry)
    ? typeof entry.id === 'string' && entry.id.trim()
    : ''
  return id ? `rotina "${id}"` : `rotina #${index}`
}

const dataOf = (key, input) => JSON.stringify(input[key])

function routineError(label, problems) {
  return new Error(`${label} é inválida e foi ignorada:\n  - ${problems.join('\n  - ')}`)
}

function parseRoutine(entry, label) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw routineError(label, ['cada rotina deve ser um objeto com id/every/task'])
  }

  const problems = []
  const id = typeof entry.id === 'string' ? entry.id.trim() : ''
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    problems.push('id inválido (aparece em /webhook/routines/<id>: use a-z0-9 e "-")')
  }
  if (!parseEvery(entry.every)) {
    problems.push(`every ${JSON.stringify(entry.every ?? '')} inválido (${EVERY_HINT})`)
  }
  if (entry.dedupe !== undefined && typeof entry.dedupe !== 'boolean') {
    problems.push('dedupe deve ser boolean')
  }

  const rawTask = entry.task
  if (!rawTask || typeof rawTask !== 'object' || Array.isArray(rawTask)) {
    problems.push('task deve ser um objeto com title (e metadados opcionais)')
    throw routineError(label, problems)
  }

  const priority = rawTask.priority === undefined ? undefined : String(rawTask.priority).toUpperCase()
  if (priority !== undefined && !/^P[0-3]$/.test(priority)) {
    problems.push(`task.priority ${dataOf('priority', rawTask)} inválida (use P0 | P1 | P2 | P3)`)
  }
  if (rawTask.type !== undefined) {
    try {
      normalizeCommitType(rawTask.type)
    } catch {
      problems.push(`task.type ${dataOf('type', rawTask)} inválido (conventional: feat | fix | docs ...)`)
    }
  }
  if (rawTask.scope !== undefined) {
    const okScope = Array.isArray(rawTask.scope) && rawTask.scope.every((s) => typeof s === 'string' && s.trim())
    if (!okScope) problems.push('task.scope deve ser uma lista de paths (repo-relative)')
  }
  for (const key of ['title', 'module', 'agent', 'feature']) {
    if (rawTask[key] !== undefined && (typeof rawTask[key] !== 'string' || !rawTask[key].trim())) {
      problems.push(`task.${key} deve ser string não vazia`)
    }
  }
  if (typeof rawTask.title !== 'string' || !rawTask.title.trim()) {
    problems.push('task.title é obrigatório (título da task criada)')
  }

  if (problems.length > 0) throw routineError(label, problems)

  return {
    id,
    every: String(entry.every).trim().toLowerCase(),
    dedupe: entry.dedupe === true,
    task: {
      description: rawTask.title.trim(),
      module: optString(rawTask.module),
      agent: optString(rawTask.agent),
      priority,
      type: rawTask.type === undefined ? undefined : String(rawTask.type).trim().toLowerCase(),
      scope: Array.isArray(rawTask.scope)
        ? rawTask.scope.map((s) => String(s).trim()).filter(Boolean)
        : [],
      feature: optString(rawTask.feature)
    }
  }
}

function optString(value) {
  return value === undefined ? undefined : String(value).trim()
}

/**
 * Dispara a rotina por id (agendador ou webhook): cria a task na queue com a
 * MESMA lógica do `harness task` e grava os eventos do disparo no banco
 * (criada / skip por dedupe / erro — AC-6). Erros nunca se propagam: voltam em
 * `error` como resultado.
 */
export function fireRoutine(id, root = process.cwd()) {
  const routineId = String(id ?? '').trim()
  const { routines, errors } = loadRoutines(root)
  const routine = routines.find((r) => r.id === routineId)

  if (!routine) {
    const base = `rotina não encontrada em routines.json: "${routineId}"`
    const reason = errors.length > 0
      ? `${base} (rotinas com erro de schema foram ignoradas):\n  ${errors.join('\n  ')}`
      : base
    recordRoutineEvent(root, `routine:${routineId}`, 'routine_error', routineId, reason)
    return { ok: false, created: false, skipped: false, error: reason }
  }

  try {
    const slug = slugify(routine.task.description)
    if (routine.dedupe) {
      const existing = findExistingTask(root, slug)
      if (existing) {
        recordRoutineEvent(
          root,
          existing,
          'routine_skipped',
          routineId,
          'task com o mesmo título já existe (dedupe ativo)'
        )
        return { ok: true, created: false, skipped: true, dedupe: true, task: existing }
      }
    }
    const created = createTaskFile(root, routine.task)
    recordRoutineEvent(
      root,
      created.name,
      'routine_fired',
      routineId,
      `disparo da rotina "${routineId}" → ${created.relPath}`
    )
    return { ok: true, created: true, skipped: false, task: created.name, num: created.num }
  } catch (err) {
    const reason = `falha ao criar task da rotina "${routineId}": ${err.message}`
    recordRoutineEvent(root, `routine:${routineId}`, 'routine_error', routineId, reason)
    return { ok: false, created: false, skipped: false, error: reason }
  }
}

/** Task existente (queue/active) com o mesmo slug derivado do título — done/ não bloqueia. */
function findExistingTask(root, slug) {
  const pattern = new RegExp(`^\\d+-${slug}\\.md$`)
  for (const dir of [queueDir(root), activeDir(root)]) {
    const name = listTasks(dir).find((n) => pattern.test(n))
    if (name) return name
  }
  return null
}

export function recordRoutineEvent(root, taskId, event, routineId, message) {
  const db = tryOpenDb(root)
  if (!db) return
  try {
    logEvent(db, taskId, event, message)
    recordInteraction(db, {
      taskId,
      kind: 'system',
      content: `rotina "${routineId}": ${event} — ${message}`,
      source: 'routines',
      meta: { routine: routineId }
    })
  } catch {} finally {
    try {
      db.close()
    } catch {}
  }
}

/**
 * Loop do agendador (task 86): tick periódico que recarrega o `routines.json`,
 * planeja a próxima execução de cada rotina (`nextRun`) e dispara `onDue(rotina)`
 * quando o horário chega — por padrão, `fireRoutine(id)`. O horário é CONSUMIDO
 * mesmo com falha de disparo (sem re-disparo em loop / martelada de eventos);
 * rotina inválida ou removida sai do plano. Chamado SEM `root` mantém o contrato
 * legado da task 82 (descritor "não rodando"); o loop real vive no `harness serve`.
 *
 * Retorno: { running, tickMs, tick(now?), nextRunAt(id), stop() }.
 */
export function startScheduler(root, opts = {}) {
  if (!root) {
    return {
      running: false,
      reason: 'agendador em loop mora no `harness serve` (task 86): chame startScheduler(cwd, { tickMs, clock, onDue })'
    }
  }

  const tickMs = opts.tickMs ?? DEFAULT_TICK_MS
  const clock = opts.clock ?? (() => new Date())
  const onDue = opts.onDue ?? ((routine) => fireRoutine(routine.id, root))
  const planned = new Map() // id → { at: Date | null } (null: every virou inválido)
  let lastErrors = null
  let timer = null
  let stopped = false

  const safeNext = (every, now) => {
    try {
      return nextRun(every, now)
    } catch {
      return null
    }
  }

  function plan(routines, now) {
    const alive = new Set(routines.map((r) => r.id))
    for (const r of routines) {
      if (!planned.has(r.id)) planned.set(r.id, { at: safeNext(r.every, now) })
    }
    for (const id of [...planned.keys()]) {
      if (!alive.has(id)) planned.delete(id) // rotina removida do arquivo
    }
  }

  function reportLoadErrors(errors) {
    const msg = errors.join('\n')
    if (msg === lastErrors) return // mesmo conjunto já reportado — não re-loga a cada tick
    for (const e of errors) process.stderr.write(`⚠️ rotinas: ${e}\n`)
    lastErrors = msg
  }

  /** Um passo do agendador (export p/ testes e para aquecer o plano no build). */
  function tick(now = clock()) {
    const { routines, errors } = loadRoutines(root)
    reportLoadErrors(errors)
    plan(routines, now)
    for (const [id, p] of planned) {
      if (!p.at || p.at.getTime() > now.getTime()) continue
      const routine = routines.find((r) => r.id === id)
      try {
        onDue(routine)
      } catch (err) {
        process.stderr.write(`⚠️ rotinas: falha no tick de "${id}": ${err.message}\n`)
      }
      // consome o horário e re-planeja (criada ou falha) na próxima janela
      p.at = routine ? safeNext(routine.every, clock()) : null
    }
  }

  function schedule() {
    timer = setTimeout(() => {
      if (stopped) return
      try {
        tick()
      } catch (err) {
        process.stderr.write(`⚠️ rotinas: tick falhou: ${err.message}\n`)
      }
      schedule()
    }, tickMs)
  }

  schedule()

  return {
    get running() {
      return !stopped
    },
    tickMs,
    tick,
    nextRunAt: (id) => planned.get(id)?.at ?? null,
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      timer = null
    }
  }
}
