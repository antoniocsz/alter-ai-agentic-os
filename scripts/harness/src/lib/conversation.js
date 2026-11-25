/**
 * Conversa contínua (feature `conversa-continua`, task 139).
 *
 * Um run pode CONTINUAR a sessão do agente de um run anterior da mesma task: a tool retoma a
 * sessão pelo id que ela mesma reportou (claude `--resume`, codex `exec resume`, opencode
 * `--session`) e recebe só a mensagem do humano. O novo run aponta para o anterior
 * (`runs.parent_run_id`) e abre a timeline com `user.message`.
 *
 * Regras: só runs da worktree da task (não candidatas de competição); nunca revisor nem juiz
 * (rodaram só leitura — continuar daria escrita à mesma sessão); run anterior terminado e com
 * sessão registrada; tool com `supportsResume`.
 */
import { getRun, runEvents } from './runs.js'

export const MAX_MESSAGE = 20000

export class ConversationError extends Error {}

/** Mensagem do humano: texto não vazio, até MAX_MESSAGE caracteres. */
export function validateMessage(message) {
  if (typeof message !== 'string' || !message.trim()) {
    throw new ConversationError('mensagem obrigatória para continuar a conversa (ex.: --message "ajuste o teste")')
  }
  if (message.length > MAX_MESSAGE) throw new ConversationError(`mensagem longa demais (${message.length} > ${MAX_MESSAGE} caracteres)`)
  return message.trim()
}

function readOnlyRole(db, runId) {
  try {
    if (db.prepare("SELECT 1 FROM flow_steps WHERE run_id = ? AND role = 'review'").get(runId)) return 'revisor'
  } catch {}
  try {
    if (db.prepare('SELECT 1 FROM competitions WHERE judge_run_id = ?').get(runId)) return 'juiz'
  } catch {}
  return null
}

/**
 * Run a continuar. `from` = id do run, ou null/true = o último run da task que tenha sessão.
 * `wtDir` = worktree da task (a continuação roda lá). Lança ConversationError acionável.
 */
export function resolveContinuation(db, taskId, from, wtDir) {
  let run
  if (from && from !== true) {
    run = getRun(db, String(from))
    if (!run) throw new ConversationError(`run não encontrado: ${from}`)
    if (run.task_id !== taskId) throw new ConversationError(`o run ${run.id} é da task ${run.task_id}, não de ${taskId}`)
  } else {
    run = db
      .prepare("SELECT * FROM runs WHERE task_id = ? AND session_id IS NOT NULL AND session_id <> '' ORDER BY started_at DESC, rowid DESC LIMIT 1")
      .get(taskId)
    if (!run) throw new ConversationError(`nenhum run com sessão para continuar em ${taskId} — rode antes: harness run ${taskId} --tool <tool>`)
  }
  if (run.status === 'running') throw new ConversationError(`o run ${run.id} ainda está rodando — espere terminar ou pare com: harness run --stop ${run.id}`)
  if (!run.session_id) throw new ConversationError(`o run ${run.id} não registrou sessão da tool (${run.tool}) — não dá para continuar`)
  const role = readOnlyRole(db, run.id)
  if (role) throw new ConversationError(`o run ${run.id} foi do ${role} (só leitura) — continue um run de implementação ou correção`)
  if (wtDir && run.cwd && normalizePath(run.cwd) !== normalizePath(wtDir)) {
    throw new ConversationError(`o run ${run.id} rodou fora da worktree da task (${run.cwd}) — só runs da worktree da task podem ser continuados`)
  }
  return run
}

const normalizePath = (p) => String(p).replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase()

/** Prompt da continuação: lembrete curto das regras + a mensagem do humano. A sessão já tem a task. */
export function buildContinuePrompt(taskId, message) {
  return [
    `(Continuação da task ${taskId} pelo harness. As regras do início desta sessão continuam valendo:`,
    'toque só os arquivos do "## Escopo"; não rode finish, merge, push nem git que reescreva histórico;',
    'não mexa em tasks/ nem no status.md. Ao terminar, responda com um resumo curto.)',
    '',
    '--- MENSAGEM DO HUMANO ---',
    message
  ].join('\n')
}

const CONVERSATION_EVENTS = new Set(['user.message', 'agent.message', 'agent.tool_call', 'agent.file_changed', 'agent.error', 'quality.gate', 'run.completed', 'run.failed'])

/**
 * Conversa da task: runs em ordem, cada um com `parent_run_id` e os eventos que importam para a
 * leitura (mensagens, ações, arquivos, erros, gates, fim). Mensagens vazias (eventos nativos
 * preservados sem texto) ficam de fora. `limit` = últimos N runs.
 */
export function conversationOf(db, taskId, { limit = 30 } = {}) {
  const runs = db
    .prepare('SELECT * FROM runs WHERE task_id = ? ORDER BY started_at DESC, rowid DESC LIMIT ?')
    .all(taskId, limit)
    .reverse()
  return runs.map((run) => {
    const events = runEvents(db, run.id)
      .filter((e) => CONVERSATION_EVENTS.has(e.type))
      .filter((e) => e.type !== 'agent.message' || (e.payload?.text && !e.payload?.reasoning))
      .map((e) => ({ seq: e.seq, at: e.at, type: e.type, payload: e.payload }))
    return {
      id: run.id,
      parent_run_id: run.parent_run_id ?? null,
      tool: run.tool,
      model: run.model,
      session_id: run.session_id,
      status: run.status,
      started_at: run.started_at,
      finished_at: run.finished_at,
      tokens_in: run.tokens_in,
      tokens_out: run.tokens_out,
      cost_usd: run.cost_usd,
      quality: run.quality ?? null,
      can_continue: run.status !== 'running' && Boolean(run.session_id) && !readOnlyRole(db, run.id),
      events
    }
  })
}
