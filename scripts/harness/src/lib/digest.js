// Digest do módulo (feature otimizador-de-contexto, task 133): um agente resume o histórico de
// handoffs do status.md em `context/modules/<m>/digest.md` — o pacote de contexto usa o digest e
// mantém só o handoff mais recente inteiro. O agente só lê (Claude em plan, Codex read-only, guarda
// por comparação da árvore); quem grava o arquivo é o harness, a partir da resposta.
import fs from 'node:fs'
import path from 'node:path'
import { runTool } from './runner.js'
import { worktreeSignature } from './flows.js'
import { estimateTokens, recentHandoffs } from './context.js'

export class DigestError extends Error {}

const BLOCK_RE = /---\s*DIGEST\s*---\s*\n([\s\S]*?)\n\s*---\s*FIM\s*---/i

export function digestPaths(root, mod) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(mod ?? ''))) throw new DigestError(`módulo inválido: ${mod}`)
  const dir = path.join(root, 'context', 'modules', mod)
  return { dir, status: path.join(dir, 'status.md'), context: path.join(dir, 'context.md'), digest: path.join(dir, 'digest.md'), rel: `context/modules/${mod}/digest.md` }
}

export function buildDigestPrompt(mod, statusText, contextText, maxWords) {
  return [
    `Você é o REDATOR do histórico do módulo "${mod}" do harness (AlterAI - Agentic OS).`,
    'Regras desta execução:',
    '- NÃO altere, crie nem apague arquivos — só leia (o harness compara a árvore e descarta a resposta se algo mudar).',
    `- Resuma o histórico abaixo em no máximo ${maxWords} palavras, em bullets, para orientar o próximo agente:`,
    '  decisões vigentes e convenções, armadilhas já encontradas, pendências AINDA abertas e onde está cada parte.',
    '- Omita o que só descreve implementação já refletida no código, números de testes e detalhes resolvidos.',
    '- Se uma decisão foi trocada depois, registre só a vigente.',
    '- Responda com o resumo em markdown ENTRE as linhas exatas `--- DIGEST ---` e `--- FIM ---`, e nada mais.',
    '',
    '--- CONTEXTO DO MÓDULO (context.md) ---',
    contextText ?? '(sem context.md)',
    '',
    '--- HISTÓRICO (status.md) ---',
    statusText
  ].join('\n')
}

export function parseDigest(text) {
  const m = String(text ?? '').match(BLOCK_RE)
  const body = m?.[1]?.trim()
  return body && body.length >= 20 ? body : null
}

function lastTexts(db, runId) {
  return db
    .prepare("SELECT payload_json FROM run_events WHERE run_id = ? AND type = 'agent.message' ORDER BY seq DESC")
    .all(runId)
    .map((r) => {
      try {
        return JSON.parse(r.payload_json)?.text ?? ''
      } catch {
        return ''
      }
    })
    .filter(Boolean)
}

/**
 * Gera o digest. `driver`/`opts` já resolvidos (só leitura). Retorna `{ runId, digest, file,
 * written, tokens: { history, digest } }`; `dryRun` não grava.
 */
export async function generateDigest({ root, db, mod, driver, opts, unsafe = false, env = process.env, signal = null, limit = null, maxWords = 400, dryRun = false, onEvent = () => {} }) {
  const p = digestPaths(root, mod)
  if (!fs.existsSync(p.status)) throw new DigestError(`módulo sem status.md: context/modules/${mod}/status.md`)
  const statusText = fs.readFileSync(p.status, 'utf8')
  const handoffs = recentHandoffs(statusText, 10_000)
  if (handoffs.length < 2) throw new DigestError(`status.md de ${mod} tem ${handoffs.length} handoff(s) — nada a resumir ainda`)
  const contextText = fs.existsSync(p.context) ? fs.readFileSync(p.context, 'utf8') : null
  const before = worktreeSignature(root)
  const res = await runTool({
    db,
    taskId: `module:${mod}`,
    cwd: root,
    driver,
    prompt: buildDigestPrompt(mod, statusText, contextText, maxWords),
    opts,
    unsafe,
    env,
    signal,
    limit,
    onEvent
  })
  if (res.status !== 'completed') throw new DigestError(`o agente falhou (${res.runId}): ${res.error ?? 'run falhou'}`)
  if (worktreeSignature(root) !== before) throw new DigestError(`o agente alterou arquivos do repositório (${res.runId}) — digest descartado; confira com git status`)
  const digest = lastTexts(db, res.runId).map(parseDigest).find(Boolean)
  if (!digest) throw new DigestError(`resposta sem o bloco --- DIGEST --- … --- FIM --- (${res.runId}); veja: harness events ${res.runId}`)
  const latest = handoffs[0]?.heading ?? '—'
  const file =
    `<!-- gerado por harness context digest em ${new Date().toISOString()} · run ${res.runId} · ${handoffs.length} handoffs (mais recente: ${latest}). ` +
    'Revise antes de commitar; gere de novo quando o histórico crescer. -->\n\n' +
    digest +
    '\n'
  if (!dryRun) fs.writeFileSync(p.digest, file)
  return {
    runId: res.runId,
    digest,
    file: p.rel,
    written: !dryRun,
    tokens: { history: estimateTokens(handoffs.map((h) => h.text).join('\n\n')), digest: estimateTokens(digest) }
  }
}
