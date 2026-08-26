import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { openDb, boardQuery } from './lib/db.js'
import { startTask, finishTask, requeueTask, reopenTask } from './lib/pipeline.js'
import { taskLocation } from './lib/tasks.js'
import { templatesDir } from './lib/paths.js'

const DEFAULT_PORT = 4310
const VALID_MOVES = { queue: ['active'], active: ['queue', 'done'], done: ['active'] }

export async function kanban(args) {
  const root = process.cwd()
  const serveIdx = args.indexOf('--serve')

  if (serveIdx !== -1) {
    const raw = args[serveIdx + 1]
    const port = raw && !raw.startsWith('--') ? Number(raw) : DEFAULT_PORT
    return serve(root, port)
  }

  const outIdx = args.indexOf('--out')
  const outFile = outIdx !== -1 ? args[outIdx + 1] : 'kanban.html'
  const db = openDb(root)
  fs.writeFileSync(path.join(root, outFile), renderPage(boardQuery(db)))
  process.stdout.write(
    `✅ kanban gerado em ${path.join(root, outFile)}\n` +
      `   (modo estático: sem drag&drop. Para mover tasks: pnpm harness kanban --serve)\n`
  )
}

export function renderPage(board) {
  const tpl = fs.readFileSync(path.join(templatesDir(), 'kanban', 'board.html'), 'utf8')
  return tpl.replace('__BOARD_DATA__', JSON.stringify(board))
}

function serve(root, port) {
  const page = renderPage(null)
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
    const pathname = url.pathname

    if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      return res.end(page)
    }

    if (req.method === 'GET' && pathname === '/api/board') {
      const db = openDb(root)
      return json(res, 200, { ok: true, board: boardQuery(db) })
    }

    const move = pathname.match(/^\/api\/tasks\/([^/]+)\/move$/)
    if (req.method === 'POST' && move) {
      const id = decodeURIComponent(move[1])
      return handleMove(req, res, root, id)
    }

    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'não encontrado' }))
  })

  server.listen(port, () => {
    process.stdout.write(
      `📋 kanban em http://localhost:${port}\n` +
        `   drag&drop move tasks (valida escopo). Ctrl+C para parar.\n`
    )
  })
}

async function handleMove(req, res, root, id) {
  let body = ''
  for await (const chunk of req) body += chunk
  let to
  try {
    to = JSON.parse(body || '{}').to
  } catch {
    return json(res, 400, { ok: false, error: 'body inválido — envie {"to":"active|queue|done"}' })
  }

  const from = taskLocation(root, id)
  if (!from) return json(res, 404, { ok: false, error: `task não encontrada: ${id}` })
  if (!VALID_MOVES[from]?.includes(to)) {
    return json(res, 400, { ok: false, error: `movimento inválido: ${from} → ${to}` })
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

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}