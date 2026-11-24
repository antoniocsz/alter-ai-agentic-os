/**
 * Driver Gemini CLI (task 109).
 *
 * Modo não interativo: stdin não-TTY (o harness sempre usa pipe) + `--output-format stream-json`.
 * O prompt vai pelo stdin (sem interpolação em shell), como nos outros drivers. Conferido em
 * 2026-11-24 na doc oficial (docs/cli/headless.md: tipos de evento e exit codes 0/1/42/53) e no
 * código do Gemini CLI (packages/cli/src/nonInteractiveCli.ts: campos dos eventos):
 *   gemini --output-format stream-json --approval-mode <auto_edit|yolo> [--model m]
 * Eventos JSONL:
 *   init {session_id, model} · message {role, content, delta?} · tool_use {tool_name, tool_id,
 *   parameters} · tool_result {tool_id, status, output?, error{type,message}?} ·
 *   error {severity, message} · result {status, error?, stats{total_tokens, input_tokens,
 *   output_tokens, cached, ...}}
 * O Gemini não reporta custo em USD → costUsd null (nunca estimado). Uso só no `result`.
 */

export const id = 'gemini'
export const bin = 'gemini'
export const installHint =
  'instale o Gemini CLI (https://geminicli.com) — ex.: npm install -g @google/gemini-cli — e autentique rodando `gemini` uma vez.'

const MAX_TEXT = 4000
const clip = (s) => (typeof s === 'string' && s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + '…' : s)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// Tools do Gemini CLI que alteram arquivos → também viram `agent.file_changed`.
const FILE_TOOLS = new Set(['write_file', 'replace', 'edit'])

export function command({ model = null, unsafe = false } = {}) {
  const args = ['--output-format', 'stream-json', '--approval-mode', unsafe ? 'yolo' : 'auto_edit']
  if (model) args.push('--model', model)
  return args
}

/** Instância com estado por run: acumula os pedaços (`delta`) de texto do assistente. */
export function create() {
  let pending = null // { text, natives: [] }

  const flush = () => {
    if (!pending) return []
    const ev = { type: 'agent.message', payload: { text: clip(pending.text) }, native: pending.natives.length === 1 ? pending.natives[0] : { deltas: pending.natives.length } }
    pending = null
    return [ev]
  }

  function normalize(obj) {
    const type = obj?.type

    // Pedaços de texto do assistente: acumula até chegar outra coisa.
    if (type === 'message' && obj.role === 'assistant' && obj.delta) {
      pending ??= { text: '', natives: [] }
      pending.text += String(obj.content ?? '')
      pending.natives.push(obj)
      return { events: [] }
    }

    const events = flush()

    if (type === 'init') {
      events.push({ type: 'run.started', payload: { session_id: obj.session_id ?? null, model: obj.model ?? null }, native: obj })
      return { events, meta: { sessionId: obj.session_id ?? null, model: obj.model ?? null } }
    }
    if (type === 'message') {
      // Mensagem do usuário é o eco do prompt: preservada, sem texto (não polui o resumo).
      if (obj.role === 'user') events.push({ type: 'agent.message', payload: { text: null, role: 'user' }, native: obj })
      else events.push({ type: 'agent.message', payload: { text: clip(obj.content ?? null) }, native: obj })
      return { events }
    }
    if (type === 'tool_use') {
      const params = obj.parameters ?? null
      events.push({ type: 'agent.tool_call', payload: { id: obj.tool_id ?? null, name: obj.tool_name ?? null, input: params }, native: obj })
      const file = params?.file_path ?? params?.path ?? null
      if (FILE_TOOLS.has(obj.tool_name) && file) events.push({ type: 'agent.file_changed', payload: { path: file, tool: obj.tool_name }, native: null })
      return { events }
    }
    if (type === 'tool_result') {
      const isError = obj.status === 'error'
      events.push({
        type: 'agent.tool_result',
        payload: { tool_use_id: obj.tool_id ?? null, is_error: isError, text: clip(isError ? obj.error?.message ?? null : obj.output ?? null) },
        native: obj
      })
      return { events }
    }
    if (type === 'error') {
      events.push({ type: 'agent.error', payload: { reason: obj.message ?? 'erro', severity: obj.severity ?? null }, native: obj })
      return { events }
    }
    if (type === 'result') {
      const st = obj.stats ?? {}
      const tokensIn = num(st.input_tokens)
      const tokensOut = num(st.output_tokens)
      const ok = (obj.status ?? 'success') === 'success'
      events.push({
        type: 'agent.usage',
        payload: { input_tokens: tokensIn, output_tokens: tokensOut, total_tokens: num(st.total_tokens), cached: num(st.cached), cost_usd: null, measured: true },
        native: obj
      })
      if (!ok) events.push({ type: 'agent.error', payload: { reason: obj.error?.message ?? 'result: error' }, native: null })
      const meta = { final: { ok, reason: ok ? null : `gemini: ${obj.error?.message ?? 'erro'}` } }
      if (tokensIn !== null || tokensOut !== null) meta.usage = { tokensIn, tokensOut, costUsd: null }
      return { events, meta }
    }
    events.push({ type: 'agent.message', payload: { text: null }, native: obj })
    return { events }
  }

  return { id, bin, installHint, command, normalize }
}
