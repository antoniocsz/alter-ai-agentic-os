/**
 * Achados para o modo Analisar (feature `modo-analisar`, task 141): pontos `arquivo:linha — texto`
 * que o revisor (e as respostas do modo Analisar) citam, para o painel marcar no diff.
 *
 * Fonte: a revisão mais recente da task — passo `review` de um fluxo ou run com `role = 'review'`.
 * O texto é a mensagem final do agente; cada linha com `caminho:linha` vira um achado. O veredito
 * (`VEREDITO: APROVADO|MUDANÇAS`) vem junto. Só leitura.
 */
import { runEvents } from './runs.js'

// `src/a.js:15`, `src/a.js:15-20`, com ou sem crases, numeração/marcadores antes, travessão/dois
// pontos/hífen depois.
const LINE_RE = /^\s*(?:[-*•]|\d+[.)])?\s*\**`?([\w@.~\-/\\]+\.[A-Za-z0-9]{1,8}):(\d{1,6})(?:-(\d{1,6}))?`?\**\s*(?:[—–:-]\s*)?(.*)$/

/** Achados de um texto livre: `[{ file, line, end, text }]` (caminhos com `/`, sem `./`). */
export function parseFindings(text) {
  const out = []
  if (!text) return out
  for (const raw of String(text).split('\n')) {
    const m = raw.match(LINE_RE)
    if (!m) continue
    const file = m[1].replace(/\\/g, '/').replace(/^\.\//, '')
    if (file.startsWith('/') || file.includes('..')) continue
    const line = Number(m[2])
    if (!line) continue
    const body = m[4].trim()
    if (!body) continue
    out.push({ file, line, end: m[3] ? Number(m[3]) : null, text: body })
  }
  return out
}

/** Veredito do revisor no texto, se houver. */
export function verdictOf(text) {
  const m = String(text ?? '').match(/VEREDITO:\s*(APROVADO|MUDAN[ÇC]AS)/i)
  if (!m) return null
  return /APROVADO/i.test(m[1]) ? 'approved' : 'changes'
}

function finalText(db, runId) {
  const msgs = runEvents(db, runId).filter((e) => e.type === 'agent.message' && e.payload?.text && !e.payload?.reasoning)
  if (!msgs.length) return ''
  const final = [...msgs].reverse().find((e) => e.payload.final)
  return (final ?? msgs[msgs.length - 1]).payload.text
}

/** Revisão mais recente da task com achados: `{ source, verdict, findings }` ou `{ source: null }`. */
export function taskFindings(db, taskId) {
  let reviewRun = null
  try {
    reviewRun = db
      .prepare(
        `SELECT r.id, r.tool, r.model, r.finished_at, r.started_at FROM runs r
         WHERE r.task_id = ? AND r.status = 'completed'
           AND (r.role = 'review' OR r.id IN (SELECT run_id FROM flow_steps WHERE role = 'review' AND run_id IS NOT NULL))
         ORDER BY r.started_at DESC, r.rowid DESC LIMIT 1`
      )
      .get(taskId)
  } catch {
    reviewRun = db
      .prepare("SELECT id, tool, model, finished_at, started_at FROM runs WHERE task_id = ? AND status = 'completed' AND role = 'review' ORDER BY started_at DESC, rowid DESC LIMIT 1")
      .get(taskId)
  }
  if (!reviewRun) return { source: null, verdict: null, findings: [] }
  const text = finalText(db, reviewRun.id)
  return {
    source: { run_id: reviewRun.id, tool: reviewRun.tool, model: reviewRun.model, at: reviewRun.finished_at ?? reviewRun.started_at },
    verdict: verdictOf(text),
    findings: parseFindings(text)
  }
}
