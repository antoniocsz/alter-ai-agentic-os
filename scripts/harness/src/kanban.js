import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { openDb, boardQuery, taskDetails, resolveTaskId, syncFromMarkdown } from './lib/db.js'
import { canvasState } from './lib/canvas.js'
import { startTask, finishTask, requeueTask, reopenTask } from './lib/pipeline.js'
import { taskLocation, queueDir, activeDir, doneDir } from './lib/tasks.js'
import { templatesDir } from './lib/paths.js'
import { readWipConfig } from './lib/workspace.js'
import { readRegistry } from './lib/worktree.js'

const DEFAULT_PORT = 4310
const VALID_MOVES = { queue: ['active'], active: ['queue', 'done'], done: ['active'] }

/** Contexto do board para uma raiz de projeto explícita (usada pelo `harness serve`). */
export function ctxFromRoot(root) {
  return {
    kind: 'project',
    projects: [{ name: '', root, wip: readWipConfig(root) }],
    title: 'AlterAI - Agentic OS — Tasks'
  }
}

function ctxFromCwd() {
  return ctxFromRoot(process.cwd())
}

export async function kanban(args) {
  return kanbanFor(ctxFromCwd(), args)
}

export async function kanbanFor(ctx, args) {
  const serveIdx = args.indexOf('--serve')
  if (serveIdx !== -1) {
    const raw = args[serveIdx + 1]
    const port = raw && !raw.startsWith('--') ? Number(raw) : DEFAULT_PORT
    const hostIdx = args.indexOf('--host')
    const host = hostIdx !== -1 && args[hostIdx + 1] && !args[hostIdx + 1].startsWith('-')
      ? args[hostIdx + 1]
      : '127.0.0.1'
    return serveBoard(ctx, port, host)
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
      const worktrees = readRegistry(proj.root).worktrees.reduce((acc, w) => {
        acc[w.task] = w.branch
        return acc
      }, {})
      for (const status of ['queue', 'active', 'done']) {
        for (const t of board[status]) {
          cols[status].push({
            ...t,
            project: proj.name || null,
            worktree: worktrees[t.id] ?? null
          })
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

// Link board ⇄ Execução: injetado APENAS no modo serve, por string-replace no HTML
// renderizado — o template board.html fica intacto (fora do escopo da task 85).
function withCanvasLink(html) {
  const anchor = '<span class="spacer"></span>'
  if (!html.includes(anchor)) return html
  return html.replace(
    anchor,
    '<a class="mode" href="/canvas" style="color:var(--accent)">▶ vista Execução</a>' + anchor
  )
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

/**
 * Servidor do kanban (`harness kanban --serve`) e — com `extras.routines` — o
 * modo `harness serve` (task 86): a MESMA instância preside o webhook de rotinas
 * (POST /webhook/routines/:id?token=) e o payload do painel (GET /api/routines).
 * extras: { routines } — sem eles o modo kanban puro continua igual (rotas 404).
 */
export function serveBoard(ctx, port, host = '127.0.0.1', extras = {}) {
  const page = withCanvasLink(renderPage(null, ctx.title))
  const canvasPage = renderCanvasPage(ctx.title)
  const server = http.createServer((req, res) => {
    try {
      route(req, res, ctx, page, canvasPage, extras)
    } catch (err) {
      sendError(res, 500, `erro interno: ${err.message}`)
    }
  })

  server.on('error', (err) => {
    process.stderr.write(`erro no kanban: ${err.message}\n`)
    process.exitCode = 1
  })

  server.listen(port, host, () => {
    const actual = server.address()?.port ?? port
    process.stdout.write(
      `📋 kanban em http://${host}:${actual}\n` +
        `   vista Execução em http://${host}:${actual}/canvas\n` +
        `   drag&drop move tasks (valida escopo). Clique num card para ver o detalhamento. Ctrl+C para parar.\n`
    )
  })
  return server
}

const SAFE_ID_RE = /^(?:\d{2,}(?:-[^/\\]+)?\.md|\d{2,})$/

function safeDecodeId(raw) {
  let id
  try {
    id = decodeURIComponent(raw)
  } catch {
    return null
  }
  return SAFE_ID_RE.test(id) ? id : null
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

function sendError(res, status, message) {
  if (res.headersSent) return
  json(res, status, { ok: false, error: message })
}

function route(req, res, ctx, page, canvasPage, extras = {}) {
  let url
  try {
    url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
  } catch {
    return sendError(res, 400, 'url inválida')
  }
  const pathname = url.pathname

  if (req.method === 'GET' && pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    return res.end(page)
  }

  if (req.method === 'GET' && pathname === '/canvas' && canvasPage) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    return res.end(canvasPage)
  }

  if (req.method === 'GET' && pathname === '/api/board') {
    try {
      return json(res, 200, { ok: true, board: buildBoard(ctx) })
    } catch (err) {
      return sendError(res, 500, err.message)
    }
  }

  if (req.method === 'GET' && pathname === '/api/canvas') {
    try {
      return json(res, 200, { ok: true, ...canvasState(ctx) })
    } catch (err) {
      return sendError(res, 500, err.message)
    }
  }

  // Modo `harness serve` (task 86): payload do painel de rotinas e o webhook.
  const routines = extras.routines ?? null
  if (routines && req.method === 'GET' && pathname === '/api/routines') {
    try {
      return json(res, 200, { ok: true, routines: routines.snapshot() })
    } catch (err) {
      return sendError(res, 500, err.message)
    }
  }

  const webhook = req.method === 'POST' && pathname.match(/^\/webhook\/routines\/([a-z0-9][a-z0-9-]*)$/)
  if (webhook && routines) {
    return handleWebhook(res, routines, webhook[1], url, req)
  }

  const detail = pathname.match(/^\/api\/tasks\/([^/]+)\/detail$/)
  if (req.method === 'GET' && detail) {
    const id = safeDecodeId(detail[1])
    if (!id) return sendError(res, 400, 'id de task inválido')
    const project = url.searchParams.get('project') ?? ''
    return handleDetail(res, ctx, id, project)
  }

  const move = pathname.match(/^\/api\/tasks\/([^/]+)\/move$/)
  if (req.method === 'POST' && move) {
    if (!sameOrigin(req)) return sendError(res, 403, 'origem não permitida')
    const type = String(req.headers['content-type'] ?? '')
    if (!type.includes('application/json')) {
      return sendError(res, 415, 'content-type deve ser application/json')
    }
    const id = safeDecodeId(move[1])
    if (!id) return sendError(res, 400, 'id de task inválido')
    return handleMove(req, res, ctx, id)
  }

  return sendError(res, 404, 'não encontrado')
}

/**
 * POST /webhook/routines/:id?token=<t> (AC-4): 401 sem/errado token (auditado),
 * 404 rotina inexistente, 200 com o resultado ({criada} ou {skip:dedupe}).
 * O body é drenado (v1 ignora: a task vem do routines.json declarativo).
 */
async function handleWebhook(res, routines, id, url, req) {
  if (!routines.checkToken(url.searchParams.get('token'))) {
    routines.record('webhook_rejected', id, 'token ausente ou inválido')
    return json(res, 401, { ok: false, error: 'token ausente ou inválido' })
  }

  try {
    let body = ''
    for await (const chunk of req) {
      body += chunk
      if (body.length > 64 * 1024) {
        return json(res, 413, { ok: false, error: 'body muito grande' })
      }
    }
  } catch {
    return json(res, 400, { ok: false, error: 'falha ao ler body' })
  }

  routines.record('webhook_received', id, 'disparo da rotina por webhook')
  const result = routines.fire(id)
  if (!result.ok) {
    const notFound = /rotina não encontrada/.test(result.error ?? '')
    return json(res, notFound ? 404 : 500, { ok: false, error: result.error })
  }
  return json(
    res,
    200,
    result.created
      ? { ok: true, criada: result.task, num: result.num }
      : { ok: true, skip: 'dedupe', task: result.task }
  )
}

async function handleMove(req, res, ctx, id) {
  let body = ''
  try {
    for await (const chunk of req) {
      body += chunk
      if (body.length > 64 * 1024) {
        return json(res, 413, { ok: false, error: 'body muito grande' })
      }
    }
  } catch {
    return json(res, 400, { ok: false, error: 'falha ao ler body' })
  }

  let payload
  try {
    payload = JSON.parse(body || '{}')
  } catch {
    return json(res, 400, { ok: false, error: 'body inválido — envie {"to":"active|queue|done"}' })
  }
  const to = payload.to
  const project = payload.project ?? ''

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

/**
 * Vista "Execução" (/canvas) — grid de cartões ao vivo, um por task ativa.
 * v1 READ-ONLY: nenhum endpoint de write; modal chama os endpoints já existentes
 * (/api/canvas para os dados, /api/tasks/:id/detail para o histórico).
 * Estética = mesmo tema do board (tokens/estilos de templates/kanban/board.html,
 * copiado aqui porque o template não está no escopo desta task).
 */
export function renderCanvasPage(title = 'AlterAI - Agentic OS — Tasks') {
  const tt = String(title).replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${tt} — Execução</title>
<style>
  :root {
    --bg: #0f1117;
    --col: #171a21;
    --border: #262b36;
    --text: #e6e9ef;
    --muted: #8b93a5;
    --accent: #6366f1;
    --queue: #d97706;
    --active: #2563eb;
    --done: #16a34a;
    --card: #1e222c;
    --danger: #f87171;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  header {
    display: flex; align-items: center; gap: 12px; padding: 12px 20px;
    border-bottom: 1px solid var(--border); background: var(--col); flex-wrap: wrap;
  }
  header h1 { font-size: 16px; margin: 0; font-weight: 600; }
  header .mode { color: var(--muted); font-size: 12px; }
  header a { color: var(--accent); text-decoration: none; font-size: 12px; }
  header a:hover { text-decoration: underline; }
  header .spacer { flex: 1; }
  button {
    background: var(--bg); color: var(--text); border: 1px solid var(--border);
    border-radius: 8px; padding: 6px 10px; font-size: 12px; cursor: pointer;
  }
  button:hover { border-color: var(--accent); }
  .toolbar {
    display: flex; align-items: center; gap: 8px; padding: 10px 20px; flex-wrap: wrap;
    border-bottom: 1px solid var(--border); background: var(--col);
  }
  .chip {
    font-size: 11px; border-radius: 999px; padding: 3px 10px;
    border: 1px solid var(--border); background: var(--bg); color: var(--muted);
  }
  .chip.on { color: var(--text); border-color: var(--accent); }
  .chip.stale.on { border-color: var(--queue); color: var(--queue); }
  #canvas-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 14px; padding: 20px;
  }
  .card {
    background: var(--card); border: 1px solid var(--border); border-radius: 10px;
    padding: 10px 12px; cursor: pointer;
  }
  .card:hover { border-color: var(--accent); }
  /* staleness (AC-4): destaque amarelo + badge */
  .card.stale {
    background: rgba(250, 204, 21, .07);
    border-color: rgba(250, 204, 21, .5);
  }
  .card.stale:hover { border-color: rgba(250, 204, 21, .9); }
  .tag.stale-badge { color: var(--queue); border-color: var(--queue); }
  .card .title { font-size: 14px; font-weight: 600; margin: 0 0 6px; word-break: break-word; }
  .card .meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .tag {
    font-size: 11px; border-radius: 6px; padding: 2px 6px;
    background: var(--bg); color: var(--muted); border: 1px solid var(--border);
  }
  .tag.project { color: #22d3ee; }
  .card .row {
    display: flex; justify-content: space-between; gap: 8px; margin-top: 6px;
    font-size: 12px; color: var(--muted);
  }
  .card .row .val { color: var(--text); }
  .card .note {
    color: var(--muted); font-size: 12px; margin-top: 8px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .card .foot { display: flex; justify-content: space-between; color: var(--muted); font-size: 11px; margin-top: 8px; }
  .empty { color: var(--muted); font-size: 13px; text-align: center; padding: 48px 0; }
  #toast {
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: #7f1d1d; color: #fecaca; border: 1px solid #b91c1c; border-radius: 10px;
    padding: 10px 16px; max-width: 80vw; font-size: 13px; display: none; z-index: 30;
    white-space: pre-wrap;
  }
  /* modal — mesma estrutura do board (reuso do endpoints /api/tasks/:id/detail) */
  #modal {
    position: fixed; inset: 0; background: rgba(0, 0, 0, .6); display: none;
    align-items: center; justify-content: center; z-index: 20; padding: 20px;
  }
  #modal.open { display: flex; }
  .modal-box {
    background: var(--col); border: 1px solid var(--border); border-radius: 14px;
    width: min(860px, 100%); max-height: 86vh; overflow-y: auto; padding: 22px 24px;
  }
  .modal-box h2 { margin: 0 0 4px; font-size: 18px; }
  .modal-box .sub { color: var(--muted); font-size: 12px; margin-bottom: 14px; word-break: break-all; }
  .modal-box h3 {
    font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted);
    margin: 20px 0 8px; border-bottom: 1px solid var(--border); padding-bottom: 4px;
  }
  .modal-box .close {
    float: right; background: transparent; border: 1px solid var(--border);
    border-radius: 8px; color: var(--muted); font-size: 14px; padding: 2px 10px; cursor: pointer;
  }
  .scope-list { margin: 0; padding-left: 18px; font-size: 13px; }
  .scope-list li { margin: 3px 0; font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: 12px; }
  pre.file {
    background: var(--bg); border: 1px solid var(--border); border-radius: 10px;
    padding: 12px; font-size: 12px; line-height: 1.55; overflow-x: auto; white-space: pre-wrap;
    word-break: break-word; max-height: 320px; overflow-y: auto;
  }
  .timeline { list-style: none; margin: 0; padding: 0; font-size: 12px; }
  .timeline li { display: flex; gap: 10px; padding: 5px 0; border-bottom: 1px dashed var(--border); }
  .timeline .at { color: var(--muted); white-space: nowrap; font-family: ui-monospace, Consolas, monospace; }
  .timeline .ev { color: var(--accent); text-transform: uppercase; font-size: 11px; min-width: 70px; }
  .inter { list-style: none; margin: 0; padding: 0; font-size: 12px; }
  .inter li { padding: 6px 0; border-bottom: 1px dashed var(--border); }
  .inter .who { color: var(--muted); font-size: 11px; }
  .inter pre { margin: 4px 0 0; white-space: pre-wrap; word-break: break-word; font-family: inherit; }
</style>
</head>
<body>
<header>
  <h1>${tt}</h1>
  <span class="mode">vista Execução · ao vivo (auto-refresh 3s) · v1 leitura</span>
  <a href="/">← Board (kanban)</a>
  <span class="spacer"></span>
  <span class="mode" id="stamp"></span>
  <button id="refreshBtn">↻ atualizar</button>
</header>

<div class="toolbar">
  <span class="chip on" id="count">carregando…</span>
</div>

<main id="canvas-grid"></main>
<div id="toast"></div>

<div id="modal" role="dialog" aria-modal="true">
  <div class="modal-box" id="modalBox"></div>
</div>

<script>
var state = { generatedAt: null, canvas: [] };
var toast = document.getElementById('toast');
var modal = document.getElementById('modal');
var modalBox = document.getElementById('modalBox');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function fmtDate(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function relTime(iso) {
  if (!iso) return '';
  var ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) ms = 0;
  var s = Math.floor(ms / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return Math.floor(s / 60) + ' min atrás';
  if (s < 86400) return Math.floor(s / 3600) + 'h atrás';
  return Math.floor(s / 86400) + 'd atrás';
}
function fmtDur(ms) {
  if (ms == null || isNaN(ms)) return '—';
  var s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return s + 's';
  var m = Math.floor(s / 60), rs = s % 60;
  if (m < 60) return m + 'm ' + rs + 's';
  var h = Math.floor(m / 60), rm = m % 60;
  return h + 'h ' + (rm < 10 ? '0' : '') + rm + 'm';
}
function fmtFiles(n) {
  if (typeof n === 'number') return n + ' arquivo' + (n === 1 ? '' : 's');
  return 'n/d';
}
function worktreeTag(c) {
  var label;
  if (c.worktree && c.worktree !== 'raiz') {
    label = '🌳 ' + esc(c.worktree) + (c.branch ? ' · ' + esc(c.branch) : '');
  } else {
    label = '🏠 raiz' + (c.branch ? ' · ' + esc(c.branch) : '');
  }
  return '<span class="tag" title="onde a task está executando">' + label + '</span>';
}

/* ---------- cartão ao vivo ---------- */
function cardHtml(c) {
  var cls = 'card' + (c.stale ? ' stale' : '');
  var tags = '';
  if (c.project) tags += '<span class="tag project">' + esc(c.project) + '</span>';
  tags += '<span class="tag">agente: ' + esc(c.agent || '—') + '</span>';
  tags += worktreeTag(c);
  var badge = c.stale
    ? '<span class="tag stale-badge">⏳ sem nova atividade há ' + esc(relTime(c.last_activity_at)) + '</span>'
    : '';
  var note = c.last_note
    ? '<div class="note" title="' + esc(c.last_note.content) + '">💬 o agente reporta: ' + esc(c.last_note.content) + '</div>'
    : '';
  return '<div class="' + cls + '" data-id="' + esc(c.id) + '" data-project="' + esc(c.project || '') + '" title="clique para ver o histórico">' +
    '<p class="title">' + esc(c.title || c.id) + '</p>' +
    '<div class="meta">' + tags + badge + '</div>' +
    '<div class="row"><span>⏱ em execução</span><span class="val">' + esc(fmtDur(c.running_ms)) + '</span></div>' +
    '<div class="row"><span>📝 arquivos alterados</span><span class="val">' + esc(fmtFiles(c.changed_files)) + '</span></div>' +
    '<div class="row"><span>último evento</span><span class="val">' +
      (c.last_event ? esc(c.last_event.event) + ' · ' + esc(relTime(c.last_event.at)) : '—') +
    '</span></div>' +
    note +
    '<div class="foot"><span>' + esc(c.id) + '</span><span>' +
      (c.started_at ? 'desde ' + esc(fmtDate(c.started_at)) : '') +
    '</span></div>' +
  '</div>';
}

function render() {
  var grid = document.getElementById('canvas-grid');
  var cards = state.canvas;
  var count = document.getElementById('count');
  document.getElementById('stamp').textContent = state.generatedAt
    ? 'atualizado ' + relTime(state.generatedAt)
    : '';
  if (!cards.length) {
    count.textContent = '0 em execução';
    grid.innerHTML = '<div class="empty">Nada em execução agora</div>';
    return;
  }
  // stale primeiro (pedem atenção), depois id
  var staleCount = cards.filter(function (c) { return c.stale; }).length;
  count.textContent = cards.length + ' em execução' + (staleCount ? ' · ' + staleCount + ' stale' : '');
  count.className = staleCount ? 'chip on stale' : 'chip on';
  cards = cards.slice().sort(function (a, b) {
    return (b.stale === a.stale) ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : (b.stale ? 1 : -1);
  });
  grid.innerHTML = cards.map(cardHtml).join('');
  attachCardClicks();
}

/* ---------- detalhes (modal do board, mesmos endpoints) ---------- */
function attachCardClicks() {
  document.querySelectorAll('#canvas-grid .card').forEach(function (card) {
    card.addEventListener('click', function () {
      openDetail(card.dataset.id, card.dataset.project);
    });
  });
}

async function openDetail(id, project) {
  modalBox.innerHTML = '<p style="color:var(--muted)">carregando detalhes...</p>';
  modal.classList.add('open');
  try {
    var res = await fetch('/api/tasks/' + encodeURIComponent(id) + '/detail?project=' + encodeURIComponent(project));
    var data = await res.json();
    if (!data.ok) throw new Error(data.error || 'erro ao carregar');
    renderDetail(data);
  } catch (err) {
    renderDetail({ task: { id: id, title: id }, file: '', events: [], interactions: [], error: err.message });
  }
}

function renderDetail(d) {
  var t = d.task || {};
  var meta = [];
  if (t.project) meta.push('<span class="tag project">' + esc(t.project) + '</span>');
  if (t.module) meta.push('<span class="tag module" style="color:var(--accent)">' + esc(t.module) + '</span>');
  if (t.agent) meta.push('<span class="tag">agente: ' + esc(t.agent) + '</span>');
  var dates = [
    t.created_at ? 'criada ' + fmtDate(t.created_at) : '',
    t.started_at ? 'iniciada ' + fmtDate(t.started_at) : '',
    t.finished_at ? 'concluída ' + fmtDate(t.finished_at) : ''
  ].filter(Boolean).join(' · ');

  var scope = (t.scope || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
  var events = (d.events || []).map(function (e) {
    return '<li><span class="at">' + esc(fmtDate(e.at)) + '</span><span class="ev">' + esc(e.event) + '</span><span>' + esc(e.message || '') + '</span></li>';
  }).join('');
  var inters = (d.interactions || []).map(function (i) {
    return '<li><span class="who">[' + esc(fmtDate(i.at)) + '] ' + esc(i.source) + '/' + esc(i.kind) + '</span><pre>' + esc(i.content) + '</pre></li>';
  }).join('');

  modalBox.innerHTML =
    '<button class="close" onclick="closeModal()">✕</button>' +
    '<h2>' + esc(t.title || t.id) + '</h2>' +
    '<div class="sub">' + esc(t.id) + (meta.length ? ' · ' + meta.join(' ') : '') + (dates ? '<br/>' + esc(dates) : '') + '</div>' +
    (d.error ? '<p style="color:var(--danger)">erro: ' + esc(d.error) + '</p>' : '') +
    '<h3>Escopo (' + (t.scope || []).length + ')</h3>' +
    (scope ? '<ul class="scope-list">' + scope + '</ul>' : '<p class="empty">sem escopo declarado</p>') +
    '<h3>Arquivo da task</h3>' +
    '<pre class="file">' + esc(d.file || '(sem conteúdo)') + '</pre>' +
    '<h3>Timeline (' + (d.events || []).length + ')</h3>' +
    (events ? '<ul class="timeline">' + events + '</ul>' : '<p class="empty">sem eventos</p>') +
    '<h3>Interações (' + (d.interactions || []).length + ')</h3>' +
    (inters ? '<ul class="inter">' + inters + '</ul>' : '<p class="empty">sem interações</p>');
}

function closeModal() {
  modal.classList.remove('open');
  modalBox.innerHTML = '';
}
window.closeModal = closeModal;
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

/* ---------- ui ---------- */
function showToast(msg) {
  toast.textContent = msg;
  toast.style.display = 'block';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(function () { toast.style.display = 'none'; }, 6000);
}

async function loadCanvas() {
  try {
    var res = await fetch('/api/canvas');
    var data = await res.json();
    if (data.ok) {
      state.canvas = data.canvas || [];
      state.generatedAt = data.generated_at || null;
      render();
    }
  } catch (e) { /* servidor caiu — aguarda próximo poll */ }
}

document.getElementById('refreshBtn').addEventListener('click', loadCanvas);
loadCanvas();
setInterval(loadCanvas, 3000);
</script>
</body>
</html>`
}