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
import { activeDir, resolveTaskName } from './tasks.js'
import { prepareRun, prepareContinue, resolveRunOptions, taskWorktree } from '../run.js'
import { ConversationError, conversationOf } from './conversation.js'
import { taskChanges, filePatch } from './changes.js'
import { taskFindings } from './findings.js'
import { FlowError, APPROVE_MODES, createFlow, flowSteps, getFlow, listFlows, parseAgentSpec, resumeFlow, runFlow, stopFlow } from './flows.js'
import { detectRuntimes } from '../runtimes.js'
import { parseTask } from './tasks.js'
import { parseBaseline } from './pipeline.js'
import { CompetitionError, competitors as compCandidates, createCompetition, discardCompetition, getCompetition, listCompetitions, openCompetitionFor, parseCompetitors, pickCompetitor, runCompetition } from './competitions.js'
import path from 'node:path'

const MAX_BODY = 64 * 1024 // task 139: mensagens da conversa
const RUN_ID_RE = /^run-[A-Za-z0-9x]+-\d{8,}[0-9-]*$/
const FLOW_ID_RE = /^flow-[A-Za-z0-9x]+-\d{8,}$/
const COMP_ID_RE = /^comp-[A-Za-z0-9x]+-\d{8,}$/
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
  // Encerramento gracioso pedido por quem subiu o serve (app desktop, task 135): no Windows não há
  // SIGTERM tratável — o app chama POST /api/shutdown com o token da sessão.
  const onShutdown = typeof opts.onShutdown === 'function' ? opts.onShutdown : null
  const allowedHosts = new Set([...LOOPBACK, String(opts.host ?? '127.0.0.1').toLowerCase()])
  const active = new Map() // runId → { taskId, controller, done }
  const flowsActive = new Map() // flowId → { taskId, controller, done }
  const compsActive = new Map() // compId → { taskId, controller, done }
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
    const continuing = body.continue !== undefined && body.continue !== null && body.continue !== false
    if (!tool && !continuing) throw new ApiError(400, 'tool obrigatória (veja GET /api/runtimes)')
    const flags = tool ? { tool } : {}
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
    if (continuing) {
      // Conversa contínua (task 139): `continue` = true (último run com sessão) ou o id do run.
      if (body.continue !== true && (typeof body.continue !== 'string' || !RUN_ID_RE.test(body.continue))) {
        throw new ApiError(400, 'continue deve ser true ou o id de um run')
      }
      if (typeof body.message !== 'string') throw new ApiError(400, 'message obrigatória para continuar a conversa')
      return { task, flags, cont: { from: body.continue === true ? null : body.continue, message: body.message } }
    }
    // Instruções extras do humano num run novo (task 140): anexadas ao prompt e abertas na timeline.
    if (body.note !== undefined && body.note !== null) {
      if (typeof body.note !== 'string' || body.note.length > 12000) throw new ApiError(400, 'note deve ser texto (até 12000 caracteres)')
    }
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null
    // Pergunta sobre o código (modo Analisar, task 141): run só leitura.
    if (body.ask !== undefined && body.ask !== null) {
      if (typeof body.ask !== 'string' || !body.ask.trim() || body.ask.length > 12000) throw new ApiError(400, 'ask deve ser a pergunta (até 12000 caracteres)')
      if (note) throw new ApiError(400, 'use ask OU note, não os dois')
    }
    const ask = typeof body.ask === 'string' && body.ask.trim() ? body.ask.trim() : null
    return { task, flags, cont: null, note, ask }
  }

  /** Dispara o agente; resolve com o run já aberto (`running`). O run segue em segundo plano. */
  function dispatch(body) {
    const { task, flags, cont, note = null, ask = null } = flagsFrom(body)
    const db = openDb(root)
    let keepOpen = false
    try {
      let prep
      try {
        prep = cont
          ? prepareContinue(root, flags, task, db, cont)
          : ask
            ? prepareRun(root, flags, task, db, { role: 'ask', extra: `--- PERGUNTA DO HUMANO ---\n${ask}` })
            : prepareRun(root, flags, task, db, note ? { extra: `--- INSTRUÇÕES DO HUMANO ---\n${note}` } : {})
        if (note) prep.userMessage = note
        if (ask) prep.userMessage = ask
      } catch (err) {
        throw new ApiError(err.code === 'BUDGET' ? 409 : err instanceof ConversationError ? 409 : 422, err.message)
      }
      const busy = [...active.values(), ...flowsActive.values(), ...compsActive.values()].some((a) => a.taskId === prep.taskId)
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
          gates: prep.gates,
          parentRunId: prep.parentRunId ?? null,
          userMessage: prep.userMessage ?? null,
          role: prep.role ?? 'implement',
          readOnlyGuard: Boolean(prep.readOnly),
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

  /** Conversa da task (task 139): runs em ordem com mensagens, ações e continuação. */
  function conversation(task, { limit = 30 } = {}) {
    if (!task || !TASK_ARG_RE.test(task)) throw new ApiError(400, 'task obrigatória (?task=07)')
    const n = Number(limit)
    if (!Number.isInteger(n) || n < 1 || n > 200) throw new ApiError(400, `limit inválido: ${limit} (1–200)`)
    const taskId = resolveTaskId(root, task)
    return withDb((db) => ({ task: taskId, runs: conversationOf(db, taskId, { limit: n }) }))
  }

  /** Achados da revisão mais recente da task (modo Analisar, task 141). */
  function findings(task) {
    if (!task || !TASK_ARG_RE.test(task)) throw new ApiError(400, 'task obrigatória (?task=07)')
    const taskId = resolveTaskId(root, task)
    return withDb((db) => ({ task: taskId, ...taskFindings(db, taskId) }))
  }

  /** Mudanças da worktree da task × base (task 140); com `file`, o patch daquele arquivo. */
  function changes(task, file = null) {
    if (!task || !TASK_ARG_RE.test(task)) throw new ApiError(400, 'task obrigatória (?task=07)')
    const taskId = resolveTaskId(root, task)
    const wt = taskWorktree(root, taskId)
    if (!wt) throw new ApiError(404, `task sem worktree: ${taskId}`)
    if (file === null) return { task: taskId, worktree: wt.path ?? null, ...taskChanges(root, wt.dir) }
    if (typeof file !== 'string' || !file || file.length > 1024) throw new ApiError(400, 'file inválido')
    const one = filePatch(root, wt.dir, file)
    if (!one) throw new ApiError(404, `arquivo fora das mudanças da task: ${file}`)
    return { task: taskId, file: one }
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

  // ---------- fluxos (orquestração encadeada, task 122) ----------

  function flowOut(db, id) {
    const flow = getFlow(db, id)
    if (!flow) throw new ApiError(404, `fluxo não encontrado: ${id}`)
    return { flow, steps: flowSteps(db, id), running: flowsActive.has(id) }
  }

  function listFlowsApi({ task = null, limit = 30 } = {}) {
    if (task !== null && !TASK_ARG_RE.test(task)) throw new ApiError(400, `task inválida: ${task}`)
    const taskId = task ? resolveTaskId(root, task) : null
    return withDb((db) => listFlows(db, { taskId, limit: Math.min(Number(limit) || 30, 200) }).map((f) => ({ ...f, running: flowsActive.has(f.id) })))
  }

  function getFlowApi(id) {
    if (!FLOW_ID_RE.test(id)) throw new ApiError(400, `id de fluxo inválido: ${id}`)
    return withDb((db) => flowOut(db, id))
  }

  /** Executa o fluxo em segundo plano no processo do serve (um banco aberto por fluxo). */
  function driveFlow(flowId, taskId) {
    const db = openDb(root)
    const controller = new AbortController()
    const plan = getFlow(db, flowId).plan
    const entry = { taskId, controller, done: null }
    entry.done = runFlow({
      db,
      flowId,
      env,
      signal: controller.signal,
      prepare: (role, agent, extra) => prepareRun(root, stepFlagsOf(plan, agent), taskId, db, { role, extra }),
      worktree: (t) => taskWorktree(root, t)
    })
      .catch(() => null)
      .finally(() => {
        flowsActive.delete(flowId)
        try {
          db.close()
        } catch {}
      })
    flowsActive.set(flowId, entry)
  }

  function stepFlagsOf(plan, agent) {
    const flags = { tool: agent.tool }
    if (agent.model) flags.model = agent.model
    if (plan.unsafe) flags.unsafe = true
    if (plan.ignoreBudget) flags['ignore-budget'] = true
    if (plan.noContext) flags['no-context'] = true
    return flags
  }

  function taskBusy(db, taskId) {
    if ([...active.values()].some((a) => a.taskId === taskId)) return true
    if ([...flowsActive.values()].some((a) => a.taskId === taskId)) return true
    if ([...compsActive.values()].some((a) => a.taskId === taskId)) return true
    const last = latestRun(db, taskId)
    return last?.status === 'running' && pidAlive(last.pid)
  }

  function startFlowApi(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'body deve ser um objeto JSON')
    const task = body.task === undefined || body.task === null ? '' : String(body.task)
    if (!TASK_ARG_RE.test(task)) throw new ApiError(400, 'task obrigatória')
    for (const k of ['unsafe', 'ignoreBudget', 'noContext']) {
      if (body[k] !== undefined && typeof body[k] !== 'boolean') throw new ApiError(400, `${k} deve ser true/false`)
    }
    if (body.unsafe && !allowUnsafe) throw new ApiError(403, 'unsafe desativado neste serve — suba com: harness serve --allow-unsafe')
    let plan
    try {
      plan = {
        implement: parseAgentSpec(body.implement, 'implement'),
        review: parseAgentSpec(body.review, 'review'),
        fix: body.fix ? parseAgentSpec(body.fix, 'fix') : null,
        unsafe: Boolean(body.unsafe),
        ignoreBudget: Boolean(body.ignoreBudget),
        noContext: Boolean(body.noContext)
      }
    } catch (err) {
      throw new ApiError(400, err.message)
    }
    const rounds = body.rounds === undefined || body.rounds === null ? 2 : body.rounds
    const approve = body.approve ?? 'none'
    if (!APPROVE_MODES.includes(approve)) throw new ApiError(400, `approve inválido: ${approve}`)
    for (const role of ['implement', 'review', 'fix']) {
      const agent = plan[role] ?? plan.implement
      try {
        resolveRunOptions(stepFlagsOf(plan, agent), agent.tool)
      } catch (err) {
        throw new ApiError(422, `${role} (${agent.tool}): ${err.message}`)
      }
    }
    return withDb((db) => {
      let taskId
      try {
        taskId = resolveTaskName(activeDir(root), task)
      } catch {
        throw new ApiError(422, `task não está ativa: ${task}`)
      }
      if (!taskWorktree(root, taskId)) throw new ApiError(422, `task sem worktree: ${taskId} — rode: harness worktree start ${task}`)
      if (taskBusy(db, taskId)) throw new ApiError(409, `já há um run ou fluxo em andamento para ${taskId}`)
      let flow
      try {
        flow = createFlow(db, { taskId, plan, rounds, approve })
      } catch (err) {
        throw new ApiError(err instanceof FlowError && /fluxo aberto/.test(err.message) ? 409 : 400, err.message)
      }
      driveFlow(flow.id, taskId)
      return flowOut(db, flow.id)
    })
  }

  function resumeFlowApi(id, body = {}) {
    if (!FLOW_ID_RE.test(id)) throw new ApiError(400, `id de fluxo inválido: ${id}`)
    if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') throw new ApiError(400, 'note deve ser texto')
    return withDb((db) => {
      const flow = getFlow(db, id)
      if (!flow) throw new ApiError(404, `fluxo não encontrado: ${id}`)
      if (flowsActive.has(id)) throw new ApiError(409, 'fluxo já está rodando')
      if (taskBusy(db, flow.task_id)) throw new ApiError(409, `já há um run em andamento para ${flow.task_id}`)
      try {
        resumeFlow(db, id, { note: body.note ?? null })
      } catch (err) {
        throw new ApiError(409, err.message)
      }
      driveFlow(id, flow.task_id)
      return flowOut(db, id)
    })
  }

  function stopFlowApi(id) {
    if (!FLOW_ID_RE.test(id)) throw new ApiError(400, `id de fluxo inválido: ${id}`)
    const own = flowsActive.get(id)
    if (own) own.controller.abort()
    return withDb((db) => {
      if (!getFlow(db, id)) throw new ApiError(404, `fluxo não encontrado: ${id}`)
      try {
        const res = stopFlow(db, id, { stopRun: own ? null : stopRun })
        return { ok: true, flow: res.flow }
      } catch (err) {
        if (own) return { ok: true, flow: getFlow(db, id) }
        throw new ApiError(409, err.message)
      }
    })
  }

  // ---------- execução competitiva (task 125) ----------

  function compOut(db, id) {
    const competition = getCompetition(db, id)
    if (!competition) throw new ApiError(404, `competição não encontrada: ${id}`)
    const list = compCandidates(db, id).map((c) => {
      const run = c.run_id ? getRun(db, c.run_id) : null
      return { ...c, run: run ? publicRun(run) : null }
    })
    return { competition, competitors: list, running: compsActive.has(id) }
  }

  function listCompsApi({ task = null } = {}) {
    if (task !== null && !TASK_ARG_RE.test(task)) throw new ApiError(400, `task inválida: ${task}`)
    const taskId = task ? resolveTaskId(root, task) : null
    return withDb((db) => listCompetitions(db, { taskId }).map((c) => ({ ...c, running: compsActive.has(c.id) })))
  }

  function getCompApi(id) {
    if (!COMP_ID_RE.test(id)) throw new ApiError(400, `id de competição inválido: ${id}`)
    return withDb((db) => compOut(db, id))
  }

  function startCompApi(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'body deve ser um objeto JSON')
    const task = body.task === undefined || body.task === null ? '' : String(body.task)
    if (!TASK_ARG_RE.test(task)) throw new ApiError(400, 'task obrigatória')
    for (const k of ['unsafe', 'ignoreBudget', 'noContext']) {
      if (body[k] !== undefined && typeof body[k] !== 'boolean') throw new ApiError(400, `${k} deve ser true/false`)
    }
    if (body.unsafe && !allowUnsafe) throw new ApiError(403, 'unsafe desativado neste serve — suba com: harness serve --allow-unsafe')
    const plan = { unsafe: Boolean(body.unsafe), ignoreBudget: Boolean(body.ignoreBudget), noContext: Boolean(body.noContext) }
    let candidates
    let judge = null
    try {
      candidates = parseCompetitors(Array.isArray(body.tools) ? body.tools.join(',') : body.tools)
      if (body.judge) judge = parseAgentSpec(body.judge, 'judge')
    } catch (err) {
      throw new ApiError(400, err.message)
    }
    for (const agent of [...candidates, ...(judge ? [judge] : [])]) {
      try {
        resolveRunOptions(stepFlagsOf(plan, agent), agent.tool)
      } catch (err) {
        throw new ApiError(422, `${agent.key ?? 'juiz'} (${agent.tool}): ${err.message}`)
      }
    }
    const max = body.maxParallel === undefined || body.maxParallel === null ? candidates.length : body.maxParallel
    if (!Number.isInteger(max) || max < 1) throw new ApiError(400, 'maxParallel deve ser inteiro >= 1')
    return withDb((db) => {
      let taskId
      try {
        taskId = resolveTaskName(activeDir(root), task)
      } catch {
        throw new ApiError(422, `task não está ativa: ${task}`)
      }
      const wt = taskWorktree(root, taskId)
      if (!wt) throw new ApiError(422, `task sem worktree: ${taskId} — rode: harness worktree start ${task}`)
      if (taskBusy(db, taskId) || [...compsActive.values()].some((a) => a.taskId === taskId)) throw new ApiError(409, `já há um run, fluxo ou competição em andamento para ${taskId}`)
      let comp
      try {
        comp = createCompetition(root, db, { taskId, taskWt: wt, candidates, plan, judge })
      } catch (err) {
        throw new ApiError(err instanceof CompetitionError ? 409 : 500, err.message)
      }
      const task0 = parseTask(path.join(activeDir(root), taskId))
      const cdb = openDb(root)
      const controller = new AbortController()
      const entry = { taskId, controller, done: null }
      entry.done = runCompetition({
        root,
        db: cdb,
        id: comp.id,
        taskWt: wt,
        scope: task0.scope,
        baseline: parseBaseline(task0),
        max,
        env,
        signal: controller.signal,
        prepare: (agent, candidateWt, role, extra) => prepareRun(root, stepFlagsOf(plan, agent), taskId, cdb, { role, extra, wt: candidateWt })
      })
        .catch(() => null)
        .finally(() => {
          compsActive.delete(comp.id)
          try {
            cdb.close()
          } catch {}
        })
      compsActive.set(comp.id, entry)
      return compOut(db, comp.id)
    })
  }

  function pickCompApi(id, body = {}) {
    if (!COMP_ID_RE.test(id)) throw new ApiError(400, `id de competição inválido: ${id}`)
    if (typeof body.key !== 'string' || !body.key) throw new ApiError(400, 'key obrigatória (chave da candidata)')
    if (compsActive.has(id)) throw new ApiError(409, 'competição ainda rodando')
    return withDb((db) => {
      const comp = getCompetition(db, id)
      if (!comp) throw new ApiError(404, `competição não encontrada: ${id}`)
      const wt = taskWorktree(root, comp.task_id)
      if (!wt) throw new ApiError(409, `a worktree da task ${comp.task_id} não existe mais`)
      try {
        pickCompetitor(root, db, id, body.key, wt)
      } catch (err) {
        throw new ApiError(409, err.message)
      }
      return compOut(db, id)
    })
  }

  async function discardCompApi(id) {
    if (!COMP_ID_RE.test(id)) throw new ApiError(400, `id de competição inválido: ${id}`)
    const own = compsActive.get(id)
    if (own) {
      own.controller.abort()
      await own.done
    }
    return withDb((db) => {
      if (!getCompetition(db, id)) throw new ApiError(404, `competição não encontrada: ${id}`)
      try {
        discardCompetition(root, db, id)
      } catch (err) {
        throw new ApiError(409, err.message)
      }
      return compOut(db, id)
    })
  }

  function compSettled(id) {
    return compsActive.get(id)?.done ?? Promise.resolve(null)
  }

  function flowSettled(id) {
    return flowsActive.get(id)?.done ?? Promise.resolve(null)
  }

  /** Espera o fim de um run disparado por este serve (testes e encerramento). */
  function settled(id) {
    return active.get(id)?.done ?? Promise.resolve(null)
  }

  /** Encerramento do serve: interrompe os runs em andamento e espera fecharem. */
  async function stopAll() {
    const pending = [...active.values(), ...flowsActive.values(), ...compsActive.values()]
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
    if (!/^\/api\/(runtimes|runs|flows|competitions|shutdown|conversation|changes|findings)(\/|$)/.test(p)) return false
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
      if (req.method === 'GET' && p === '/api/findings') {
        return send(res, 200, { ok: true, ...findings(q.get('task')) })
      }
      if (req.method === 'GET' && p === '/api/changes') {
        return send(res, 200, { ok: true, ...changes(q.get('task'), q.has('file') ? q.get('file') : null) })
      }
      if (req.method === 'GET' && p === '/api/conversation') {
        return send(res, 200, { ok: true, ...conversation(q.get('task'), { limit: q.get('limit') ?? 30 }) })
      }
      if (req.method === 'GET' && p === '/api/flows') return send(res, 200, { ok: true, flows: listFlowsApi({ task: q.get('task'), limit: q.get('limit') ?? 30 }) })
      if (req.method === 'POST' && p === '/api/flows') {
        checkWrite(req)
        return send(res, 202, { ok: true, ...startFlowApi(await readJson(req)) })
      }
      const flowAct = p.match(/^\/api\/flows\/([^/]+)\/(resume|stop)$/)
      if (req.method === 'POST' && flowAct) {
        checkWrite(req)
        const id = decodeURIComponent(flowAct[1])
        if (flowAct[2] === 'stop') return send(res, 200, stopFlowApi(id))
        return send(res, 202, { ok: true, ...resumeFlowApi(id, await readJson(req)) })
      }
      const flowGet = p.match(/^\/api\/flows\/([^/]+)$/)
      if (req.method === 'GET' && flowGet) return send(res, 200, { ok: true, ...getFlowApi(decodeURIComponent(flowGet[1])) })
      if (req.method === 'POST' && p === '/api/shutdown') {
        checkWrite(req)
        if (!onShutdown) throw new ApiError(404, 'encerramento remoto indisponível neste servidor')
        send(res, 202, { ok: true, stopping: true })
        setImmediate(() => onShutdown())
        return
      }
      if (req.method === 'GET' && p === '/api/competitions') return send(res, 200, { ok: true, competitions: listCompsApi({ task: q.get('task') }) })
      if (req.method === 'POST' && p === '/api/competitions') {
        checkWrite(req)
        return send(res, 202, { ok: true, ...startCompApi(await readJson(req)) })
      }
      const compAct = p.match(/^\/api\/competitions\/([^/]+)\/(pick|discard)$/)
      if (req.method === 'POST' && compAct) {
        checkWrite(req)
        const id = decodeURIComponent(compAct[1])
        if (compAct[2] === 'discard') return send(res, 200, { ok: true, ...(await discardCompApi(id)) })
        return send(res, 200, { ok: true, ...pickCompApi(id, await readJson(req)) })
      }
      const compGet = p.match(/^\/api\/competitions\/([^/]+)$/)
      if (req.method === 'GET' && compGet) return send(res, 200, { ok: true, ...getCompApi(decodeURIComponent(compGet[1])) })
      throw new ApiError(404, 'rota não encontrada')
    }
    exec().catch((err) => send(res, err instanceof ApiError ? err.status : 500, { ok: false, error: err.message }))
    return true
  }

  return { token, allowUnsafe, runtimes, list, get, dispatch, conversation, changes, findings, stop, settled, stopAll, handle, active, flowSettled, flowsActive, compSettled, compsActive }
}
