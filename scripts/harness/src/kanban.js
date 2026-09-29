import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { openDb, boardQuery, taskDetails, resolveTaskId, syncFromMarkdown } from './lib/db.js'
import { startTask, finishTask, requeueTask, reopenTask } from './lib/pipeline.js'
import { taskLocation, queueDir, activeDir, doneDir } from './lib/tasks.js'
import { templatesDir } from './lib/paths.js'
import { readWipConfig } from './lib/workspace.js'

const DEFAULT_PORT = 4310
const VALID_MOVES = { queue: ['active'], active: ['queue', 'done'], done: ['active'] }

/**
 * Contexto do board: projeto único ({ kind: 'project', root }) ou
 * workspace ({ kind: 'workspace', projects: [{name, root, wip}] }).
 */
function ctxFromCwd() {
  const root = process.cwd()
  return {
    kind: 'project',
    projects: [{ name: '', root, wip: readWipConfig(root) }],
    title: 'AlterAI - Agentic OS — Tasks'
  }
}

export async function kanban(args) {
  return kanbanFor(ctxFromCwd(), args)
}

export async function kanbanFor(ctx, args) {
  const serveIdx = args.indexOf('--serve')
  if (serveIdx !== -1) {
    const raw = args[serveIdx + 1]
    const port = raw && !raw.startsWith('--') ? Number(raw) : DEFAULT_PORT
    return serveBoard(ctx, port)
  }
  const outIdx = args.indexOf('--out')
  const outFile = outIdx !== -1 ? args[outIdx + 1] : 'kanban.html'
  renderStatic(ctx, outFile)
}

export function buildBoard(ctx) {
  const cols = { queue: [], active: [], done: [] }
  const wip = {}
  for (const proj of ctx.projects) {
    const db = openDb(proj.root)
    try {
      // markdown é a fonte da verdade — garante o board atualizado mesmo sem `harness sync`
      syncFromMarkdown(db, proj.root)
      const board = boardQuery(db)
      for (const status of ['queue', 'active', 'done']) {
        for (const t of board[status]) {
          cols[status].push({ ...t, project: proj.name || null })
        }
      }
      wip[proj.name || ''] = proj.wip ?? { queue: null, active: null }
    } finally {
      db.close()
    }
  }
  return { ...cols, wip }
}

/**
 * Verifica limite de WIP para mover um card para a coluna `to` de `project`.
 * Retorna null (ok) ou mensagem de bloqueio.
 */
export function wipViolation(board, project, to, wip) {
  const limit = wip?.[to] ?? null
  if (!limit) return null
  const current = (board[to] || []).filter((t) => (t.project || '') === (project || '')).length
  if (current >= limit) {
    return `WIP limit atingido: ${to} já tem ${current}/${limit} (projeto ${project || 'projeto'}).`
  }
  return null
}

export function projectRoot(ctx, project) {
  if (!project) return ctx.projects[0].root
  const found = ctx.projects.find((p) => p.name === project)
  if (!found) throw new Error(`projeto desconhecido: ${project}`)
  return found.root
}

export function renderPage(board, title = 'AlterAI - Agentic OS — Tasks') {
  const tpl = fs.readFileSync(path.join(templatesDir(), 'kanban', 'board.html'), 'utf8')
  return tpl
    .replace('__BOARD_TITLE__', title.replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    .replace('__BOARD_DATA__', JSON.stringify(board))
}

function renderStatic(ctx, outFile) {
  const board = buildBoard(ctx)
  // modo estático: embute o markdown de cada task para o modal de detalhes funcionar sem servidor
  for (const status of ['queue', 'active', 'done']) {
    for (const t of board[status]) {
      t.file = readTaskFile(ctx, t.project, t.id)
    }
  }
  const dest = path.isAbsolute(outFile) ? outFile : path.join(process.cwd(), outFile)
  fs.writeFileSync(dest, renderPage(board, ctx.title))
  process.stdout.write(
    `✅ kanban gerado em ${dest}\n` +
      `   (modo estático: sem drag&drop. Para mover tasks: pnpm harness kanban --serve)\n`
  )
}

export function readTaskFile(ctx, project, id) {
  const root = projectRoot(ctx, project)
  const status = taskLocation(root, id)
  if (!status) return ''
  const dir = status === 'queue' ? queueDir(root) : status === 'active' ? activeDir(root) : doneDir(root)
  try {
    return fs.readFileSync(path.join(dir, id), 'utf8')
  } catch {
    return ''
  }
}

export function serveBoard(ctx, port) {
  const page = renderPage(null, ctx.title)
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
    const pathname = url.pathname

    if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      return res.end(page)
    }

    if (req.method === 'GET' && pathname === '/api/board') {
      return json(res, 200, { ok: true, board: buildBoard(ctx) })
    }

    const detail = pathname.match(/^\/api\/tasks\/([^/]+)\/detail$/)
    if (req.method === 'GET' && detail) {
      const id = decodeURIComponent(detail[1])
      const project = url.searchParams.get('project') ?? ''
      return handleDetail(res, ctx, id, project)
    }

    const move = pathname.match(/^\/api\/tasks\/([^/]+)\/move$/)
    if (req.method === 'POST' && move) {
      const id = decodeURIComponent(move[1])
      return handleMove(req, res, ctx, id)
    }

    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'não encontrado' }))
  })

  server.listen(port, () => {
    const actual = server.address()?.port ?? port
    process.stdout.write(
      `📋 kanban em http://localhost:${actual}\n` +
        `   drag&drop move tasks (valida escopo). Clique num card para ver o detalhamento. Ctrl+C para parar.\n`
    )
  })
  return server
}

async function handleMove(req, res, ctx, id) {
  let body = ''
  for await (const chunk of req) body += chunk
  let to
  try {
    to = JSON.parse(body || '{}').to
  } catch {
    return json(res, 400, { ok: false, error: 'body inválido — envie {"to":"active|queue|done"}' })
  }
  const project = (JSON.parse(body || '{}').project ?? '') || ''

  let root
  try {
    root = projectRoot(ctx, project)
  } catch (err) {
    return json(res, 400, { ok: false, error: err.message })
  }

  const from = taskLocation(root, id)
  if (!from) return json(res, 404, { ok: false, error: `task não encontrada: ${id}` })
  if (!VALID_MOVES[from]?.includes(to)) {
    return json(res, 400, { ok: false, error: `movimento inválido: ${from} → ${to}` })
  }

  // A1: WIP limit por projeto/coluna (config .harness/kanban.json)
  const projCfg = ctx.projects.find((p) => p.root === root)
  if (projCfg?.wip) {
    const board = buildBoard(ctx)
    const violation = wipViolation(board, project, to, projCfg.wip)
    if (violation) return json(res, 400, { ok: false, error: violation })
  }

  const res2 =
    to === 'active' && from === 'queue'
      ? startTask(root, id)
      : to === 'done'
        ? finishTask(root, id)
        : to === 'queue'
          ? requeueTask(root, id)
          : reopenTask(root, id)

  if (!res2.ok) return json(res, 400, { ok: false, error: res2.error })
  return json(res, 200, { ok: true })
}

function handleDetail(res, ctx, id, project) {
  let root
  try {
    root = projectRoot(ctx, project)
  } catch (err) {
    return json(res, 400, { ok: false, error: err.message })
  }
  let resolved
  try {
    resolved = resolveTaskId(root, id)
  } catch (err) {
    return json(res, 400, { ok: false, error: err.message })
  }
  const db = openDb(root)
  try {
    syncFromMarkdown(db, root)
    const details = taskDetails(db, resolved)
    if (!details) return json(res, 404, { ok: false, error: `task não encontrada: ${id}` })
    return json(res, 200, {
      ok: true,
      task: details.task,
      file: readTaskFile(ctx, project, resolved),
      events: details.events,
      interactions: details.interactions
    })
  } finally {
    db.close()
  }
}

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}