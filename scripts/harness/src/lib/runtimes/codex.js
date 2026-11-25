/**
 * Driver Codex CLI (task 96).
 *
 * Conferido em 2026-11-21 em https://learn.chatgpt.com/docs/non-interactive-mode.md
 * (antes developers.openai.com/codex/noninteractive):
 *   codex exec --json --sandbox <workspace-write|danger-full-access> [--model m] -
 * `-` = prompt inteiro pelo stdin. `--full-auto` não é mais suportado; a escrita é
 * liberada por `--sandbox workspace-write` (padrão do harness; read-only não deixaria o
 * agente editar a worktree). `danger-full-access` só com `--unsafe`.
 * Eventos JSONL: thread.started {thread_id}, turn.started, turn.completed {usage:
 * input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens},
 * turn.failed, item.started|updated|completed {item: {id, type, ...}}, error.
 * Item types: agent_message, reasoning, command_execution, file_change, mcp_tool_call,
 * web_search, todo_list/plan, error.
 *
 * Eventos só de ciclo de vida sem conteúdo (turn.started) não viram registro;
 * tipo/item desconhecido vira `agent.message` com o evento original em `native`.
 * O Codex não reporta custo em USD → `costUsd` fica null (nunca estimado).
 */

export const id = 'codex'
export const bin = 'codex'
export const installHint = 'instale o Codex CLI (https://developers.openai.com/codex) — ex.: npm install -g @openai/codex — e autentique rodando `codex` uma vez.'

const MAX_TEXT = 4000
const clip = (s) => (typeof s === 'string' && s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + '…' : s)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function command({ model = null, unsafe = false, readOnly = false } = {}) {
  // readOnly (revisor da orquestração encadeada, task 121): sandbox só de leitura.
  const args = ['exec', '--json', '--sandbox', unsafe ? 'danger-full-access' : readOnly ? 'read-only' : 'workspace-write']
  if (model) args.push('--model', model)
  args.push('-')
  return args
}

/** Instância com estado por run (uso acumulado entre turnos). */
export function create() {
  const total = { input: null, output: null }
  const add = (key, v) => {
    if (v === null) return
    total[key] = (total[key] ?? 0) + v
  }

  function itemEvents(phase, item, obj) {
    const t = item?.type
    if (t === 'agent_message') {
      return phase === 'completed' ? [{ type: 'agent.message', payload: { text: clip(item.text ?? null) }, native: obj }] : []
    }
    if (t === 'reasoning') {
      return phase === 'completed' ? [{ type: 'agent.message', payload: { text: clip(item.text ?? null), reasoning: true }, native: obj }] : []
    }
    if (t === 'command_execution') {
      if (phase === 'started') {
        return [{ type: 'agent.tool_call', payload: { id: item.id ?? null, name: 'shell', input: { command: item.command ?? null } }, native: obj }]
      }
      if (phase === 'completed') {
        const failed = item.status === 'failed' || (typeof item.exit_code === 'number' && item.exit_code !== 0)
        return [{
          type: 'agent.tool_result',
          payload: { tool_use_id: item.id ?? null, is_error: failed, exit_code: item.exit_code ?? null, text: clip(item.aggregated_output ?? null) },
          native: obj
        }]
      }
      return []
    }
    if (t === 'file_change') {
      if (phase !== 'completed') return []
      const changes = Array.isArray(item.changes) ? item.changes : []
      if (changes.length === 0) return [{ type: 'agent.message', payload: { text: null }, native: obj }]
      return changes.map((c, i) => ({ type: 'agent.file_changed', payload: { path: c.path ?? null, kind: c.kind ?? null, tool: 'codex' }, native: i === 0 ? obj : null }))
    }
    if (t === 'mcp_tool_call') {
      if (phase === 'started') {
        return [{ type: 'agent.tool_call', payload: { id: item.id ?? null, name: `${item.server ?? 'mcp'}.${item.tool ?? '?'}`, input: item.arguments ?? null }, native: obj }]
      }
      if (phase === 'completed') {
        return [{ type: 'agent.tool_result', payload: { tool_use_id: item.id ?? null, is_error: item.status === 'failed', text: clip(item.error?.message ?? null) }, native: obj }]
      }
      return []
    }
    if (t === 'web_search') {
      return phase === 'started' || phase === 'completed'
        ? [{ type: phase === 'started' ? 'agent.tool_call' : 'agent.tool_result', payload: phase === 'started' ? { id: item.id ?? null, name: 'web_search', input: { query: item.query ?? null } } : { tool_use_id: item.id ?? null, is_error: false, text: null }, native: obj }]
        : []
    }
    if (t === 'error') {
      return [{ type: 'agent.error', payload: { reason: item.message ?? 'erro' }, native: obj }]
    }
    // todo_list / plan e tipos futuros: preservados (só na conclusão/atualização para não duplicar)
    return phase === 'started' ? [] : [{ type: 'agent.message', payload: { text: null, item_type: t ?? null }, native: obj }]
  }

  function normalize(obj) {
    const type = obj?.type
    if (type === 'thread.started') {
      return { events: [{ type: 'run.started', payload: { session_id: obj.thread_id ?? null }, native: obj }], meta: { sessionId: obj.thread_id ?? null } }
    }
    if (type === 'turn.started') return { events: [] }
    if (type === 'turn.completed') {
      const u = obj.usage ?? {}
      add('input', num(u.input_tokens))
      add('output', num(u.output_tokens))
      return {
        events: [{
          type: 'agent.usage',
          payload: {
            input_tokens: num(u.input_tokens),
            cached_input_tokens: num(u.cached_input_tokens),
            output_tokens: num(u.output_tokens),
            reasoning_output_tokens: num(u.reasoning_output_tokens),
            cost_usd: null,
            measured: true
          },
          native: obj
        }],
        meta: { usage: { tokensIn: total.input, tokensOut: total.output, costUsd: null }, final: { ok: true, reason: null } }
      }
    }
    if (type === 'turn.failed') {
      const reason = obj.error?.message ?? 'turn.failed'
      return { events: [{ type: 'agent.error', payload: { reason }, native: obj }], meta: { final: { ok: false, reason: `codex: ${reason}` } } }
    }
    if (type === 'error') {
      // Pode ser transitório (reconexão); o desfecho vem de turn.* e do exit code.
      return { events: [{ type: 'agent.error', payload: { reason: obj.message ?? 'erro' }, native: obj }] }
    }
    const m = typeof type === 'string' ? type.match(/^item\.(started|updated|completed)$/) : null
    if (m) {
      const events = itemEvents(m[1], obj.item, obj)
      return { events }
    }
    return { events: [{ type: 'agent.message', payload: { text: null }, native: obj }] }
  }

  return { id, bin, installHint, command, normalize }
}
