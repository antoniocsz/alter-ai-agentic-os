// API local de execuções (feature api-local, task 115). Usada pelo `harness serve`:
// lista/consulta runs, dispara um agente na worktree da task (mesmo caminho do `harness run`)
// e interrompe execuções. Zero deps; o roteamento HTTP também mora aqui para o kanban.js só
// delegar (`/api/runtimes`, `/api/runs*`).
//
// Guard rails (spec AC-4): rotas que disparam/param exigem o header `X-Harness-Token` com o token
// da sessão do serve, origem igual ao host e `Host` na lista permitida (anti DNS-rebinding, vale
// também para as leituras). `unsafe` só com `harness serve --allow-unsafe`. Um run por task.
import { createHash, timingSafeEqual } from 'node:crypto'
import { openDb } from './db.js'
import { getRun, listRuns, runEvents, latestRun, pidAlive, runDurationMs } from './runs.js'
import { runTool, stopRun } from './runner.js'
import { resolveTaskId } from './db.js'
import { prepareRun } from '../run.js'
import { detectRuntimes } from '../runtimes.js'

const MAX_BODY = 16 * 1024
const RUN_ID_RE = /^run-[A-Za-z0-9x]+-\d{8,}[0-9-]*$/
const TASK_ARG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/
const LOOPBACK = ['localhost', '127.0.0.1', '::1', '[::1]']
const RUNTIMES_TTL_MS = 30_000

const digest = (v) => createHash('sha256').update(String(v ?? '')).digest()
const sameSecret = (a, b) => timingSafeEqual(digest(a), digest(b))

/** Erro com status HTTP (a mensagem vai para o cliente). */
export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function hostnameOf(hostHeader) {
  if (!hostHeader) return null
  try {
    return new URL(`http://${hostHeader}`).hostname.toLowerCase()
  } catch {
    return null
  }
}

/** Run para a API: sem caminhos internos desnecessários, com duração calculada. */
function publicRun(run) {
  if (!run) return null
  return { ...run, measured: Boolean(run.measured), unsafe: Boolean(run.unsafe), budget_override: Boolean(run.budget_override), duration_ms: runDurationMs(run) }
}

/**
 * `createRunsApi(root, opts)`:
 * - `env` — ambiente para localizar/rodar as tools (testes injetam PATH com tools falsas);
 * - `token` — segredo da sessão do serve (obrigatório nos POSTs);
 * - `allowUnsafe` — aceita `unsafe: true` no dispatch;
 * - `host` — host do bind, somado aos nomes de loopback na lista de `Host` permitidos.
 */
export function createRunsApi(root, opts = {}) {
  const env = opts.env ?? process.env
  const token = opts.token
  if (!token) throw new Error('createRunsApi: token obrigatório')
  const allowUnsafe = Boolean(opts.allowUnsafe)
  const allowedHosts = new Set([...LOOPBACK, String(opts.host ?? '127.0.0.1').toLowerCase()])
  const active = new Map() // runId → { taskId, controller, done }
  let runtimesCache = null

  function withDb(fn) {
    const db = openDb(root)
    try {
      return fn(db)
    } finally {
      db.close()
    }
  }

  function runtimes() {
    const now = Date.now()
    if (!runtimesCache || now - runtimesCache.at > RUNTIMES_TTL_MS) runtimesCache = { at: now, rows: detectRuntimes(env) }
    return runtimesCache.rows
  }

  function list({ task = null, batch = null, limit = 50 } = {}) {
    if (task !== null && !TASK_ARG_RE.test(task)) throw new ApiError(400, `task inválida: ${task}`)
    const n = Number(limit)
    if (!Number.isInteger(n) || n < 1 || n > 500) throw new ApiError(400, `limit inválido: ${limit} (1–500)`)
    const taskId = task ? resolveTaskId(root, task) : null
    return withDb((db) => listRuns(db, { taskId, batchId: batch, limit: n }).map(publicRun))
  }

  function get(id, { after = 0, native = false } = {}) {
    if (!RUN_ID_RE.test(id)) throw new ApiError(400, `id de run inválido: ${id}`)
    const seq = Number(after)
    if (!Number.isInteger(seq) || seq < 0) throw new ApiError(400, `after inválido: ${after}`)
    return withDb((db) => {
      const run = getRun(db, id)
      if (!run) throw new ApiError(404, `run não encontrado: ${id}`)
      const events = runEvents(db, id)
        .filter((e) => e.seq > seq)
        .map((e) => (native ? e : { ...e, native: undefined }))
      return { run: publicRun(run), events, last_seq: events.at(-1)?.seq ?? seq }
    })
  }

  function flagsFrom(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'body deve ser um objeto JSON')
    const str = (k) => {
      const v = body[k]
      if (v === undefined || v === null || v === '') return undefined
      if (typeof v !== 'string') throw new ApiError(400, `${k} deve ser texto`)
      return v
    }
    const bool = (k) => {
      const v = body[k]
      if (v === undefined || v === null) return false
      if (typeof v !== 'boolean') throw new ApiError(400, `${k} deve ser true/false`)
      return v
    }
    const task = body.task === undefined || body.task === null ? '' : String(body.task)
    if (!TASK_ARG_RE.test(task)) throw new ApiError(400, 'task obrigatória (ex.: "07" ou "07-exemplo.md")')
    const tool = str('tool')
    if (!tool) throw new ApiError(400, 'tool obrigatória (veja GET /api/runtimes)')
    const flags = { tool }
    const model = str('model')
    if (model) flags.model = model
    const mode = str('permissionMode')
    if (mode) flags['permission-mode'] = mode
    if (bool('unsafe')) {
      if (!allowUnsafe) throw new ApiError(403, 'unsafe desativado neste serve — suba com: harness serve --allow-unsafe')
      flags.unsafe = true
    }
    if (bool('ignoreBudget')) flags['ignore-budget'] = true
    if (body.contextBudget !== undefined && body.contextBudget !== null) {
      if (!Number.isInteger(body.contextBudget) || body.contextBudget < 0) throw new ApiError(400, 'contextBudget deve ser inteiro >= 0 (0 desliga)')
      flags['context-budget'] = String(body.contextBudget)
    }
    return { task, flags }
  }

  /** Dispara o agente; resolve com o run já aberto (`running`). O run segue em segundo plano. */
  function dispatch(body) {
    const { task, flags } = flagsFrom(body)
    const db = openDb(root)
    let keepOpen = false
    try {
      let prep
      try {
        prep = prepareRun(root, flags, task, db)
      } catch (err) {
        throw new ApiError(err.code === 'BUDGET' ? 409 : 422, err.message)
      }
      const busy = [...active.values()].some((a) => a.taskId === prep.taskId)
      const last = latestRun(db, prep.taskId)
      if (busy || (last?.status === 'running' && pidAlive(last.pid))) {
        throw new ApiError(409, `já há um run em andamento para ${prep.taskId}${last?.status === 'running' ? ` (${last.id})` : ''}`)
      }
      const controller = new AbortController()
      let runId = null
      let done
      try {
        done = runTool({
          db,
          taskId: prep.taskId,
          cwd: prep.wt.dir,
          driver: prep.driver,
          prompt: prep.prompt,
          opts: prep.opts,
          unsafe: prep.unsafe,
          env,
          signal: controller.signal,
          limit: prep.gate.limit ?? null,
          budgetOverride: prep.money.ignore,
          onStart: (id) => {
            runId = id
          }
        })
      } catch (err) {
        throw new ApiError(422, err.message) // tool ausente no PATH etc.: nada foi aberto
      }
      keepOpen = true
      const entry = { taskId: prep.taskId, controller, done: null }
      entry.done = done
        .catch(() => null)
        .finally(() => {
          active.delete(runId)
          try {
            db.close()
          } catch {}
        })
      active.set(runId, entry)
      return { run: publicRun(getRun(db, runId)), context: prep.ctx?.summary ?? null }
    } finally {
      if (!keepOpen) db.close()
    }
  }

  function stop(id) {
    if (!RUN_ID_RE.test(id)) throw new ApiError(400, `id de run inválido: ${id}`)
    const own = active.get(id)
    if (own) {
      own.controller.abort()
      return { ok: true, by: 'serve' }
    }
    return withDb((db) => {
      if (!getRun(db, id)) throw new ApiError(404, `run não encontrado: ${id}`)
      const res = stopRun(db, id)
      if (!res.ok) throw new ApiError(409, res.reason)
      return { ok: true, by: 'pid', killed: res.killed }
    })
  }

  /** Espera o fim de um run disparado por este serve (testes e encerramento). */
  function settled(id) {
    return active.get(id)?.done ?? Promise.resolve(null)
  }

  /** Encerramento do serve: interrompe os runs em andamento e espera fecharem. */
  async function stopAll() {
    const pending = [...active.values()]
    for (const a of pending) a.controller.abort()
    await Promise.all(pending.map((a) => a.done))
  }

  // ---------- HTTP ----------

  function hostAllowed(req) {
    const name = hostnameOf(req.headers.host)
    return name !== null && allowedHosts.has(name)
  }

  function sameOrigin(req) {
    const origin = req.headers.origin
    if (!origin) return true
    try {
      return new URL(origin).host === req.headers.host
    } catch {
      return false
    }
  }

  function send(res, status, data) {
    if (res.headersSent) return
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(data))
  }

  async function readJson(req) {
    if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
      throw new ApiError(415, 'content-type deve ser application/json')
    }
    let raw = ''
    for await (const chunk of req) {
      raw += chunk
      if (raw.length > MAX_BODY) throw new ApiError(413, 'body muito grande')
    }
    if (!raw.trim()) return {}
    try {
      return JSON.parse(raw)
    } catch {
      throw new ApiError(400, 'JSON inválido')
    }
  }

  function checkWrite(req) {
    if (!sameOrigin(req)) throw new ApiError(403, 'origem não permitida')
    const provided = req.headers['x-harness-token']
    if (!provided || !sameSecret(provided, token)) {
      throw new ApiError(401, 'token ausente ou inválido (header X-Harness-Token; veja .harness/serve.json)')
    }
  }

  /** Atende `/api/runtimes` e `/api/runs*`. Retorna false se a rota não é desta API. */
  function handle(req, res, url) {
    const p = url.pathname
    if (p !== '/api/runtimes' && p !== '/api/runs' && !p.startsWith('/api/runs/')) return false
    const exec = async () => {
      if (!hostAllowed(req)) throw new ApiError(403, 'host não permitido')
      const q = url.searchParams
      if (req.method === 'GET' && p === '/api/runtimes') return send(res, 200, { ok: true, runtimes: runtimes(), allow_unsafe: allowUnsafe })
      if (req.method === 'GET' && p === '/api/runs') {
        return send(res, 200, { ok: true, runs: list({ task: q.get('task'), batch: q.get('batch'), limit: q.get('limit') ?? 50 }) })
      }
      if (req.method === 'POST' && p === '/api/runs') {
        checkWrite(req)
        const body = await readJson(req)
        return send(res, 202, { ok: true, ...dispatch(body) })
      }
      const stopM = p.match(/^\/api\/runs\/([^/]+)\/stop$/)
      if (req.method === 'POST' && stopM) {
        checkWrite(req)
        return send(res, 200, stop(decodeURIComponent(stopM[1])))
      }
      const getM = p.match(/^\/api\/runs\/([^/]+)$/)
      if (req.method === 'GET' && getM) {
        return send(res, 200, { ok: true, ...get(decodeURIComponent(getM[1]), { after: q.get('after') ?? 0, native: q.get('native') === '1' }) })
      }
      throw new ApiError(404, 'rota não encontrada')
    }
    exec().catch((err) => send(res, err instanceof ApiError ? err.status : 500, { ok: false, error: err.message }))
    return true
  }

  return { token, allowUnsafe, runtimes, list, get, dispatch, stop, settled, stopAll, handle, active }
}
