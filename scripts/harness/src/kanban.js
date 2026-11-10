import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { DB_DIR, openDb, boardQuery, taskDetails, resolveTaskId, syncFromMarkdown } from './lib/db.js'
import { canvasState } from './lib/canvas.js'
import { startTask, finishTask, requeueTask, reopenTask } from './lib/pipeline.js'
import { taskLocation, queueDir, activeDir, doneDir } from './lib/tasks.js'
import { templatesDir } from './lib/paths.js'
import { readWipConfig } from './lib/workspace.js'
import { readRegistry } from './lib/worktree.js'

const DEFAULT_PORT = 4310
const VALID_MOVES = { queue: ['active'], active: ['queue', 'done'], done: ['active'] }
// Painel de rotinas (task 88): `.harness/routines.json` decide a presença do
// painel e `.harness/webhook-token` é o segredo que o botão "rodar agora"
// confirma no servidor — mesmos arquivos da feature rotinas (86).
const ROUTINES_JSON = 'routines.json'
const WEBHOOK_TOKEN_FILE = 'webhook-token'

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

// Links/painéis do modo serve: injetados por string-replace no HTML renderizado —
// o template board.html fica intacto (fora do escopo das tasks 85/88).
// A vista Execução (85) vai sempre no header; o painel de rotinas (AC-7) entra
// APENAS quando `.harness/routines.json` existe. Sem o arquivo, o painel não
// aparece (degradação); com o arquivo e sem `extras.routines` (kanban puro), o
// script do painel já nasce em modo inativo e mostra o badge "rode harness serve".
function withBoardExtras(html, opts = {}) {
  const anchor = '<span class="spacer"></span>'
  if (!html.includes(anchor)) return html
  const canvasLink = '<a class="mode" href="/canvas" style="color:var(--accent)">▶ vista Execução</a>'
  const toggle = opts.panel
    ? '<a class="mode" href="#" id="routinesToggle" style="color:var(--accent)" aria-expanded="false" title="painel de rotinas (agenda + rodar agora)">⏱ Rotinas</a>'
    : ''
  const panel = opts.panel ? renderRoutinesPanel(opts.api) : ''
  return html
    .replace(anchor, canvasLink + toggle + anchor)
    .replace('</body>', `${panel}</body>`)
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
 * Existência de `.harness/routines.json` (AC-7): decide a presença do painel.
 * Leitura direta de arquivo — kanban.js continua SEM importar routines.js
 * (decisão da 86): o acoplamento funcional da rota vem só do extras injetado
 * e do arquivo (fonte declarativa igualmente consumida por serve/routines).
 */
function routinesJsonAvailable(ctx) {
  try {
    return fs.existsSync(path.join(projectRoot(ctx, ''), DB_DIR, ROUTINES_JSON))
  } catch {
    return false
  }
}

/** Token local do webhook (`.harness/webhook-token`): o processo serve é o dono
 *  do arquivo, então o botão "rodar agora" passa esse valor para o MESMO
 *  checkToken do webhook — sem o segredo trafegar pela UI. */
function localWebhookToken(root) {
  try {
    return fs.readFileSync(path.join(root, DB_DIR, WEBHOOK_TOKEN_FILE), 'utf8').trim() || null
  } catch {
    return null
  }
}

/**
 * Servidor do kanban (`harness kanban --serve`) e — com `extras.routines` — o
 * modo `harness serve` (task 86): a MESMA instância preside o webhook de rotinas
 * (POST /webhook/routines/:id?token=) e o payload do painel (GET /api/routines).
 * extras: { routines } — sem eles o modo kanban puro continua igual (rotas 404).
 */
export function serveBoard(ctx, port, host = '127.0.0.1', extras = {}) {
  const page = withBoardExtras(renderPage(null, ctx.title), {
    panel: routinesJsonAvailable(ctx),
    api: extras.routines != null
  })
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

  // Task 88: "rodar agora" do painel — MESMO caminho do webhook (núcleo
  // compartilhado: token → fire → resposta), sem HTTP self-call. Rota de
  // browser: mesmo guard de origem dos moves; o token vem do ARQUIVO local,
  // nunca do cliente.
  const runNow = req.method === 'POST' ? pathname.match(/^\/api\/routines\/([a-z0-9][a-z0-9-]*)\/run$/) : null
  if (runNow && routines) {
    if (!sameOrigin(req)) return sendError(res, 403, 'origem não permitida')
    let target
    try {
      target = projectRoot(ctx, url.searchParams.get('project') ?? '')
    } catch (err) {
      return sendError(res, 400, err.message)
    }
    return handleRunRoutine(req, res, routines, runNow[1], target)
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
 * Núcleo ÚNICO de disparo (AC-4/AC-7): webhook HTTP e botão "rodar agora" do
 * painel compartilham o caminho token → body drenado → registro do recebimento
 * → fire → resposta ({criada} | {skip:dedupe} | 404 | 500). `received` difere
 * só na mensagem auditada; o disparo em si é o MESMO `routines.fire`.
 */
async function respondRoutineFire(req, res, routines, id, token, received) {
  if (!routines.checkToken(token)) {
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

  routines.record('webhook_received', id, received)
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

/**
 * POST /webhook/routines/:id?token=<t> (AC-4): 401 sem/errado token (auditado),
 * 404 rotina inexistente, 200 com o resultado ({criada} ou {skip:dedupe}).
 * O body é drenado (v1 ignora: a task vem do routines.json declarativo).
 */
async function handleWebhook(res, routines, id, url, req) {
  return respondRoutineFire(
    req,
    res,
    routines,
    id,
    url.searchParams.get('token'),
    'disparo da rotina por webhook'
  )
}

/**
 * POST /api/routines/:id/run (AC-7): o botão "rodar agora" do painel confirma
 * o token LIDO DO ARQUIVO LOCAL (o processo serve o tem) e passa pelo mesmo
 * núcleo do webhook — dedupe e auditoria idênticos, sem HTTP self-call.
 */
function handleRunRoutine(req, res, routines, id, root) {
  return respondRoutineFire(
    req,
    res,
    routines,
    id,
    localWebhookToken(root),
    'disparo da rotina pelo painel (rodar agora)'
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
 * Painel "Rotinas" (task 88, AC-7): drawer lateral do board com o mesmo tema
 * da vista Execução. Os dados vêm de GET /api/routines ({id, title, every,
 * nextRun, lastRun, fireCount}) e o botão "rodar agora" POSTa em
 * /api/routines/:id/run — que no servidor passa pelo MESMO núcleo de fire do
 * webhook (token confirmado no servidor, sem HTTP self-call). Degradações:
 * - sem routines.json: este markup não é nem injetado (painel não aparece);
 * - routines.json sem scheduler (kanban puro): `api=false` → ao abrir, o
 *   painel mostra o badge "inativo — rode harness serve" e dispensa o botão.
 * routines.json é SEMPRE manual: a UI nunca o edita e nenhum endpoint de
 * escrita além do "rodar agora" existe.
 */
function renderRoutinesPanel(apiEnabled) {
  return `
<style>
  #routines-panel {
    position: fixed; top: 0; right: 0; bottom: 0; z-index: 25;
    width: min(440px, 94vw); background: var(--col);
    border-left: 1px solid var(--border); box-shadow: -14px 0 32px rgba(0,0,0,.35);
    padding: 16px 18px; overflow-y: auto; display: none;
  }
  #routines-panel.open { display: block; }
  #routines-panel .rp-heading { font-size: 14px; margin: 0 26px 0 0; }
  #routines-panel .rp-sub { color: var(--muted); font-size: 11px; margin: 3px 0 14px; line-height: 1.5; }
  #routines-panel .rp-close { position: absolute; top: 10px; right: 10px; padding: 2px 9px; }
  .rp-row {
    background: var(--card); border: 1px solid var(--border); border-radius: 10px;
    padding: 10px 12px; margin-bottom: 10px;
  }
  .rp-row .rp-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .rp-row .rp-title { font-size: 13px; font-weight: 600; margin: 0; word-break: break-word; }
  .rp-row .rp-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
  .rp-row .rp-line {
    display: flex; justify-content: space-between; gap: 8px;
    font-size: 12px; color: var(--muted); margin-top: 5px;
  }
  .rp-row .rp-val { color: var(--text); text-align: right; }
  .rp-row .rp-foot {
    display: flex; justify-content: space-between; color: var(--muted); font-size: 11px;
    margin-top: 7px; font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  }
  .rp-run { white-space: nowrap; border-color: var(--accent); }
  .rp-run:disabled { opacity: .55; cursor: progress; }
  .rp-state { margin-top: 4px; }
</style>
<aside id="routines-panel" role="region" aria-label="Rotinas" aria-hidden="true">
  <button type="button" class="rp-close" id="routinesClose" title="fechar painel">✕</button>
  <h2 class="rp-heading">⏱ Rotinas</h2>
  <p class="rp-sub" id="routines-mode"></p>
  <div id="routines-list"><p class="empty">carregando…</p></div>
</aside>
<script>
(function () {
  var API = ${apiEnabled ? 'true' : 'false'};
  var panel = document.getElementById('routines-panel');
  var toggle = document.getElementById('routinesToggle');
  var list = document.getElementById('routines-list');
  var mode = document.getElementById('routines-mode');
  var timer = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtWhen(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function relAgo(iso) {
    if (!iso) return '';
    var s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 0) s = 0;
    if (s < 60) return 'agora';
    if (s < 3600) return Math.floor(s / 60) + ' min atrás';
    if (s < 86400) return Math.floor(s / 3600) + 'h atrás';
    return Math.floor(s / 86400) + 'd atrás';
  }
  function relIn(iso) {
    var s = Math.floor((new Date(iso).getTime() - Date.now()) / 1000);
    if (isNaN(s)) return '';
    if (s <= 0) return 'agora';
    if (s < 3600) return 'em ' + Math.max(1, Math.floor(s / 60)) + ' min';
    if (s < 86400) return 'em ' + Math.floor(s / 3600) + 'h';
    return 'em ' + Math.floor(s / 86400) + 'd';
  }

  /* toast — mesmo elemento do board, cinzas de sucesso quando o disparo sai */
  function rpToast(msg, kind) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    var ok = kind === 'ok';
    el.style.background = ok ? '#14532d' : '#7f1d1d';
    el.style.color = ok ? '#bbf7d0' : '#fecaca';
    el.style.borderColor = ok ? '#16a34a' : '#b91c1c';
    el.style.display = 'block';
    clearTimeout(rpToast._t);
    rpToast._t = setTimeout(function () { el.style.display = 'none'; }, 6000);
  }

  function rowHtml(r) {
    var next = r.nextRun ? fmtWhen(r.nextRun) + ' (' + esc(relIn(r.nextRun)) + ')' : '—';
    var last = r.lastRun ? fmtWhen(r.lastRun) + ' · ' + esc(relAgo(r.lastRun)) : 'nunca';
    var fireCount = Number(r.fireCount || 0);
    return '<div class="rp-row" data-id="' + esc(r.id) + '">' +
      '<div class="rp-head">' +
        '<p class="rp-title">' + esc(r.title || r.id) + '</p>' +
        '<button type="button" class="rp-run" data-id="' + esc(r.id) + '" title="dispara a rotina agora pelo mesmo caminho do webhook (token fica no servidor)">▶ rodar agora</button>' +
      '</div>' +
      '<div class="rp-meta">' +
        '<span class="tag" title="recorrência declarada em routines.json">⏰ ' + esc(r.every) + '</span>' +
        '<span class="tag" title="disparos válidos (task criada ou skip por dedupe)">🔥 ' + fireCount + ' disparo(s)</span>' +
      '</div>' +
      '<div class="rp-line"><span>próxima execução</span><span class="rp-val">' + next + '</span></div>' +
      '<div class="rp-line"><span>última execução</span><span class="rp-val">' + last + '</span></div>' +
      '<div class="rp-foot"><span>' + esc(r.id) + '</span><span>routines.json</span></div>' +
    '</div>';
  }

  function inactive() {
    mode.textContent = 'routines.json existe, sem agendador neste processo';
    list.innerHTML =
      '<div class="rp-state">' +
      '<span class="tag" style="color:var(--queue);border-color:var(--queue)">⚠ inativo — rode harness serve</span>' +
      '<p class="empty" style="text-align:left">' +
      'o agendador e o webhook das rotinas vivem no processo <code>harness serve</code>' +
      ' (kanban + scheduler num processo só). Neste modo, "rodar agora" e as execuções' +
      ' seguintes/última não estão disponíveis. O arquivo .harness/routines.json nunca é editado pela UI.' +
      '</p>' +
      '</div>';
  }

  function load() {
    fetch('/api/routines').then(function (res) {
      return res.json().then(function (data) { return { status: res.status, data: data }; });
    }).then(function (r) {
      var rows = (r.data && r.data.routines) || [];
      if (r.status === 200 && r.data && r.data.ok) {
        mode.textContent = 'de .harness/routines.json · "rodar agora" usa o mesmo caminho do webhook (token fica no servidor)';
        list.innerHTML = rows.length
          ? rows.map(rowHtml).join('')
          : '<p class="empty">nenhuma rotina válida em .harness/routines.json (a edição é manual, nunca pela UI)</p>';
      } else {
        inactive();
        if (timer) { clearInterval(timer); timer = null; }
      }
    }).catch(function () { /* servidor caiu — aguarda o próximo tick */ });
  }

  function runNow(id, btn) {
    btn.disabled = true;
    fetch('/api/routines/' + encodeURIComponent(id) + '/run', { method: 'POST' }).then(function (res) {
      return res.json().then(function (data) { return { status: res.status, data: data }; });
    }).then(function (r) {
      var d = r.data || {};
      if (r.status === 200 && d.ok && d.criada) {
        rpToast('✅ task criada: ' + (d.num ? '#' + d.num + ' ' : '') + d.criada, 'ok');
        load();
      } else if (r.status === 200 && d.ok && d.skip) {
        rpToast('⏭ dedupe: task já existe (' + d.task + ') — nada recriado', 'ok');
        load();
      } else {
        rpToast('erro: ' + (d.error || 'HTTP ' + r.status));
        if (r.status === 404) load(); // routines.json editado por fora
      }
      btn.disabled = false;
    }).catch(function (err) {
      rpToast('erro de conexão: ' + err.message);
      btn.disabled = false;
    });
  }

  /* delegação: as linhas re-renderizam a cada refresh */
  list.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.rp-run');
    if (btn) runNow(btn.getAttribute('data-id'), btn);
  });

  function openPanel() {
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    if (API) {
      mode.textContent = 'carregando…';
      load();
      if (!timer) {
        timer = setInterval(function () {
          if (panel.classList.contains('open')) load();
        }, 30000);
      }
    } else {
      inactive();
    }
  }

  function closePanel() {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    if (timer) { clearInterval(timer); timer = null; }
  }

  toggle.addEventListener('click', function (e) {
    e.preventDefault();
    if (panel.classList.contains('open')) closePanel(); else openPanel();
  });
  document.getElementById('routinesClose').addEventListener('click', closePanel);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('open')) closePanel();
  });
})();
</script>
`
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