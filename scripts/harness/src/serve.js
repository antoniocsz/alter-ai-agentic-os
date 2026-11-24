// `harness serve` (task 86 — feature rotinas, AC-4/AC-5/AC-6): UM processo
// zero-deps que preside (1) o servidor HTTP do kanban (serveBoard: board +
// /api/canvas + /canvas), (2) o agendador das rotinas (startScheduler: tick
// dispara fireRoutine no horário) e (3) o receiver de webhook
// POST /webhook/routines/:id?token= com token persistido em .harness/webhook-token.
// A rotina nunca executa código por conta própria: só cria tasks na queue
// (guard rail da feature — a execução contínua é o pipeline, sob humano).
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { DB_DIR, tryOpenDb } from './lib/db.js'
import { lockStatus } from './lib/lock.js'
import { parseArgs, flagString, flagBool } from './lib/flags.js'
import { createRunsApi } from './lib/runs-api.js'
import { ctxFromRoot, serveBoard } from './kanban.js'
import {
  DEFAULT_TICK_MS,
  fireRoutine,
  loadRoutines,
  nextRun,
  recordRoutineEvent,
  startScheduler
} from './routines.js'

export const WEBHOOK_TOKEN_FILE = 'webhook-token'
export const SERVE_FILE = 'serve.json'

/** `.harness/serve.json` — descoberta da API local (api-local, AC-5): url, pid, token da sessão. */
export function serveFile(root) {
  return path.join(root, DB_DIR, SERVE_FILE)
}

function writeServeFile(root, info) {
  const file = serveFile(root)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(info, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
}

/** Remove o serve.json só se for DESTE processo (outro serve pode ter assumido o arquivo). */
function removeServeFile(root, pid = process.pid) {
  const file = serveFile(root)
  try {
    if (JSON.parse(fs.readFileSync(file, 'utf8')).pid === pid) fs.rmSync(file)
  } catch {}
}

/** Digest de 32B: timingSafeEqual ignora diferenças de tamanho entre os buffers. */
const digest = (value) => createHash('sha256').update(String(value ?? '')).digest()

/** Comparação de token em tempo constante (depende de .harness/webhook-token). */
export function tokensMatch(provided, expected) {
  return timingSafeEqual(digest(provided), digest(expected))
}

export function webhookTokenFile(root) {
  return path.join(root, DB_DIR, WEBHOOK_TOKEN_FILE)
}

/**
 * Token do webhook: `crypto.randomUUID` gerado na 1ª execução e persistido em
 * `.harness/webhook-token` (gitignored, junto do banco). Execuções seguintes
 * REUSAM o valor (created: false). Arquivo ausente/vazio é (re)gerado.
 */
export function readOrCreateWebhookToken(root) {
  const file = webhookTokenFile(root)
  let existing = null
  try {
    existing = fs.readFileSync(file, 'utf8').trim()
  } catch {}
  if (existing) return { token: existing, created: false, file }
  const token = randomUUID()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${token}\n`, { encoding: 'utf8', mode: 0o600 })
  return { token, created: true, file }
}

/**
 * API das rotinas para o processo serve: snapshot do payload do painel
 * ([{id, title, every, nextRun, lastRun, fireCount}]), fire único (webhook OU
 * agenda) atualizando o estado em memória (com backfill do banco na 1ª leitura),
 * checkToken em tempo constante e record dos eventos de webhook no banco via os
 * MESMOS helpers de interações da task 82 (kind `system`).
 */
export function createRoutinesApi(root, opts = {}) {
  const clock = opts.clock ?? (() => new Date())
  const nextAt = opts.nextAt ?? (() => null)
  const token = opts.token ?? readOrCreateWebhookToken(root).token
  const state = new Map() // id → { lastRun: ISO | null, fireCount: number }
  let hydrated = false

  /** Backfill do banco (1ª leitura): semeia ids ausentes do estado em memória —
   *  ids já disparados nesta instância vencem (memória é o valor ao vivo). */
  function hydrate() {
    if (hydrated) return
    hydrated = true
    const db = tryOpenDb(root)
    if (!db) return
    try {
      const rows = db
        .prepare("SELECT meta_json, content, at FROM interactions WHERE source = 'routines' ORDER BY at")
        .all()
      const tally = new Map() // id → { lastRun, fireCount } acumulados do histórico
      for (const row of rows) {
        const id = String(row.meta_json ?? '').match(/"routine":"([a-z0-9-]+)"/)?.[1]
        if (!id || !/routine_fired|routine_skipped/.test(row.content ?? '')) continue
        const s = tally.get(id) ?? { lastRun: null, fireCount: 0 }
        s.lastRun = row.at
        s.fireCount += 1
        tally.set(id, s)
      }
      for (const [id, s] of tally) {
        if (!state.has(id)) state.set(id, s)
      }
    } catch {} finally {
      try {
        db.close()
      } catch {}
    }
  }

  function snapshot() {
    hydrate()
    return loadRoutines(root).routines.map((r) => {
      const s = state.get(r.id)
      const at = nextAt(r.id) ?? nextRun(r.every, clock())
      return {
        id: r.id,
        title: r.task.description,
        every: r.every,
        nextRun: at ? at.toISOString() : null,
        lastRun: s?.lastRun ?? null,
        fireCount: s?.fireCount ?? 0
      }
    })
  }

  function fire(id) {
    const result = fireRoutine(id, root)
    if (result.ok) {
      const s = state.get(id) ?? { lastRun: null, fireCount: 0 }
      s.lastRun = clock().toISOString()
      s.fireCount += 1
      state.set(id, s)
    }
    return result
  }

  const checkToken = (provided) => tokensMatch(provided, token)

  function record(event, routineId, message) {
    recordRoutineEvent(root, `routine:${routineId}`, event, routineId, message)
  }

  return { snapshot, fire, checkToken, record }
}

/** O lock do pipeline não pode ficar órfão ao encerrar: se ESTE processo o
 *  tiver (ex.: encerramento no meio de um move), remove o arquivo. Lock de
 *  outro processo fica intocado. */
function releaseOwnLock(root) {
  const status = lockStatus(root)
  if (status.locked && status.info?.pid === process.pid) {
    try {
      fs.rmSync(path.join(root, status.file))
    } catch {}
  }
}

/**
 * Sobe o processo completo de `harness serve` num chamador explícito (root,
 * port, host, tickMs e clock injetáveis para os testes). O servidor reusa
 * serveBoard (kanban + canvas + webhook + /api/routines numa só instância).
 */
export function buildServe(opts = {}) {
  const root = opts.root ?? process.cwd()
  const port = opts.port ?? 4310
  const host = opts.host ?? '127.0.0.1'
  const clock = opts.clock ?? (() => new Date())
  const tickMs = opts.tickMs ?? DEFAULT_TICK_MS

  const { token, created: tokenCreated, file: tokenFile } = readOrCreateWebhookToken(root)

  let scheduler = null
  const api = createRoutinesApi(root, {
    clock,
    token,
    nextAt: (id) => scheduler?.nextRunAt(id) ?? null
  })
  scheduler = startScheduler(root, { tickMs, clock, onDue: (routine) => api.fire(routine.id) })

  // API local de execuções (api-local, task 115): token novo a cada start da sessão.
  const sessionToken = randomUUID()
  const runs = createRunsApi(root, { env: opts.env, token: sessionToken, allowUnsafe: opts.allowUnsafe, host })

  const server = serveBoard(ctxFromRoot(root), port, host, { routines: api, runs })
  scheduler.tick() // aquece o plano: payload do painel já mostra a 1ª execução real
  server.once('listening', () => {
    const actual = server.address()?.port ?? port
    const shown = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
    writeServeFile(root, {
      url: `http://${shown}:${actual}`,
      pid: process.pid,
      token: sessionToken,
      allow_unsafe: Boolean(opts.allowUnsafe),
      started_at: new Date().toISOString()
    })
  })

  async function stop() {
    scheduler.stop()
    await runs.stopAll()
    await new Promise((resolve) => {
      server.closeIdleConnections?.()
      const force = setTimeout(() => server.closeAllConnections?.(), 3_000)
      force.unref?.()
      server.close(() => {
        clearTimeout(force)
        resolve()
      })
    })
    releaseOwnLock(root)
    removeServeFile(root)
  }

  return { server, api, runs, scheduler, stop, root, tokenFile, tokenCreated, sessionToken }
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

function normalizePort(raw, fallback = 4310) {
  const port = raw == null ? fallback : Number(raw)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(
      `porta inválida: ${JSON.stringify(raw)} (uso: harness serve [--port <n>] [--host <h>], 0 = porta efêmera)`
    )
  }
  return port
}

/**
 * CLI `harness serve [--port n] [--host h]`: kanban + agendador + webhook num
 * único processo. Bind em 127.0.0.1 por padrão; `--host` explícito fora do
 * loopback imprime WARNING de exposição. SIGINT/SIGTERM encerram com graça:
 * timers limpados, servidor fechado (drena conexões) e lock do pipeline solto.
 */
export function serve(args = [], opts = {}) {
  const { flags } = parseArgs(args)
  const root = opts.cwd ?? process.cwd()
  const port = normalizePort(flagString(flags, 'port'))
  const host = flagString(flags, 'host', '') || '127.0.0.1'
  const allowUnsafe = flagBool(flags, 'allow-unsafe')

  if (!LOOPBACK_HOSTS.has(host.toLowerCase())) {
    process.stdout.write(
      `⚠️  --host ${host}: board, API e webhook ficam acessíveis pela rede.\n` +
        `   o token (.harness/webhook-token) é o único segredo de acesso — prefira 127.0.0.1.\n`
    )
  }

  const handles = buildServe({ root, port, host, tickMs: opts.tickMs, clock: opts.clock, allowUnsafe })

  const { routines, errors } = loadRoutines(root)
  const token = handles.tokenCreated ? 'gerado e salvo' : 'reusado'
  process.stdout.write(
    `🚀 harness serve — kanban + rotinas + webhook em um processo\n` +
      `   webhook:  POST /webhook/routines/<id>?token=<t> — token ${token} em ${handles.tokenFile}\n` +
      `   rotinas:  ${routines.length} agendada(s), tick a cada ${Math.round(handles.scheduler.tickMs / 1000)}s` +
      `${errors.length ? ` (${errors.length} ignorada(s) por schema)` : ''}\n` +
      `   API:      /api/runs (disparar/parar agentes) — token da sessão em ${path.relative(root, serveFile(root))}` +
      `${allowUnsafe ? ' · ⚠️ --allow-unsafe: o painel pode rodar agentes sem pedir permissões' : ''}\n` +
      `   Ctrl+C encerra com graça (limpa timers e fecha o servidor)\n`
  )

  if (opts.signals !== false) {
    const shutdown = (signal) => {
      process.stdout.write(`\nencerrando (${signal}) — limpando timers e fechando o servidor…\n`)
      handles
        .stop()
        .then(() => process.exit(0))
        .catch((err) => {
          process.stderr.write(`erro ao encerrar: ${err.message}\n`)
          process.exit(1)
        })
    }
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, shutdown)
  }

  return handles
}
