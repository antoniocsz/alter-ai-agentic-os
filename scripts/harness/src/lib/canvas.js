import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { tryOpenDb, boardQuery, syncFromMarkdown, taskHistory, taskFromMarkdown } from './db.js'
import { readRegistry, currentBranch } from './worktree.js'
import { activeDir, listTasks, norm } from './tasks.js'
import { latestRun } from './runs.js'

// Staleness (AC-4): sem evento/interação nova neste intervalo → cartão stale.
export const STALE_MS = 15 * 60 * 1000

// Timeout defensivo: worktree enorme/travada não pode encostar o serve (fallback "n/d").
const GIT_TIMEOUT_MS = 2000

function gitStatusCount(dir) {
  if (!fs.existsSync(dir)) return null
  try {
    const out = execFileSync(
      'git',
      ['-c', 'core.quotePath=false', 'status', '--porcelain'],
      { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: GIT_TIMEOUT_MS }
    )
    return out.split('\n').filter(Boolean).length
  } catch {
    return 'n/d' // não-repo, timeout ou erro de git
  }
}

// Worktree registrada e presente no disco; caso contrário degrada para a raiz.
function worktreeOf(root, id, reg) {
  const entry = reg.worktrees.find((w) => w.task === id)
  const dir = entry ? path.join(root, entry.path) : null
  if (entry && fs.existsSync(dir)) {
    return { worktree: norm(entry.path), branch: entry.branch, dir }
  }
  let branch = null
  try {
    branch = currentBranch(root)
  } catch {}
  return { worktree: 'raiz', branch, dir: root }
}

const oneLine = (s, max = 140) => {
  const text = String(s ?? '').replace(/\s+/g, ' ').trim()
  return text.length > max ? text.slice(0, max) + '…' : text
}

/** Resumo legível de um run_event `agent.*` para o cartão (sem recomputar na UI). */
export function summarizeAgentEvent(type, payload) {
  const p = payload && typeof payload === 'object' ? payload : { text: payload }
  switch (type) {
    case 'agent.message':
      return oneLine(p.text) || 'mensagem'
    case 'agent.tool_call': {
      const arg = p.input?.command ?? p.input?.file_path ?? p.input?.path ?? p.input?.pattern ?? ''
      return oneLine(`${p.name ?? 'ferramenta'}${arg ? ` ${arg}` : ''}`)
    }
    case 'agent.tool_result':
      return p.is_error ? `erro de ferramenta: ${oneLine(p.text, 100)}` : 'resultado de ferramenta'
    case 'agent.file_changed':
      return `alterou ${oneLine(p.path)}`
    case 'agent.usage':
      return 'uso reportado'
    case 'agent.error':
      return `erro: ${oneLine(p.reason)}`
    default:
      return oneLine(type)
  }
}

/**
 * Run mais recente da task (feature execucao-agentes, task 95): tool, status, último
 * evento do agente e uso. Tokens/custo só quando o runtime reportou (`measured`);
 * caso contrário ficam `null` e a UI mostra "n/d". Leitura pura — o canvas não marca
 * órfãos (`harness runs` faz isso).
 */
function runFor(db, taskId) {
  let run
  try {
    run = latestRun(db, taskId)
  } catch {
    return { run: null, lastAt: null } // banco antigo sem a tabela runs
  }
  if (!run) return { run: null, lastAt: null }
  const last = db.prepare('SELECT at FROM run_events WHERE run_id = ? ORDER BY seq DESC LIMIT 1').get(run.id)
  const agent = db
    .prepare("SELECT type, at, payload_json FROM run_events WHERE run_id = ? AND type LIKE 'agent.%' AND type <> 'agent.usage' ORDER BY seq DESC LIMIT 1")
    .get(run.id)
  let payload = null
  try {
    payload = agent?.payload_json ? JSON.parse(agent.payload_json) : null
  } catch {}
  return {
    run: {
      id: run.id,
      tool: run.tool,
      model: run.model,
      status: run.status,
      started_at: run.started_at,
      finished_at: run.finished_at,
      last_agent_event: agent ? { type: agent.type, summary: summarizeAgentEvent(agent.type, payload), at: agent.at } : null,
      tokens_in: run.tokens_in,
      tokens_out: run.tokens_out,
      cost_usd: run.cost_usd,
      measured: Boolean(run.measured),
      unsafe: Boolean(run.unsafe)
    },
    lastAt: last?.at ?? run.started_at
  }
}

function cardFor(t, proj, root, reg, db, now) {
  const wt = worktreeOf(root, t.id, reg)
  const history = db ? taskHistory(db, t.id) : { events: [], interactions: [] }
  const lastEvent = history.events.at(-1) ?? null
  const lastNote = history.interactions.filter((i) => i.kind === 'note').at(-1) ?? null
  const { run, lastAt: lastRunAt } = db ? runFor(db, t.id) : { run: null, lastAt: null }

  // Valores são ISO normalizados do harness → comparação lexical vale como max().
  const activity = [t.started_at, lastEvent?.at, lastNote?.at, lastRunAt].filter(Boolean)
  const lastActivityAt = activity.length ? activity.reduce((a, b) => (b > a ? b : a)) : null
  const startedMs = t.started_at ? Date.parse(t.started_at) : NaN

  return {
    id: t.id,
    title: t.title,
    agent: t.agent,
    project: proj.name || null,
    worktree: wt.worktree,
    branch: wt.branch,
    started_at: t.started_at ?? null,
    running_ms: Number.isFinite(startedMs) ? now - startedMs : null,
    changed_files: gitStatusCount(wt.dir),
    last_event: lastEvent
      ? { event: lastEvent.event, message: lastEvent.message, at: lastEvent.at }
      : null,
    last_note: lastNote ? { content: lastNote.content, at: lastNote.at } : null,
    run,
    last_activity_at: lastActivityAt,
    // Sem atividade alguma (db indisponível) → nada julgado, cartão normal.
    stale: lastActivityAt !== null && now - Date.parse(lastActivityAt) > STALE_MS
  }
}

/**
 * Estado "ao vivo" do canvas: um cartão por task em execução (coluna active),
 * com dados pré-computados (staleness, tempo, contagem) para a UI não recomputar.
 * Degradação graciosa: db indisponível → só markdown + git; worktree registrada
 * mas ausente no disco → raiz (campos de destaque ficam "n/d" conforme o payload).
 */
export function canvasState(ctx) {
  const now = Date.now()
  const cards = []
  for (const proj of ctx.projects) {
    const root = proj.root
    const reg = readRegistry(root)
    const db = tryOpenDb(root)
    if (db) {
      try {
        // markdown é a fonte da verdade — mesma diretriz do buildBoard
        syncFromMarkdown(db, root)
        for (const t of boardQuery(db).active) {
          cards.push(cardFor(t, proj, root, reg, db, now))
        }
      } finally {
        db.close()
      }
    } else {
      const dir = activeDir(root)
      for (const name of listTasks(dir)) {
        cards.push(cardFor(taskFromMarkdown(dir, name), proj, root, reg, null, now))
      }
    }
  }
  return { generated_at: new Date(now).toISOString(), canvas: cards }
}
