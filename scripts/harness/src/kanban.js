import http from 'node:http'
import { renderWorkspacePage } from './lib/workspace-page.js'
import { listProjects } from './lib/projects.js'
import fs from 'node:fs'
import path from 'node:path'
import { DB_DIR, openDb, boardQuery, taskDetails, resolveTaskId, syncFromMarkdown } from './lib/db.js'
import { canvasState } from './lib/canvas.js'
import { analytics, parseSince } from './lib/analytics.js'
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
  // Canvas interativo (api-local, task 116): controles + token da sessão só no `harness serve`.
  const canvasPage = renderCanvasPage(
    ctx.title,
    extras.runs ? { control: true, token: extras.runs.token, allowUnsafe: extras.runs.allowUnsafe } : {}
  )
  // Workspace (task 140): conversa + mudanças; mesmos controles/token do canvas.
  const workspacePage = renderWorkspacePage(
    ctx.title,
    extras.runs ? { control: true, token: extras.runs.token, allowUnsafe: extras.runs.allowUnsafe } : {}
  )
  const server = http.createServer((req, res) => {
    try {
      route(req, res, ctx, page, canvasPage, { ...extras, workspacePage })
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

  if (req.method === 'GET' && pathname === '/workspace' && extras.workspacePage) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    return res.end(extras.workspacePage)
  }

  // Seletor de projetos do Workspace (task 142): projetos do workspace com a contagem de tasks.
  if (req.method === 'GET' && pathname === '/api/projects') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    return res.end(JSON.stringify({ ok: true, ...listProjects(projectRoot(ctx)) }))
  }

  if (req.method === 'GET' && pathname === '/api/board') {
    try {
      return json(res, 200, { ok: true, board: buildBoard(ctx) })
    } catch (err) {
      return sendError(res, 500, err.message)
    }
  }

  // Analytics (task 129): leitura pura — vale no `kanban --serve` e no `harness serve`.
  if (req.method === 'GET' && pathname === '/analytics') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    return res.end(renderAnalyticsPage(ctx.title))
  }
  if (req.method === 'GET' && pathname === '/api/analytics') {
    let target
    try {
      target = projectRoot(ctx, url.searchParams.get('project') ?? '')
    } catch (err) {
      return sendError(res, 400, err.message)
    }
    let db = null
    try {
      const since = parseSince(url.searchParams.get('since') ?? '30d')
      db = openDb(target)
      return json(res, 200, { ok: true, ...analytics(db, { by: url.searchParams.get('by') ?? 'tool', since }) })
    } catch (err) {
      return sendError(res, 400, err.message)
    } finally {
      try {
        db?.close()
      } catch {}
    }
  }

  if (req.method === 'GET' && pathname === '/api/canvas') {
    try {
      return json(res, 200, { ok: true, ...canvasState(ctx) })
    } catch (err) {
      return sendError(res, 500, err.message)
    }
  }

  // API local de execuções (api-local, task 115): só no `harness serve`.
  if (extras.runs && extras.runs.handle(req, res, url)) return

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
/**
 * Painel de analytics (task 129): totais, barras por grupo (custo e tokens) e tabela, alimentados
 * por GET /api/analytics?by=&since=. Mesmo tema da vista Execução; sem dependências.
 */
export function renderAnalyticsPage(title = 'AlterAI - Agentic OS — Tasks') {
  const tt = String(title).replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${tt} — Analytics</title>
<style>
  :root { --bg: #0f1117; --col: #171a21; --border: #262b36; --text: #e6e9ef; --muted: #8b93a5; --accent: #6366f1; --ok: #4ade80; --bad: #f87171; --bar: #6366f1; --bar2: #22d3ee; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  header { display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-bottom: 1px solid var(--border); background: var(--col); flex-wrap: wrap; }
  header h1 { font-size: 16px; margin: 0; font-weight: 600; }
  header a { color: var(--accent); text-decoration: none; font-size: 12px; }
  header .spacer { flex: 1; }
  select, button { background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; font-size: 12px; }
  main { padding: 20px; display: grid; gap: 18px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
  .card { background: var(--col); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
  .card .label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  .card .value { font-size: 22px; font-weight: 600; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .card .hint { color: var(--muted); font-size: 11px; margin-top: 2px; }
  .panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 14px; }
  .panel { background: var(--col); border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
  .panel h2 { font-size: 13px; margin: 0 0 10px; color: var(--muted); font-weight: 600; }
  .bar-row { display: grid; grid-template-columns: 140px 1fr 90px; gap: 8px; align-items: center; font-size: 12px; margin: 5px 0; }
  .bar-row .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { background: var(--bg); border-radius: 4px; height: 12px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; background: var(--bar); }
  .bar-fill.tokens { background: var(--bar2); }
  .bar-row .num { text-align: right; font-variant-numeric: tabular-nums; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
  th, td { padding: 6px 8px; border-bottom: 1px solid var(--border); text-align: right; }
  th:first-child, td:first-child { text-align: left; }
  th { color: var(--muted); font-weight: 600; }
  .ok { color: var(--ok); } .bad { color: var(--bad); }
  .empty { color: var(--muted); font-size: 13px; text-align: center; padding: 30px 0; }
  .note { color: var(--muted); font-size: 11px; }
</style>
</head>
<body>
<header>
  <h1>${tt}</h1>
  <a href="/">← Board</a>
  <a href="/canvas">Execução</a>
  <span class="spacer"></span>
  <label class="note">agrupar por <select id="by">
    <option value="tool">tool</option><option value="model">modelo</option><option value="agent">agente</option>
    <option value="task">task</option><option value="day">dia</option></select></label>
  <label class="note">período <select id="since">
    <option value="7d">7 dias</option><option value="30d" selected>30 dias</option><option value="90d">90 dias</option><option value="all">tudo</option></select></label>
  <button id="refresh">↻</button>
</header>
<main>
  <section class="cards" id="cards"></section>
  <section class="panels">
    <div class="panel"><h2>Custo (USD reportado)</h2><div id="cost"></div></div>
    <div class="panel"><h2>Tokens (entrada + saída reportados)</h2><div id="tokens"></div></div>
  </section>
  <section class="panel"><h2 id="tableTitle">Detalhe</h2><div id="table"></div></section>
  <p class="note">Tokens e custo só entram quando a tool reporta; runs sem uso reportado aparecem em "sem uso" e ficam fora das somas. "Gates ok" = runs com gates pós-run aprovados (harness.json → gates.run).</p>
</main>
<script>
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function num(v) { return v == null ? 'n/d' : Number(v).toLocaleString('pt-BR'); }
function pct(v) { return v == null ? 'n/d' : Math.round(v * 100) + '%'; }
function usd(v) { return '$' + Number(v || 0).toFixed(v >= 1 ? 2 : 4); }
function dur(ms) {
  if (ms == null) return 'n/d';
  var s = Math.round(ms / 1000);
  return s < 60 ? s + 's' : Math.floor(s / 60) + 'm' + String(s % 60).padStart(2, '0') + 's';
}
function card(label, value, hint) {
  return '<div class="card"><div class="label">' + esc(label) + '</div><div class="value">' + esc(value) + '</div>' + (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') + '</div>';
}
function bars(groups, value, fmt, cls) {
  var max = Math.max.apply(null, groups.map(value).concat([0]));
  if (!max) return '<div class="empty">nada reportado no período</div>';
  return groups.slice(0, 12).map(function (g) {
    var v = value(g);
    return '<div class="bar-row"><span class="name" title="' + esc(g.key) + '">' + esc(g.key) + '</span>' +
      '<div class="bar-track"><div class="bar-fill ' + (cls || '') + '" style="width:' + Math.max(1, Math.round(v / max * 100)) + '%"></div></div>' +
      '<span class="num">' + esc(fmt(v)) + '</span></div>';
  }).join('');
}
async function load() {
  var by = document.getElementById('by').value;
  var since = document.getElementById('since').value;
  try {
    var res = await fetch('/api/analytics?by=' + encodeURIComponent(by) + '&since=' + encodeURIComponent(since));
    var d = await res.json();
    if (!d.ok) throw new Error(d.error || 'erro');
    var t = d.totals;
    document.getElementById('cards').innerHTML =
      card('execuções', num(t.runs), t.running ? t.running + ' rodando' : '') +
      card('sucesso', pct(t.success_rate), num(t.completed) + ' ok · ' + num(t.failed) + ' falha') +
      card('custo', usd(t.cost_usd), t.unmeasured ? t.unmeasured + ' sem uso reportado' : 'tudo medido') +
      card('tokens', num(t.tokens_in + t.tokens_out), num(t.tokens_in) + ' in · ' + num(t.tokens_out) + ' out') +
      card('duração média', dur(t.avg_duration_ms), '') +
      card('gates ok', pct(t.quality_rate), num(t.quality_passed) + ' ok · ' + num(t.quality_failed) + ' falha');
    var groups = d.groups;
    document.getElementById('cost').innerHTML = bars(groups, function (g) { return g.cost_usd; }, usd);
    document.getElementById('tokens').innerHTML = bars(groups, function (g) { return g.tokens_in + g.tokens_out; }, num, 'tokens');
    document.getElementById('tableTitle').textContent = 'Detalhe por ' + document.getElementById('by').selectedOptions[0].textContent;
    document.getElementById('table').innerHTML = groups.length
      ? '<table><thead><tr><th>' + esc(by) + '</th><th>runs</th><th>sucesso</th><th>tokens in</th><th>tokens out</th><th>custo</th><th>duração média</th><th>gates ok</th><th>sem uso</th></tr></thead><tbody>' +
        groups.map(function (g) {
          return '<tr><td>' + esc(g.key) + '</td><td>' + num(g.runs) + '</td><td class="' + (g.success_rate == null ? '' : g.success_rate >= 0.8 ? 'ok' : 'bad') + '">' + pct(g.success_rate) + '</td>' +
            '<td>' + num(g.tokens_in) + '</td><td>' + num(g.tokens_out) + '</td><td>' + usd(g.cost_usd) + '</td><td>' + dur(g.avg_duration_ms) + '</td>' +
            '<td class="' + (g.quality_rate == null ? '' : g.quality_rate >= 0.8 ? 'ok' : 'bad') + '">' + pct(g.quality_rate) + '</td><td>' + num(g.unmeasured) + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<div class="empty">nenhuma execução no período</div>';
  } catch (err) {
    document.getElementById('cards').innerHTML = '<div class="empty">' + esc(err.message) + '</div>';
  }
}
document.getElementById('by').addEventListener('change', load);
document.getElementById('since').addEventListener('change', load);
document.getElementById('refresh').addEventListener('click', load);
load();
setInterval(load, 15000);
</script>
</body>
</html>`
}

export function renderCanvasPage(title = 'AlterAI - Agentic OS — Tasks', opts = {}) {
  const tt = String(title).replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // JSON dentro de <script>: escapar `<` evita fechar a tag com dados.
  const control = JSON.stringify({
    enabled: Boolean(opts.control),
    token: opts.control ? String(opts.token ?? '') : '',
    allowUnsafe: Boolean(opts.control && opts.allowUnsafe)
  }).replace(/</g, '\\u003c')
  const modeLabel = opts.control ? 'controle de agentes ativo' : 'v1 leitura'
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
  /* run do agente (execucao-agentes, task 95) */
  .card .run { margin-top: 8px; padding-top: 6px; border-top: 1px dashed var(--border); }
  .card .run .row { margin-top: 4px; }
  .run-status { font-weight: 600; }
  .run-status.running { color: #60a5fa; }
  .run-status.completed { color: #4ade80; }
  .run-status.failed { color: #f87171; }
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
  /* controle de agentes (api-local, task 116) */
  .card .actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
  .card .actions button { padding: 4px 10px; }
  button.go { border-color: var(--active); color: #93c5fd; }
  button.stop { border-color: var(--danger); color: var(--danger); }
  .hint { color: var(--muted); font-size: 11px; font-family: ui-monospace, Consolas, monospace; }
  form.run-form { display: grid; grid-template-columns: 160px 1fr; gap: 10px 12px; align-items: center; font-size: 13px; }
  form.run-form label { color: var(--muted); }
  form.run-form input[type=text], form.run-form input[type=number], form.run-form select {
    background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 6px 8px; font-size: 13px;
  }
  form.run-form .full { grid-column: 1 / -1; }
  form.run-form .warn { color: var(--queue); font-size: 12px; }
  .live { list-style: none; margin: 0; padding: 0; font-size: 12px; max-height: 52vh; overflow-y: auto; }
  .live li { display: flex; gap: 10px; padding: 4px 0; border-bottom: 1px dashed var(--border); }
  .live .ic { width: 18px; text-align: center; }
  .live .tx { flex: 1; word-break: break-word; white-space: pre-wrap; }
  .live li.err .tx { color: var(--danger); }
  .runs-list { list-style: none; margin: 0; padding: 0; font-size: 12px; }
  .runs-list li { display: flex; justify-content: space-between; gap: 8px; padding: 5px 0; border-bottom: 1px dashed var(--border); cursor: pointer; }
  .runs-list li:hover { color: var(--accent); }
</style>
</head>
<body>
<header>
  <h1>${tt}</h1>
  <span class="mode">vista Execução · ao vivo (auto-refresh 3s) · ${modeLabel}</span>
  <a href="/">← Board (kanban)</a>
  <a href="/analytics">📊 Analytics</a>
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
var CONTROL = ${control};
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

/* ---------- run do agente (task 95) ---------- */
var RUN_STATUS = { running: '▶ rodando', completed: '✔ concluído', failed: '✖ falhou' };
function fmtUsage(r) {
  var n = function (v) { return v == null ? 'n/d' : String(v); };
  var tokens = (r.tokens_in == null && r.tokens_out == null) ? 'n/d' : n(r.tokens_in) + ' / ' + n(r.tokens_out);
  var cost = r.cost_usd == null ? 'n/d' : '$' + Number(r.cost_usd).toFixed(4);
  return tokens + ' · ' + cost + (r.measured ? ' (medido)' : '');
}
function runHtml(r) {
  if (!r) return '';
  var status = RUN_STATUS[r.status] || r.status;
  var head = '🤖 ' + esc(r.tool) + (r.model ? ' · ' + esc(r.model) : '') + (r.unsafe ? ' · ⚠️ unsafe' : '');
  var batch = r.batch_id
    ? '<div class="row"><span>🧩 lote</span><span class="val" title="harness runs --batch ' + esc(r.batch_id) + '">' + esc(r.batch_id) + '</span></div>'
    : '';
  var last = r.last_agent_event
    ? esc(r.last_agent_event.summary) + ' · ' + esc(relTime(r.last_agent_event.at))
    : '—';
  return '<div class="run" data-run="' + esc(r.id) + '">' +
    '<div class="row"><span>' + head + '</span><span class="val run-status ' + esc(r.status) + '">' + esc(status) + '</span></div>' +
    '<div class="row"><span>agente</span><span class="val" title="' + last + '">' + last + '</span></div>' +
    '<div class="row"><span>tokens · custo</span><span class="val">' + esc(fmtUsage(r)) + '</span></div>' +
    (r.quality ? '<div class="row"><span>🧪 gates</span><span class="val run-status ' + (r.quality === 'passed' ? 'completed' : r.quality === 'failed' ? 'failed' : '') + '">' + esc(r.quality) + '</span></div>' : '') +
    batch +
  '</div>';
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
    runHtml(c.run) +
    flowHtml(c) +
    compHtml(c) +
    actionsHtml(c) +
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

/* ---------- controle de agentes (api-local, task 116) ---------- */
var runtimes = null;
var view = null; // { runId, seq, timer } da timeline aberta

function taskNum(id) { var m = String(id).match(/^(\d+)-/); return m ? m[1] : id; }

var FLOW_STATUS = {
  running: '▶ rodando', waiting_approval: '⏸ aguardando aprovação', needs_human: '🙋 pede humano',
  completed: '✔ aprovado', failed: '✖ falhou', stopped: '⏹ parado'
};
var ROLE_SHORT = { implement: 'implementar', review: 'revisar', fix: 'corrigir' };
function stepChip(st) {
  var icon = st.status === 'running' ? '▶' : st.status === 'failed' ? '✖' :
    st.role === 'review' ? (st.verdict === 'approved' ? '✅' : '🔁') : '✔';
  return '<span class="tag" title="' + esc(st.tool) + (st.run_id ? ' · ' + esc(st.run_id) : '') + '">' + st.seq + '. ' + esc(ROLE_SHORT[st.role] || st.role) + ' ' + icon + '</span>';
}
function flowHtml(c) {
  var f = c.flow;
  if (!f) return '';
  return '<div class="run flow" data-flow="' + esc(f.id) + '">' +
    '<div class="row"><span>🔗 fluxo</span><span class="val run-status ' + esc(f.status === 'completed' ? 'completed' : f.status === 'running' ? 'running' : f.status === 'failed' || f.status === 'stopped' ? 'failed' : '') + '">' + esc(FLOW_STATUS[f.status] || f.status) + '</span></div>' +
    '<div class="meta">' + (f.steps || []).map(stepChip).join('') + '</div>' +
    (f.error && f.status !== 'completed' ? '<div class="note">' + esc(f.error) + '</div>' : '') +
  '</div>';
}

var COMP_STATUS = { running: '▶ rodando', ready: '🏁 pronta para escolher', picked: '✅ escolhida', discarded: '🗑 descartada', failed: '✖ falhou' };
function compHtml(c) {
  var k = c.competition;
  if (!k) return '';
  var chips = (k.competitors || []).map(function (x) {
    var icon = x.status === 'completed' ? '✔' : x.status === 'running' ? '▶' : x.status === 'pending' ? '·' : '✖';
    var star = k.winner === x.key ? ' ✅' : k.judge_winner === x.key ? ' ⭐' : '';
    return '<span class="tag" title="' + esc(x.tool) + '">' + esc(x.key) + ' ' + icon + star + '</span>';
  }).join('');
  return '<div class="run comp" data-comp="' + esc(k.id) + '">' +
    '<div class="row"><span>🏁 competição</span><span class="val">' + esc(COMP_STATUS[k.status] || k.status) + '</span></div>' +
    '<div class="meta">' + chips + '</div>' +
    (k.error && k.status === 'failed' ? '<div class="note">' + esc(k.error) + '</div>' : '') +
  '</div>';
}

function actionsHtml(c) {
  if (!CONTROL.enabled || c.project) return '';
  var b = '';
  var f = c.flow;
  var k = c.competition;
  var flowOpen = f && ['running', 'waiting_approval', 'needs_human', 'failed'].indexOf(f.status) !== -1;
  var compOpen = k && ['running', 'ready'].indexOf(k.status) !== -1;
  if (compOpen) {
    b += '<button class="go" data-act="comp-show" data-comp="' + esc(k.id) + '">🏁 ' + (k.status === 'ready' ? 'Comparar e escolher' : 'Acompanhar') + '</button>';
    b += '<button class="stop" data-act="comp-discard" data-comp="' + esc(k.id) + '">🗑 Descartar</button>';
  } else if (flowOpen) {
    if (f.status !== 'running') b += '<button class="go" data-act="flow-resume" data-flow="' + esc(f.id) + '">▶ Continuar fluxo</button>';
    b += '<button class="stop" data-act="flow-stop" data-flow="' + esc(f.id) + '">■ Parar fluxo</button>';
  } else if (c.run && c.run.status === 'running') {
    b += '<button class="stop" data-act="stop" data-run="' + esc(c.run.id) + '">■ Parar</button>';
  } else if (c.worktree && c.worktree !== 'raiz') {
    b += '<button class="go" data-act="run" data-task="' + esc(c.id) + '">▶ Rodar agente</button>';
    b += '<button class="go" data-act="flow" data-task="' + esc(c.id) + '">🔗 Fluxo</button>';
    b += '<button class="go" data-act="comp" data-task="' + esc(c.id) + '">🏁 Competição</button>';
  } else {
    b += '<span class="hint" title="o agente só roda isolado numa worktree">harness worktree start ' + esc(taskNum(c.id)) + '</span>';
  }
  if (c.run) b += '<button data-act="timeline" data-run="' + esc(c.run.id) + '">📜 timeline</button>';
  if (f) b += '<button data-act="flow-show" data-flow="' + esc(f.id) + '">🔗 etapas</button>';
  return '<div class="actions">' + b + '</div>';
}

/* ---------- execução competitiva (task 125) ---------- */
async function openCompForm(taskId) {
  stopView();
  modalBox.innerHTML = '<p style="color:var(--muted)">verificando tools instaladas…</p>';
  modal.classList.add('open');
  var list;
  try { list = (await loadRuntimes()).filter(function (r) { return r.installed; }); } catch (err) { closeModal(); return showToast(err.message); }
  if (!list.length) { closeModal(); return showToast('nenhuma tool de agente instalada (harness runtimes)'); }
  var slots = '';
  for (var i = 0; i < 3; i++) {
    slots += '<label for="k-t' + i + '">candidata ' + (i + 1) + (i === 2 ? ' (opcional)' : '') + '</label><div>' +
      '<select id="k-t' + i + '">' + (i === 2 ? '<option value="">—</option>' : '') + toolOptions(list) + '</select> ' +
      '<input type="text" id="k-m' + i + '" placeholder="modelo (opcional)" style="width:180px" /></div>';
  }
  modalBox.innerHTML =
    '<button class="close" onclick="closeModal()">✕</button>' +
    '<h2>🏁 Execução competitiva</h2><div class="sub">' + esc(taskId) + ' · cada candidata resolve a task numa worktree própria; você compara e escolhe a que vai para a worktree da task</div>' +
    '<form class="run-form" id="compForm">' + slots +
      '<label for="k-judge">juiz (opcional)</label><select id="k-judge"><option value="">sem juiz</option>' + toolOptions(list) + '</select>' +
      '<label>opções</label><div>' +
        '<label><input type="checkbox" id="k-budget" /> ignorar orçamento</label><br/>' +
        '<label><input type="checkbox" id="k-unsafe"' + (CONTROL.allowUnsafe ? '' : ' disabled') + ' /> unsafe (todas)</label>' +
      '</div>' +
      '<div class="full warn">A worktree da task precisa estar sem mudanças pendentes. O juiz só lê e recomenda; quem escolhe é você.</div>' +
      '<div class="full"><button class="go" type="submit">🏁 Iniciar</button></div>' +
    '</form>';
  if (list.length > 1) document.getElementById('k-t1').selectedIndex = 1;
  var form = document.getElementById('compForm');
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var tools = [];
    for (var j = 0; j < 3; j++) {
      var t = document.getElementById('k-t' + j).value;
      var m = document.getElementById('k-m' + j).value.trim();
      if (t) tools.push(m ? t + ':' + m : t);
    }
    var body = { task: taskId, tools: tools };
    var judge = document.getElementById('k-judge').value;
    if (judge) body.judge = judge;
    if (document.getElementById('k-budget').checked) body.ignoreBudget = true;
    if (document.getElementById('k-unsafe').checked) body.unsafe = true;
    form.querySelector('button[type=submit]').disabled = true;
    try {
      var data = await api('POST', '/api/competitions', body);
      openComp(data.competition.id);
      loadCanvas();
    } catch (err) {
      form.querySelector('button[type=submit]').disabled = false;
      showToast(err.message);
    }
  });
}

async function discardCompUi(id) {
  if (!confirm('Descartar ' + id + '? As worktrees das candidatas são apagadas.')) return;
  try {
    await api('POST', '/api/competitions/' + encodeURIComponent(id) + '/discard');
    closeModal();
    loadCanvas();
  } catch (err) { showToast(err.message); }
}

async function pickCompUi(id, key) {
  if (!confirm('Aplicar a candidata ' + key + ' na worktree da task e apagar as outras?')) return;
  try {
    await api('POST', '/api/competitions/' + encodeURIComponent(id) + '/pick', { key: key });
    showToast('✅ ' + key + ' aplicada na worktree da task — revise e integre com harness worktree finish');
    closeModal();
    loadCanvas();
  } catch (err) { showToast(err.message); }
}

function openComp(id) {
  stopView();
  var mine = { runId: null, seq: 0, timer: null };
  view = mine;
  modal.classList.add('open');
  modalBox.innerHTML = '<button class="close" onclick="closeModal()">✕</button><div id="kc-body"><p style="color:var(--muted)">carregando…</p></div>';
  var tick = async function () {
    if (view !== mine) return;
    try {
      var d = await api('GET', '/api/competitions/' + encodeURIComponent(id));
      if (view !== mine) return;
      var k = d.competition;
      var rows = d.competitors.map(function (x) {
        var r = x.run;
        var size = x.files_changed == null ? 'n/d' : x.files_changed + ' arq · +' + x.insertions + '/-' + x.deletions;
        var marks = (k.judge_winner === x.key ? ' ⭐ juiz' : '') + (k.winner === x.key ? ' ✅' : '');
        var pick = k.status === 'ready' && x.status === 'completed'
          ? '<button class="go" data-pick="' + esc(x.key) + '">Escolher</button>' : '';
        return '<tr><td>' + esc(x.key) + marks + '</td><td>' + esc(x.tool) + (x.model ? ':' + esc(x.model) : '') + '</td>' +
          '<td class="run-status ' + esc(x.status) + '">' + esc(x.status) + (r && r.quality ? ' · gates ' + esc(r.quality) : '') + '</td><td>' + esc(size) + '</td>' +
          '<td>' + (r ? esc(fmtUsage(r)) : 'n/d') + '</td><td>' + (r ? esc(fmtDur(r.duration_ms)) : '—') + '</td>' +
          '<td>' + (x.out_of_scope && x.out_of_scope.length ? '⚠️ ' + esc(x.out_of_scope.join(', ')) : '—') + '</td>' +
          '<td>' + (x.run_id ? '<button data-tl="' + esc(x.run_id) + '">📜</button> ' : '') + pick + '</td></tr>' +
          (x.error ? '<tr><td colspan="8" style="color:var(--danger);font-size:12px">' + esc(x.error) + '</td></tr>' : '');
      }).join('');
      document.getElementById('kc-body').innerHTML =
        '<h2>🏁 ' + esc(k.id) + '</h2>' +
        '<div class="sub">' + esc(k.task_id) + ' · ' + esc(COMP_STATUS[k.status] || k.status) + (k.error ? ' · ' + esc(k.error) : '') + '</div>' +
        '<table style="width:100%;font-size:12px;border-collapse:collapse"><thead><tr style="color:var(--muted);text-align:left">' +
        '<th>candidata</th><th>tool</th><th>status</th><th>mudança</th><th>tokens · custo</th><th>tempo</th><th>escopo</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' +
        (k.judge_tool ? '<h3>Juiz (' + esc(k.judge_tool) + ')' + (k.judge_winner ? ' — recomenda ' + esc(k.judge_winner) : '') + '</h3>' +
          (k.judge_notes ? '<pre class="file">' + esc(k.judge_notes) + '</pre>' : '<p class="empty">' + (k.status === 'running' ? 'aguardando as candidatas' : 'sem recomendação') + '</p>') : '') +
        (['running', 'ready'].indexOf(k.status) !== -1 ? '<p><button class="stop" id="kc-discard">🗑 Descartar competição</button></p>' : '');
      var box = document.getElementById('kc-body');
      box.querySelectorAll('[data-pick]').forEach(function (b) { b.addEventListener('click', function () { pickCompUi(id, b.dataset.pick); }); });
      box.querySelectorAll('[data-tl]').forEach(function (b) { b.addEventListener('click', function () { openTimeline(b.dataset.tl); }); });
      var dbtn = document.getElementById('kc-discard');
      if (dbtn) dbtn.addEventListener('click', function () { discardCompUi(id); });
      if (k.status === 'running') mine.timer = setTimeout(tick, 2000);
    } catch (err) {
      if (view === mine) document.getElementById('kc-body').innerHTML = '<p style="color:var(--danger)">' + esc(err.message) + '</p>';
    }
  };
  tick();
}

/* ---------- fluxo encadeado (task 122) ---------- */
function toolOptions(list, withSame) {
  var o = withSame ? '<option value="">mesma da implementação</option>' : '';
  return o + list.map(function (r) {
    return '<option value="' + esc(r.tool) + '">' + esc(r.tool) + (r.requires_unsafe ? ' (exige unsafe)' : '') + '</option>';
  }).join('');
}

async function openFlowForm(taskId) {
  stopView();
  modalBox.innerHTML = '<p style="color:var(--muted)">verificando tools instaladas…</p>';
  modal.classList.add('open');
  var list;
  try { list = (await loadRuntimes()).filter(function (r) { return r.installed; }); } catch (err) { closeModal(); return showToast(err.message); }
  if (!list.length) { closeModal(); return showToast('nenhuma tool de agente instalada (harness runtimes)'); }
  modalBox.innerHTML =
    '<button class="close" onclick="closeModal()">✕</button>' +
    '<h2>🔗 Fluxo encadeado</h2><div class="sub">' + esc(taskId) + ' · implementar → revisar → corrigir até aprovar, na worktree da task</div>' +
    '<form class="run-form" id="flowForm">' +
      '<label for="g-impl">implementar</label><select id="g-impl">' + toolOptions(list) + '</select>' +
      '<label for="g-rev">revisar</label><select id="g-rev">' + toolOptions(list) + '</select>' +
      '<label for="g-fix">corrigir</label><select id="g-fix">' + toolOptions(list, true) + '</select>' +
      '<label for="g-rounds">máx. de revisões</label><input type="number" id="g-rounds" min="1" max="10" value="2" />' +
      '<label for="g-approve">aprovação humana</label><select id="g-approve">' +
        '<option value="none">não pausar</option><option value="review">pausar após cada revisão</option><option value="each">pausar após cada etapa</option></select>' +
      '<label>opções</label><div>' +
        '<label><input type="checkbox" id="g-budget" /> ignorar orçamento</label><br/>' +
        '<label><input type="checkbox" id="g-unsafe"' + (CONTROL.allowUnsafe ? '' : ' disabled') + ' /> unsafe (todas as etapas)</label>' +
      '</div>' +
      '<div class="full warn">O revisor só lê: se alterar a worktree, a revisão é reprovada.</div>' +
      '<div class="full"><button class="go" type="submit">🔗 Iniciar fluxo</button></div>' +
    '</form>';
  var rev = document.getElementById('g-rev');
  if (list.length > 1) rev.selectedIndex = 1;
  var form = document.getElementById('flowForm');
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var body = {
      task: taskId,
      implement: document.getElementById('g-impl').value,
      review: rev.value,
      rounds: Number(document.getElementById('g-rounds').value) || 2,
      approve: document.getElementById('g-approve').value
    };
    var fix = document.getElementById('g-fix').value;
    if (fix) body.fix = fix;
    if (document.getElementById('g-budget').checked) body.ignoreBudget = true;
    if (document.getElementById('g-unsafe').checked) body.unsafe = true;
    form.querySelector('button[type=submit]').disabled = true;
    try {
      var data = await api('POST', '/api/flows', body);
      openFlow(data.flow.id);
      loadCanvas();
    } catch (err) {
      form.querySelector('button[type=submit]').disabled = false;
      showToast(err.message);
    }
  });
}

function openResumeForm(flowId) {
  stopView();
  modal.classList.add('open');
  modalBox.innerHTML =
    '<button class="close" onclick="closeModal()">✕</button>' +
    '<h2>▶ Continuar fluxo</h2><div class="sub">' + esc(flowId) + ' · aguardando aprovação: segue para a próxima etapa · falhou: repete a etapa · pede humano: mais uma rodada</div>' +
    '<form class="run-form" id="resumeForm">' +
      '<label for="r-note">instruções (opcional)</label><textarea id="r-note" rows="4" style="background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:6px" placeholder="vão para a próxima etapa, com prioridade sobre a revisão"></textarea>' +
      '<div class="full"><button class="go" type="submit">▶ Continuar</button></div>' +
    '</form>';
  var form = document.getElementById('resumeForm');
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var note = document.getElementById('r-note').value.trim();
    try {
      await api('POST', '/api/flows/' + encodeURIComponent(flowId) + '/resume', note ? { note: note } : {});
      openFlow(flowId);
      loadCanvas();
    } catch (err) { showToast(err.message); }
  });
}

async function stopFlowUi(flowId) {
  if (!confirm('Parar o fluxo ' + flowId + '? A etapa em andamento é interrompida.')) return;
  try {
    await api('POST', '/api/flows/' + encodeURIComponent(flowId) + '/stop');
    loadCanvas();
  } catch (err) { showToast(err.message); }
}

function openFlow(flowId) {
  stopView();
  var mine = { runId: null, seq: 0, timer: null };
  view = mine;
  modal.classList.add('open');
  modalBox.innerHTML = '<button class="close" onclick="closeModal()">✕</button><div id="fl-body"><p style="color:var(--muted)">carregando…</p></div>';
  var tick = async function () {
    if (view !== mine) return;
    try {
      var d = await api('GET', '/api/flows/' + encodeURIComponent(flowId));
      if (view !== mine) return;
      var f = d.flow;
      var spec = function (a) { return a ? esc(a.tool) + (a.model ? ':' + esc(a.model) : '') : '—'; };
      var steps = d.steps.map(function (st) {
        var verdict = st.verdict ? (st.verdict === 'approved' ? ' · APROVADO' : ' · MUDANÇAS') : '';
        return '<li data-run="' + esc(st.run_id || '') + '"><span>' + st.seq + '. ' + esc(ROLE_SHORT[st.role] || st.role) + ' · ' + esc(st.tool) +
          '</span><span class="run-status ' + esc(st.status) + '">' + esc(st.status) + verdict + '</span></li>' +
          (st.notes && st.verdict === 'changes' ? '<pre class="file">' + esc(st.notes) + '</pre>' : '') +
          (st.error ? '<p style="color:var(--danger);font-size:12px">' + esc(st.error) + '</p>' : '');
      }).join('');
      document.getElementById('fl-body').innerHTML =
        '<h2>🔗 ' + esc(f.id) + '</h2>' +
        '<div class="sub">' + esc(f.task_id) + ' · ' + esc(FLOW_STATUS[f.status] || f.status) + (f.error ? ' · ' + esc(f.error) : '') +
        '<br/>implementar ' + spec(f.plan.implement) + ' → revisar ' + spec(f.plan.review) + ' → corrigir ' + spec(f.plan.fix) +
        ' · até ' + f.rounds + ' revisão(ões) · aprovação: ' + esc(f.approve) + '</div>' +
        '<h3>Etapas (' + d.steps.length + ') — clique para a timeline</h3>' +
        (steps ? '<ul class="runs-list">' + steps + '</ul>' : '<p class="empty">nenhuma etapa ainda</p>');
      document.querySelectorAll('#fl-body .runs-list li').forEach(function (li) {
        if (li.dataset.run) li.addEventListener('click', function () { openTimeline(li.dataset.run); });
      });
      if (f.status === 'running') mine.timer = setTimeout(tick, 2000);
    } catch (err) {
      if (view === mine) document.getElementById('fl-body').innerHTML = '<p style="color:var(--danger)">' + esc(err.message) + '</p>';
    }
  };
  tick();
}

async function api(method, url, body) {
  var opts = { method: method, headers: {} };
  if (method !== 'GET') opts.headers['x-harness-token'] = CONTROL.token;
  if (body !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  var res = await fetch(url, opts);
  var data = await res.json().catch(function () { return { ok: false, error: 'resposta inválida (' + res.status + ')' }; });
  if (!res.ok || data.ok === false) throw new Error(data.error || ('erro ' + res.status));
  return data;
}

async function loadRuntimes() {
  if (runtimes) return runtimes;
  var data = await api('GET', '/api/runtimes');
  runtimes = data.runtimes || [];
  return runtimes;
}

async function openRunForm(taskId) {
  stopView();
  modalBox.innerHTML = '<p style="color:var(--muted)">verificando tools instaladas…</p>';
  modal.classList.add('open');
  var list;
  try { list = await loadRuntimes(); } catch (err) { modalBox.innerHTML = ''; closeModal(); return showToast(err.message); }
  var installed = list.filter(function (r) { return r.installed; });
  if (!installed.length) {
    modalBox.innerHTML = '<button class="close" onclick="closeModal()">✕</button><h2>Nenhuma tool de agente instalada</h2>' +
      '<p class="sub">Veja <code>harness runtimes</code> para instalar Claude Code, Codex, OpenCode ou Gemini CLI.</p>';
    return;
  }
  var opts = installed.map(function (r) {
    return '<option value="' + esc(r.tool) + '" data-unsafe="' + (r.requires_unsafe ? '1' : '') + '">' +
      esc(r.tool) + (r.version ? ' — ' + esc(r.version) : '') + (r.requires_unsafe ? ' (exige unsafe)' : '') + '</option>';
  }).join('');
  modalBox.innerHTML =
    '<button class="close" onclick="closeModal()">✕</button>' +
    '<h2>▶ Rodar agente</h2><div class="sub">' + esc(taskId) + ' · executa na worktree da task, com as regras do <code>harness run</code></div>' +
    '<form class="run-form" id="runForm">' +
      '<label for="f-tool">tool</label><select id="f-tool" name="tool">' + opts + '</select>' +
      '<label for="f-model">modelo (opcional)</label><input type="text" id="f-model" name="model" placeholder="padrão da tool" />' +
      '<label for="f-mode">permissões (claude)</label><select id="f-mode" name="permissionMode">' +
        '<option value="">acceptEdits (padrão)</option><option value="default">default</option><option value="plan">plan</option></select>' +
      '<label for="f-ctx">contexto (tokens)</label><input type="number" id="f-ctx" name="contextBudget" min="0" placeholder="padrão do harness.json (0 desliga)" />' +
      '<label>opções</label><div>' +
        '<label><input type="checkbox" id="f-budget" /> ignorar orçamento</label><br/>' +
        '<label><input type="checkbox" id="f-unsafe"' + (CONTROL.allowUnsafe ? '' : ' disabled') + ' /> unsafe (sem pedir permissões)</label>' +
      '</div>' +
      '<div class="full warn" id="f-warn">' + (CONTROL.allowUnsafe ? '' : 'unsafe desativado — suba com <code>harness serve --allow-unsafe</code> para liberar') + '</div>' +
      '<div class="full"><button class="go" type="submit">▶ Rodar</button></div>' +
    '</form>';
  var form = document.getElementById('runForm');
  var tool = document.getElementById('f-tool');
  var sync = function () {
    var needs = tool.selectedOptions[0] && tool.selectedOptions[0].dataset.unsafe === '1';
    document.getElementById('f-mode').disabled = tool.value !== 'claude';
    if (needs && CONTROL.allowUnsafe) document.getElementById('f-unsafe').checked = true;
    if (needs && !CONTROL.allowUnsafe) document.getElementById('f-warn').innerHTML = esc(tool.value) + ' exige unsafe — suba com <code>harness serve --allow-unsafe</code>';
  };
  tool.addEventListener('change', sync);
  sync();
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var body = { task: taskId, tool: tool.value };
    var model = document.getElementById('f-model').value.trim();
    if (model) body.model = model;
    var mode = document.getElementById('f-mode').value;
    if (mode && tool.value === 'claude') body.permissionMode = mode;
    var ctxv = document.getElementById('f-ctx').value;
    if (ctxv !== '') body.contextBudget = Number(ctxv);
    if (document.getElementById('f-budget').checked) body.ignoreBudget = true;
    if (document.getElementById('f-unsafe').checked) body.unsafe = true;
    form.querySelector('button[type=submit]').disabled = true;
    try {
      var data = await api('POST', '/api/runs', body);
      openTimeline(data.run.id);
      loadCanvas();
    } catch (err) {
      form.querySelector('button[type=submit]').disabled = false;
      showToast(err.message);
    }
  });
}

async function stopRun(runId) {
  if (!confirm('Parar ' + runId + '? O processo do agente é encerrado.')) return;
  try {
    await api('POST', '/api/runs/' + encodeURIComponent(runId) + '/stop');
    loadCanvas();
  } catch (err) { showToast(err.message); }
}

var EV_ICON = {
  'run.started': '▶', 'run.completed': '✔', 'run.failed': '✖', 'agent.message': '💬', 'agent.tool_call': '🔧',
  'agent.tool_result': '↳', 'agent.file_changed': '📝', 'agent.usage': '📊', 'agent.error': '⚠', 'quality.gate': '🧪'
};
function evText(e) {
  var p = e.payload || {};
  switch (e.type) {
    case 'run.started': return 'sessão ' + (p.session_id || 'n/d') + (p.model ? ' · ' + p.model : '');
    case 'run.completed': return 'concluído';
    case 'run.failed': return 'falhou: ' + (p.reason || '') + (p.detail ? ' — ' + p.detail : '');
    case 'agent.message': return p.text || '';
    case 'agent.tool_call':
      var i = p.input || {};
      return (p.name || 'tool') + ' ' + (i.command || i.file_path || i.filePath || i.path || i.pattern || '');
    case 'agent.tool_result': return (p.is_error ? 'erro: ' : '') + String(p.text || '').slice(0, 300);
    case 'agent.file_changed': return p.path || '';
    case 'agent.usage':
      var tin = p.input_tokens != null ? p.input_tokens : p.tokens_in;
      var tout = p.output_tokens != null ? p.output_tokens : p.tokens_out;
      return 'uso: ' + (tin != null ? tin : 'n/d') + ' / ' + (tout != null ? tout : 'n/d') + (p.cost_usd != null ? ' · $' + Number(p.cost_usd).toFixed(4) : '');
    case 'agent.error': return p.reason || '';
    case 'quality.gate': return 'gate ' + (p.gate || '') + ': ' + (p.status || '') + (p.reason ? ' (' + p.reason + ')' : '') + (p.status === 'failed' && p.output ? ' — ' + String(p.output).slice(-600) : '');
    default: return e.type;
  }
}
function evHtml(e) {
  var err = e.type === 'agent.error' || e.type === 'run.failed' || (e.type === 'agent.tool_result' && e.payload && e.payload.is_error) || (e.type === 'quality.gate' && e.payload && e.payload.status === 'failed');
  return '<li class="' + (err ? 'err' : '') + '"><span class="at">' + esc(new Date(e.at).toLocaleTimeString('pt-BR')) + '</span>' +
    '<span class="ic">' + (EV_ICON[e.type] || '·') + '</span><span class="tx">' + esc(evText(e)) + '</span></li>';
}

function stopView() {
  if (view && view.timer) clearTimeout(view.timer);
  view = null;
}

function timelineHead(r) {
  var status = RUN_STATUS[r.status] || r.status;
  var stop = r.status === 'running'
    ? ' <button class="stop" data-stop-run="' + esc(r.id) + '">■ Parar</button>' : '';
  return '<h2>📜 ' + esc(r.id) + '</h2>' +
    '<div class="sub">' + esc(r.task_id) + ' · 🤖 ' + esc(r.tool) + (r.model ? ' · ' + esc(r.model) : '') +
    (r.unsafe ? ' · ⚠️ unsafe' : '') + '<br/><span class="run-status ' + esc(r.status) + '">' + esc(status) + '</span>' +
    ' · ' + esc(fmtUsage(r)) + ' · ' + esc(fmtDur(r.duration_ms)) + (r.error ? ' · ' + esc(r.error) : '') + stop + '</div>';
}

async function openTimeline(runId) {
  stopView();
  var mine = { runId: runId, seq: 0, timer: null };
  view = mine;
  modalBox.innerHTML = '<button class="close" onclick="closeModal()">✕</button><div id="tl-head"><p style="color:var(--muted)">carregando…</p></div><ul class="live" id="tl-list"></ul>';
  modal.classList.add('open');
  var tick = async function () {
    if (view !== mine) return;
    try {
      var data = await api('GET', '/api/runs/' + encodeURIComponent(runId) + '?after=' + mine.seq);
      if (view !== mine) return;
      var head = document.getElementById('tl-head');
      head.innerHTML = timelineHead(data.run);
      var sb = head.querySelector('[data-stop-run]');
      if (sb) sb.addEventListener('click', function () { stopRun(sb.dataset.stopRun); });
      var list = document.getElementById('tl-list');
      var stick = list.scrollTop + list.clientHeight >= list.scrollHeight - 20;
      list.insertAdjacentHTML('beforeend', data.events.map(evHtml).join(''));
      if (stick) list.scrollTop = list.scrollHeight;
      mine.seq = data.last_seq;
      if (data.run.status === 'running') mine.timer = setTimeout(tick, 1500);
      else loadCanvas();
    } catch (err) {
      if (view === mine) document.getElementById('tl-head').innerHTML = '<p style="color:var(--danger)">' + esc(err.message) + '</p>';
    }
  };
  tick();
}

async function runsSection(taskId) {
  if (!CONTROL.enabled) return '';
  try {
    var data = await api('GET', '/api/runs?task=' + encodeURIComponent(taskId) + '&limit=10');
    if (!data.runs.length) return '<h3>Execuções</h3><p class="empty">nenhum run de agente</p>';
    return '<h3>Execuções (' + data.runs.length + ')</h3><ul class="runs-list">' + data.runs.map(function (r) {
      return '<li data-run="' + esc(r.id) + '"><span>' + esc(r.id) + ' · ' + esc(r.tool) + '</span><span class="run-status ' + esc(r.status) + '">' +
        esc(RUN_STATUS[r.status] || r.status) + ' · ' + esc(fmtUsage(r)) + '</span></li>';
    }).join('') + '</ul>';
  } catch (err) { return '<h3>Execuções</h3><p class="empty">' + esc(err.message) + '</p>'; }
}

/* ---------- detalhes (modal do board, mesmos endpoints) ---------- */
function attachCardClicks() {
  document.querySelectorAll('#canvas-grid .card').forEach(function (card) {
    card.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (btn) {
        e.stopPropagation();
        if (btn.dataset.act === 'run') return openRunForm(btn.dataset.task);
        if (btn.dataset.act === 'stop') return stopRun(btn.dataset.run);
        if (btn.dataset.act === 'timeline') return openTimeline(btn.dataset.run);
        if (btn.dataset.act === 'flow') return openFlowForm(btn.dataset.task);
        if (btn.dataset.act === 'flow-resume') return openResumeForm(btn.dataset.flow);
        if (btn.dataset.act === 'flow-stop') return stopFlowUi(btn.dataset.flow);
        if (btn.dataset.act === 'flow-show') return openFlow(btn.dataset.flow);
        if (btn.dataset.act === 'comp') return openCompForm(btn.dataset.task);
        if (btn.dataset.act === 'comp-show') return openComp(btn.dataset.comp);
        if (btn.dataset.act === 'comp-discard') return discardCompUi(btn.dataset.comp);
        return;
      }
      openDetail(card.dataset.id, card.dataset.project);
    });
  });
}

async function openDetail(id, project) {
  stopView();
  modalBox.innerHTML = '<p style="color:var(--muted)">carregando detalhes...</p>';
  modal.classList.add('open');
  try {
    var res = await fetch('/api/tasks/' + encodeURIComponent(id) + '/detail?project=' + encodeURIComponent(project));
    var data = await res.json();
    if (!data.ok) throw new Error(data.error || 'erro ao carregar');
    renderDetail(data);
    if (CONTROL.enabled && !project) {
      var extra = await runsSection(id);
      if (!modal.classList.contains('open') || view) return;
      modalBox.insertAdjacentHTML('beforeend', extra);
      modalBox.querySelectorAll('.runs-list li').forEach(function (li) {
        li.addEventListener('click', function () { openTimeline(li.dataset.run); });
      });
    }
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
  stopView();
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