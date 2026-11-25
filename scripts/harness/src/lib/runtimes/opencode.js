/**
 * Driver OpenCode (task 96).
 *
 * Conferido em 2026-11-21: https://opencode.ai/docs/cli (`opencode run`, `--format json`
 * = eventos JSON brutos, `--model provider/model`) e o código de `run.ts` (sem mensagem
 * posicional e stdin não-TTY → o prompt é lido do stdin).
 *   opencode run --format json [--model provider/model]
 * NDJSON: { type, timestamp, sessionID, part|error } com type em
 *   step_start · text {part.text} · tool_use {part: {tool, callID, state: {status, input,
 *   output, error}}} · step_finish {part: {reason, cost, tokens: {input, output,
 *   reasoning, cache: {read, write}}}} · error {error}.
 * Uso e custo vêm por passo (`step_finish`) e são somados no run.
 *
 * O `opencode run` pode aprovar permissões automaticamente (depende da versão/config);
 * por isso o harness exige `--unsafe` explícito para esta tool (`requiresUnsafe`).
 * Passos subsequentes (`step_start` depois do primeiro) não viram registro.
 */

export const id = 'opencode'
export const bin = 'opencode'
export const installHint = 'instale o OpenCode (https://opencode.ai/docs) — ex.: npm install -g opencode-ai — e configure um provedor com `opencode auth login`.'
export const requiresUnsafe =
  'o `opencode run` pode aprovar permissões automaticamente (edições e comandos sem pedir). Rode com --unsafe para confirmar; o deny do perfil de sandbox em .opencode/agent continua valendo.'

const MAX_TEXT = 4000
const clip = (s) => (typeof s === 'string' && s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + '…' : s)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// Tools de edição do OpenCode → também viram `agent.file_changed`.
const FILE_TOOLS = new Set(['edit', 'write', 'patch', 'multiedit'])

/** Conversa contínua (task 139): `resume` = sessionID de um run anterior → `--session <id>` (doc da CLI). */
export const supportsResume = true

export function command({ model = null, resume = null } = {}) {
  const args = ['run', '--format', 'json']
  if (resume) args.push('--session', resume)
  if (model) args.push('--model', model)
  return args
}

export function create() {
  let started = false
  const total = { input: null, output: null, cost: null }
  const add = (key, v) => {
    if (v === null) return
    total[key] = (total[key] ?? 0) + v
  }

  function normalize(obj) {
    const type = obj?.type
    const part = obj?.part ?? {}
    const sessionId = obj?.sessionID ?? part.sessionID ?? null

    if (type === 'step_start') {
      if (started) return { events: [] }
      started = true
      return { events: [{ type: 'run.started', payload: { session_id: sessionId }, native: obj }], meta: { sessionId } }
    }
    if (type === 'text') {
      return { events: [{ type: 'agent.message', payload: { text: clip(part.text ?? null) }, native: obj }], meta: sessionId ? { sessionId } : {} }
    }
    if (type === 'tool_use') {
      const st = part.state ?? {}
      const input = st.input ?? null
      const events = [{ type: 'agent.tool_call', payload: { id: part.callID ?? null, name: part.tool ?? null, input }, native: obj }]
      if (st.status === 'completed' || st.status === 'error') {
        events.push({
          type: 'agent.tool_result',
          payload: { tool_use_id: part.callID ?? null, is_error: st.status === 'error', text: clip(st.output ?? st.error ?? null) },
          native: null
        })
      }
      // opencode 2.2.5 real (task 114): o `write` manda `path`; versões anteriores, `filePath`.
      const file = input?.filePath ?? input?.file_path ?? input?.path ?? null
      if (FILE_TOOLS.has(part.tool) && file && st.status !== 'error') {
        events.push({ type: 'agent.file_changed', payload: { path: file, tool: part.tool }, native: null })
      }
      return { events }
    }
    if (type === 'step_finish') {
      const t = part.tokens ?? {}
      const cache = t.cache ?? {}
      const stepIn = [num(t.input), num(cache.read), num(cache.write)]
      const stepOut = [num(t.output), num(t.reasoning)]
      const sum = (arr) => (arr.every((v) => v === null) ? null : arr.reduce((a, b) => a + (b ?? 0), 0))
      add('input', sum(stepIn))
      add('output', sum(stepOut))
      add('cost', num(part.cost))
      const meta = { usage: { tokensIn: total.input, tokensOut: total.output, costUsd: total.cost } }
      if (part.reason === 'stop') meta.final = { ok: true, reason: null }
      return {
        events: [{
          type: 'agent.usage',
          payload: {
            input_tokens: num(t.input),
            output_tokens: num(t.output),
            reasoning_tokens: num(t.reasoning),
            cache_read_tokens: num(cache.read),
            cache_write_tokens: num(cache.write),
            cost_usd: num(part.cost),
            reason: part.reason ?? null,
            measured: true
          },
          native: obj
        }],
        meta
      }
    }
    if (type === 'error') {
      const err = obj.error ?? {}
      const reason = err.data?.message ?? err.message ?? err.name ?? 'erro'
      return { events: [{ type: 'agent.error', payload: { reason }, native: obj }], meta: { final: { ok: false, reason: `opencode: ${reason}` } } }
    }
    return { events: [{ type: 'agent.message', payload: { text: null }, native: obj }] }
  }

  return { id, bin, installHint, requiresUnsafe, supportsResume, command, normalize }
}
