/**
 * Driver Claude Code (task 94).
 *
 * Modo não interativo com saída JSON por linha — conferido em 2026-11-20 em
 * https://code.claude.com/docs/en/headless :
 *   claude -p --output-format stream-json --verbose [--model m] [--permission-mode p]
 * O prompt vai por stdin (sem interpolação em shell; sem limite de argv no Windows).
 * Mensagens: `system/init` (session_id, model), `assistant` (content: text/tool_use),
 * `user` (content: tool_result), `result` (is_error, usage, total_cost_usd, session_id).
 * Campo/tipo desconhecido nunca quebra: vira `agent.message` com o evento em `native`.
 */

export const id = 'claude'
export const bin = 'claude'
export const installHint =
  'instale o Claude Code (https://code.claude.com/docs) — ex.: npm install -g @anthropic-ai/claude-code — e autentique rodando `claude` uma vez.'

export const PERMISSION_MODES = ['default', 'acceptEdits', 'plan']

// Tools do Claude Code que alteram arquivos → também viram `agent.file_changed`.
const FILE_TOOLS = { Edit: 'file_path', Write: 'file_path', MultiEdit: 'file_path', NotebookEdit: 'notebook_path' }

const MAX_TEXT = 4000
const clip = (s) => (typeof s === 'string' && s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + '…' : s)

export function command({ model = null, permissionMode = 'acceptEdits', unsafe = false } = {}) {
  const args = ['-p', '--output-format', 'stream-json', '--verbose']
  if (model) args.push('--model', model)
  if (unsafe) {
    args.push('--permission-mode', 'bypassPermissions')
  } else {
    if (!PERMISSION_MODES.includes(permissionMode)) {
      throw new Error(`--permission-mode inválido: ${permissionMode} (use: ${PERMISSION_MODES.join(' | ')}; bypass só com --unsafe)`)
    }
    args.push('--permission-mode', permissionMode)
  }
  return args
}

function toolResultText(content) {
  if (typeof content === 'string') return clip(content)
  if (Array.isArray(content)) {
    return clip(content.map((c) => (typeof c === 'string' ? c : c?.text ?? '')).filter(Boolean).join('\n'))
  }
  return null
}

function usageOf(obj) {
  const u = obj.usage ?? {}
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const parts = [u.input_tokens, u.cache_creation_input_tokens, u.cache_read_input_tokens].map(num)
  const tokensIn = parts.every((p) => p === null) ? null : parts.reduce((a, b) => a + (b ?? 0), 0)
  return {
    tokensIn,
    tokensOut: num(u.output_tokens),
    costUsd: num(obj.total_cost_usd),
    breakdown: {
      input_tokens: num(u.input_tokens),
      cache_creation_input_tokens: num(u.cache_creation_input_tokens),
      cache_read_input_tokens: num(u.cache_read_input_tokens),
      output_tokens: num(u.output_tokens)
    }
  }
}

export function normalize(obj) {
  const events = []
  const meta = {}

  if (obj?.type === 'system' && obj.subtype === 'init') {
    meta.sessionId = obj.session_id ?? null
    meta.model = obj.model ?? null
    events.push({
      type: 'run.started',
      payload: { session_id: obj.session_id ?? null, model: obj.model ?? null, cwd: obj.cwd ?? null, tools: Array.isArray(obj.tools) ? obj.tools.length : null },
      native: obj
    })
    return { events, meta }
  }

  if (obj?.type === 'assistant' && Array.isArray(obj.message?.content)) {
    for (const part of obj.message.content) {
      if (part?.type === 'text' && part.text) {
        events.push({ type: 'agent.message', payload: { text: clip(part.text) }, native: part })
      } else if (part?.type === 'tool_use') {
        events.push({ type: 'agent.tool_call', payload: { id: part.id ?? null, name: part.name ?? null, input: part.input ?? null }, native: part })
        const key = FILE_TOOLS[part.name]
        const file = key ? part.input?.[key] : null
        if (file) events.push({ type: 'agent.file_changed', payload: { path: file, tool: part.name }, native: null })
      }
      // `thinking` e outros blocos: preservados no native do próprio assistant abaixo se nada foi emitido.
    }
    if (events.length === 0) events.push({ type: 'agent.message', payload: { text: null }, native: obj })
    return { events, meta }
  }

  if (obj?.type === 'user' && Array.isArray(obj.message?.content)) {
    for (const part of obj.message.content) {
      if (part?.type === 'tool_result') {
        events.push({
          type: 'agent.tool_result',
          payload: { tool_use_id: part.tool_use_id ?? null, is_error: Boolean(part.is_error), text: toolResultText(part.content) },
          native: null
        })
      }
    }
    if (events.length === 0) events.push({ type: 'agent.message', payload: { text: null }, native: obj })
    return { events, meta }
  }

  if (obj?.type === 'result') {
    const usage = usageOf(obj)
    meta.sessionId = obj.session_id ?? null
    meta.usage = { tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, costUsd: usage.costUsd }
    const ok = !obj.is_error && (obj.subtype ?? 'success') === 'success'
    meta.final = { ok, reason: ok ? null : `claude: ${obj.subtype ?? 'erro'}` }
    events.push({
      type: 'agent.usage',
      payload: { ...usage.breakdown, cost_usd: usage.costUsd, num_turns: obj.num_turns ?? null, duration_ms: obj.duration_ms ?? null, measured: true },
      native: obj
    })
    if (obj.result) events.push({ type: 'agent.message', payload: { text: clip(obj.result), final: true }, native: null })
    if (!ok) events.push({ type: 'agent.error', payload: { reason: obj.subtype ?? 'erro' }, native: null })
    return { events, meta }
  }

  return { events: [{ type: 'agent.message', payload: { text: null }, native: obj }], meta }
}

/**
 * Instância com estado por run (task 107): além do `normalize` acima, reporta uso PARCIAL a
 * partir de `assistant.message.usage` — cada mensagem da API aparece em várias linhas (uma por
 * bloco de conteúdo) com o mesmo `message.id`, então o uso é guardado por id (o último visto
 * vale) e somado entre ids. Serve para cortar o run por orçamento; o `result` final prevalece.
 */
export function create() {
  const perMessage = new Map()
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  function normalizeWithPartial(obj) {
    const out = normalize(obj)
    const msg = obj?.type === 'assistant' ? obj.message : null
    if (msg?.usage && msg.id) {
      const u = msg.usage
      perMessage.set(msg.id, {
        in: num(u.input_tokens) + num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens),
        out: num(u.output_tokens)
      })
      let tin = 0
      let tout = 0
      for (const v of perMessage.values()) {
        tin += v.in
        tout += v.out
      }
      out.meta = { ...(out.meta ?? {}), partialUsage: { tokensIn: tin, tokensOut: tout, costUsd: null } }
    }
    return out
  }
  return { id, bin, installHint, command, normalize: normalizeWithPartial }
}
