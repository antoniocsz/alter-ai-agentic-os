import fs from 'node:fs'
import path from 'node:path'
import { queueDir, activeDir, doneDir, resolveTaskName, parseTask, listTasks, findConflicts } from './tasks.js'
import { startTask } from './pipeline.js'
import { startWorktree, readRegistry } from './worktree.js'
import { runTool } from './runner.js'

/**
 * Orquestração paralela (feature `orquestracao-paralela`, task 100).
 *
 * Um lote = N tasks executadas por agentes ao mesmo tempo, cada uma na própria worktree.
 *   planBatch    → valida o lote SEM efeito colateral (nada é movido)
 *   prepareBatch → start (queue → active) + worktree start, em sequência (lock do pipeline)
 *   runBatch     → pool de concorrência sobre runTool, com interrupção do lote inteiro
 * A integração (`worktree finish`) continua humana.
 */

function tryResolve(dir, arg) {
  try {
    return resolveTaskName(dir, arg)
  } catch (err) {
    return /ambíguo/.test(err.message) ? { ambiguous: err.message } : null
  }
}

function depsOf(task) {
  return String(task.values?.['Depende de'] ?? '')
    .replace(/\[[ x]\]/gi, '')
    .replace(/`/g, '')
    .split(',')
    .map((d) => d.trim())
    .filter((d) => d && d !== '-' && d !== '—')
}

const depMatches = (dep, name) => {
  const n = String(dep).replace(/\.md$/, '')
  return name === dep || name.startsWith(n + '-') || name.startsWith(n.padStart(2, '0') + '-') || name.replace(/\.md$/, '') === n
}

function worktreeReady(root, name, reg) {
  const entry = reg.worktrees.find((w) => w.task === name)
  return Boolean(entry && fs.existsSync(path.join(root, entry.path)))
}

/**
 * Valida o lote inteiro sem mover nada. Retorna `{ items, errors }`;
 * `errors` não vazio = o lote não deve ser preparado.
 *   item: { arg, name, state: 'queue'|'active', task, worktree: boolean }
 */
export function planBatch(root, args) {
  const items = []
  const errors = []
  const seen = new Set()

  if (!Array.isArray(args) || args.length === 0) {
    return { items, errors: [{ arg: null, error: 'lote vazio: informe as tasks (ex.: --batch 12,13,14)' }] }
  }

  const reg = readRegistry(root)
  for (const arg of args) {
    const q = tryResolve(queueDir(root), arg)
    const a = tryResolve(activeDir(root), arg)
    const amb = [q, a].find((r) => r && typeof r === 'object')
    if (amb) {
      errors.push({ arg, error: amb.ambiguous })
      continue
    }
    let name = null
    let state = null
    if (typeof a === 'string') {
      name = a
      state = 'active'
    } else if (typeof q === 'string') {
      name = q
      state = 'queue'
    } else if (typeof tryResolve(doneDir(root), arg) === 'string') {
      errors.push({ arg, error: 'task já concluída (está em done/) — reabra com `harness reopen` se precisar' })
      continue
    } else {
      errors.push({ arg, error: 'task não encontrada em queue/ nem active/' })
      continue
    }
    if (seen.has(name)) {
      errors.push({ arg, error: `task repetida no lote: ${name}` })
      continue
    }
    seen.add(name)
    const dir = state === 'active' ? activeDir(root) : queueDir(root)
    const task = parseTask(path.join(dir, name))
    if (!task.scope.length) {
      errors.push({ arg, name, error: 'task sem `## Escopo` não roda em paralelo' })
      continue
    }
    items.push({ arg, name, state, task, worktree: state === 'active' && worktreeReady(root, name, reg) })
  }

  // Dependência dentro do próprio lote: B precisa de A em done/, e o lote não integra.
  for (const it of items) {
    for (const dep of depsOf(it.task)) {
      const inBatch = items.find((o) => o !== it && depMatches(dep, o.name))
      if (inBatch) {
        errors.push({
          arg: it.arg,
          name: it.name,
          error: `depende de ${inBatch.name}, que está no mesmo lote — integre ${inBatch.name} antes (rode em lotes separados)`
        })
      }
    }
  }

  // Conflito de escopo: entre tasks do lote e com ativas fora do lote.
  const batchNames = new Set(items.map((i) => i.name))
  const others = listTasks(activeDir(root))
    .filter((n) => !batchNames.has(n))
    .map((n) => parseTask(path.join(activeDir(root), n)))
  const pending = items.filter((i) => i.state === 'queue').map((i) => i.task)
  const all = [...items.map((i) => i.task), ...others]
  for (const c of findConflicts(all)) {
    // Ativas já conviviam antes do lote: só interessa conflito que envolve uma task que vai iniciar.
    const involvesPending = pending.some((t) => t.name === c.a || t.name === c.b)
    if (!involvesPending) continue
    const subject = batchNames.has(c.a) ? c.a : c.b
    const other = subject === c.a ? c.b : c.a
    errors.push({
      arg: items.find((i) => i.name === subject)?.arg ?? subject,
      name: subject,
      error: `conflito de escopo com ${other}${batchNames.has(other) ? ' (no mesmo lote)' : ' (ativa)'}: ${c.aPath} ↔ ${c.bPath}`
    })
  }

  return { items, errors }
}

export function formatPlanErrors(errors) {
  return errors.map((e) => `  - ${e.name ?? e.arg ?? 'lote'}: ${e.error}`).join('\n')
}

/**
 * Executa o plano: start das tasks na queue e worktree start de quem não tem.
 * Para no primeiro erro e informa exatamente o que já ficou preparado (nada é revertido).
 * Retorna `[{ name, started: boolean, worktreeCreated: boolean }]`.
 */
export function prepareBatch(root, items) {
  const done = []
  const report = () =>
    done.length
      ? '\n  já preparado (nada foi revertido):\n' +
        done.map((d) => `    - ${d.name}: ${[d.started && 'start', d.worktreeCreated && 'worktree'].filter(Boolean).join(' + ') || 'já estava pronta'}`).join('\n')
      : ''
  for (const it of items) {
    const step = { name: it.name, started: false, worktreeCreated: false }
    if (it.state === 'queue') {
      const res = startTask(root, it.name)
      if (!res.ok) throw new Error(`preparação do lote parou em ${it.name}: ${res.error}${report()}`)
      step.started = true
    }
    if (!it.worktree) {
      try {
        startWorktree(root, it.name)
      } catch (err) {
        done.push(step)
        throw new Error(`preparação do lote parou em ${it.name} (worktree): ${err.message}${report()}`)
      }
      step.worktreeCreated = true
    }
    done.push(step)
  }
  return done
}

/**
 * Pool de concorrência: no máximo `max` runs ao mesmo tempo. `signal` interrompe o lote:
 * runs ativos recebem abort (killTree) e os pendentes não começam (`skipped`).
 * jobs: [{ taskId, cwd, driver, prompt, opts, unsafe }]
 * Resolve com um resultado por job, na ordem: { taskId, runId, status, exitCode, error }.
 */
export async function runBatch({ db, jobs, max = 1, batchId = null, env = process.env, signal = null, onEvent = () => {}, onStart = () => {}, beforeJob = null }) {
  const limit = Math.max(1, Math.floor(Number(max) || 1))
  const results = new Array(jobs.length).fill(null)
  let next = 0

  const worker = async () => {
    for (;;) {
      if (signal?.aborted) return
      const i = next++
      if (i >= jobs.length) return
      const job = jobs[i]
      // Orçamento (task 107): checado na hora de começar, com o consumo medido até ali.
      const gate = beforeJob ? beforeJob(job) ?? {} : {}
      if (gate.skip) {
        results[i] = { taskId: job.taskId, runId: null, status: 'skipped', exitCode: null, error: gate.skip }
        continue
      }
      const ac = new AbortController()
      const relay = () => ac.abort()
      signal?.addEventListener('abort', relay, { once: true })
      try {
        onStart(job)
        const res = await runTool({
          db,
          taskId: job.taskId,
          cwd: job.cwd,
          driver: job.driver,
          prompt: job.prompt,
          opts: job.opts ?? {},
          unsafe: Boolean(job.unsafe),
          env,
          signal: ac.signal,
          batchId,
          limit: gate.limit ?? null,
          budgetOverride: Boolean(job.budgetOverride),
          gates: job.gates ?? null,
          onEvent: (ev) => onEvent({ ...ev, taskId: job.taskId })
        })
        results[i] = { taskId: job.taskId, ...res }
      } catch (err) {
        results[i] = { taskId: job.taskId, runId: null, status: 'failed', exitCode: null, error: err.message }
      } finally {
        signal?.removeEventListener('abort', relay)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker))
  return results.map((r, i) => r ?? { taskId: jobs[i].taskId, runId: null, status: 'skipped', exitCode: null, error: 'lote interrompido antes de iniciar' })
}
