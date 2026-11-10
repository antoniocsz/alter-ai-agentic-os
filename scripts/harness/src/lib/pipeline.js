import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { queueDir, activeDir, doneDir, listTasks, parseTask, findConflicts, moveTask, resolveTaskName, pipelineRoot, norm } from './tasks.js'
import { captureBaseline, isGitRepo, modifiedFiles, diffNames, outOfScopeFromFiles, headSha } from './git.js'
import { tryOpenDb, upsertTask, logEvent, taskFromMarkdown, recordInteraction } from './db.js'
import { resolveConfig } from './config.js'
import { runGates, firstFailure } from './gates.js'
import { withLock } from './lock.js'

export function startTask(root, arg) {
  return withLock(root, () => startTaskUnlocked(root, arg))
}

function checkDoR(root, task) {
  const issues = []

  if (!task.scope || task.scope.length === 0) {
    issues.push('declarar `## Escopo` (arquivos que a task vai tocar)')
  }
  const hasCriteria = Object.keys(task.sections ?? {}).some((k) =>
    k.toLowerCase().includes('critério de conclusão')
  )
  if (!hasCriteria) issues.push('declarar `## Critério de conclusão`')

  const feature = String(task.values?.Feature ?? '').replace(/`/g, '').trim()
  if (feature && feature !== '—' && feature !== '-') {
    if (!fs.existsSync(path.join(root, 'context', 'features', feature, 'spec.md'))) {
      issues.push(`criar a spec da feature: context/features/${feature}/spec.md`)
    }
  }

  const depRaw = String(task.values?.['Depende de'] ?? '')
    .replace(/\[[ x]\]/gi, '')
    .replace(/`/g, '')
    .trim()
  const deps = depRaw
    .split(',')
    .map((d) => d.trim())
    .filter((d) => d && d !== '-' && d !== '—')
  for (const dep of deps) {
    try {
      resolveTaskName(doneDir(root), dep)
    } catch {
      issues.push(`dependência não concluída: ${dep} (não está em tasks/done/)`)
    }
  }

  return issues
}

function startTaskUnlocked(root, arg) {
  const qDir = queueDir(root)
  const aDir = activeDir(root)
  const name = resolveTaskName(qDir, arg)

  if (fs.existsSync(path.join(aDir, name))) return { ok: false, error: `task já está ativa: ${name}` }

  const task = parseTask(path.join(qDir, name))
  const dor = checkDoR(root, task)
  if (dor.length > 0) {
    return {
      ok: false,
      error:
        `DoR não atendida em ${name}:\n` +
        dor.map((d) => `  - ${d}`).join('\n') +
        '\ncomplete a task na queue e tente de novo.'
    }
  }
  const activeTasks = listTasks(aDir).map((n) => parseTask(path.join(aDir, n)))

  if (activeTasks.length > 0) {
    if (task.scope.length === 0) {
      return {
        ok: false,
        error:
          `task sem ## Escopo não pode rodar em paralelo com: ${activeTasks.map((t) => t.name).join(', ')}` +
          '\nadicione ## Escopo (arquivos que esta task vai tocar) à task e tente de novo.'
      }
    }
    const conflicts = findConflicts([task, ...activeTasks])
    if (conflicts.length > 0) {
      const c = conflicts[0]
      return {
        ok: false,
        error: `conflito de escopo com a task ativa ${c.b}:\n  ${c.aPath} ↔ ${c.bPath}`
      }
    }
  }

  const baseline = captureBaseline(root)
  const moved = moveTask(root, name, qDir, aDir)

  if (baseline.length > 0) {
    const lines = ['', '## Baseline (git)', ...baseline.map((f) => `- ${f}`)]
    fs.appendFileSync(moved, lines.join('\n') + '\n')
  }

  const db = tryOpenDb(root)
  if (db) {
    try {
      upsertTask(db, taskFromMarkdown(aDir, name))
      logEvent(
        db,
        name,
        'started',
        `escopo: ${task.scope.length} arquivo(s) | head:${headSha(root) ?? '-'}`
      )
    } catch {}
  }

  return { ok: true, name, task, parallel: activeTasks.map((t) => t.name) }
}

export function finishTask(root, arg, opts = {}) {
  return withLock(root, () => finishTaskUnlocked(root, arg, opts))
}

// Id numérico do arquivo de task (`90-backend-...md` → '90'); null quando não tem.
const taskIdFromName = (name) => String(name).match(/^(\d+)-/)?.[1] ?? null

/**
 * Extrai o id de um commit de task pelo subject convencional:
 * `feat(task-82): ...`, `fix!(task-1): ...`, `feat(task-1)!: ...`.
 * Retorna o id ou null quando o commit não é atribuído a uma task.
 */
export function commitTaskId(subject) {
  const m = String(subject ?? '').trim().match(/^[a-zA-Z]+(?:!)?\(([^)]*)\)(?:!)?/)
  if (!m) return null
  return m[1].match(/^task-(\d+)$/)?.[1] ?? null
}

/**
 * Atribuição por commit para merges intercalados de worktrees paralelas: um
 * arquivo do range `from..to` é "de outra task" quando o ÚLTIMO commit que o
 * tocou no range é o squash de outra worktree (`feat(task-<id>)/fix(task-<id>)/...`,
 * qualquer tipo) com id ≠ `ownId`. Arquivos sem essa atribuição não são liberados
 * — inclusive os sujos (não commitados), que seguem contando para esta task.
 * Alternativa avaliada (head por task no evento worktree_started/db) descartada:
 * não fecha o diff pré-rebase da worktree e persiste estado de git no banco.
 * Fail-closed: erro de git ou range vazio → set vazio (nada liberado de graça).
 */
export function filesAttributedToOtherTasks(root, from, to, ownId = null) {
  const others = new Set()
  if (!from || !to || !ownId) return others
  let out
  try {
    out = execFileSync(
      'git',
      [
        '-c',
        'core.quotePath=false',
        'log',
        '--name-only',
        '--no-renames',
        '--format=%H\t%s',
        `${from}..${to}`
      ],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    )
  } catch {
    return others
  }
  // Log sai mais novo primeiro: o PRIMEIRO bloco que contém o arquivo é o último
  // commit que o tocou — decide a atribuição. Bloco = cabeçalho `<sha>\t<subject>`
  // seguido dos arquivos que o commit alterou.
  const attributed = new Map()
  let commitId = null
  for (const raw of out.split('\n')) {
    const line = raw.replace(/\r$/, '')
    const tab = line.indexOf('\t')
    if (!line.trim()) continue
    if (tab === 40 && /^[0-9a-f]{40}$/.test(line.slice(0, 40))) {
      commitId = commitTaskId(line.slice(41))
      continue
    }
    const file = norm(line.trim())
    if (!file || commitId === null) continue
    if (!attributed.has(file)) attributed.set(file, commitId)
  }
  if (ownId !== null) for (const [file, id] of attributed) if (id !== ownId) others.add(file)
  return others
}

function finishTaskUnlocked(root, arg, opts = {}) {
  const aDir = activeDir(root)
  const dDir = doneDir(root)
  const name = resolveTaskName(aDir, arg)
  const activePath = path.join(aDir, name)

  if (!fs.existsSync(activePath)) {
    const available = listTasks(aDir)
    return { ok: false, error: `task não está ativa: ${name}`, notFound: true }
  }
  if (fs.existsSync(path.join(dDir, name))) return { ok: false, error: `task já concluída: ${name}` }

  const task = parseTask(activePath)
  const baseline = parseBaseline(task)
  const activeTasks = listTasks(aDir).map((n) => parseTask(path.join(aDir, n)))

  // HEAD no momento do start: commits feitos durante a task também contam no escopo.
  let startHead = null
  {
    const db0 = tryOpenDb(root)
    if (db0) {
      try {
        const row = db0
          .prepare(
            "SELECT message FROM task_events WHERE task_id = ? AND event = 'started' ORDER BY at DESC LIMIT 1"
          )
          .get(name)
        startHead = row?.message?.match(/head:([0-9a-f]{7,40})/i)?.[1] ?? null
      } catch {}
    }
  }

  if (isGitRepo(root)) {
    // Apenas tasks ATIVAS liberam escopo: escopos de tasks concluídas não podem
    // alargar a permissão para sempre (ex.: uma task antiga com escopo de diretório).
    const allowedScopes = [
      ...activeTasks.flatMap((t) => t.scope),
      'context/',
      norm(path.relative(root, pipelineRoot(root))) + '/',
      '.worktrees/',
      '.tmp/'
    ]
    const dirty = modifiedFiles(root)
    const rangeFiles = startHead ? diffNames(root, startHead, 'HEAD') : []
    // Worktrees paralelas mergeiam intercalado: arquivos que entraram no range
    // (startHead → HEAD) via squash de OUTRA task são atribuídos a ela e não
    // reprovam no escopo desta. O mecanismo `## Baseline (git)` segue valendo.
    // Sujos (working tree) sempre contam: o estado sujo é delta desta validação.
    const otherFiles = startHead
      ? filesAttributedToOtherTasks(root, startHead, 'HEAD', taskIdFromName(name))
      : new Set()
    const changed = [...new Set([...dirty, ...rangeFiles])]
    const out = outOfScopeFromFiles(
      changed.filter((f) => !(otherFiles.has(f) && !dirty.includes(f))),
      baseline,
      allowedScopes
    )
    if (out.length > 0) {
      const db = tryOpenDb(root)
      if (db) {
        try {
          upsertTask(db, taskFromMarkdown(aDir, name))
          logEvent(db, name, 'out_of_scope', out.join('; '))
        } catch {}
      }
      return {
        ok: false,
        error: `fora do escopo declarado (${task.scope.length} arquivo(s)):\n  ${out.join('\n  ')}\n` +
          'reverta os arquivos fora do escopo ou adicione-os ao ## Escopo antes de concluir.',
        out
      }
    }
  }

  const cfg = resolveConfig(root)
  const gateResults = opts.skipGates
    ? []
    : runGates(root, cfg.gates?.finish ?? [], { phase: 'finish', strict: cfg.gates?.strict })
  const gateFailed = firstFailure(gateResults)
  if (gateFailed) {
    const db = tryOpenDb(root)
    if (db) {
      try {
        upsertTask(db, taskFromMarkdown(aDir, name))
        logEvent(db, name, 'gate_failed', gateFailed.gate)
      } catch {}
    }
    return {
      ok: false,
      error: `gate "${gateFailed.gate}" falhou:\n${gateFailed.output ?? '(sem saída)'}`,
      gateFailure: gateFailed,
      gates: gateResults
    }
  }

  moveTask(root, name, aDir, dDir)

  const db = tryOpenDb(root)
  let handoff = false
  if (db) {
    try {
      upsertTask(db, taskFromMarkdown(dDir, name))
      logEvent(db, name, 'finished')
      if (opts.handoff) {
        recordInteraction(db, {
          taskId: name,
          kind: 'note',
          content: `handoff: ${opts.handoff}`,
          source: 'agent'
        })
        handoff = true
      }
    } catch {}
  }

  const modName = task.values?.['Módulo']?.match(/modules\/([a-z0-9-]+)/)?.[1] ?? null
  const statusPath = modName ? path.join(root, 'context', 'modules', modName, 'status.md') : null
  const hasHandoffBlock =
    statusPath && fs.existsSync(statusPath) ? /##\s*Handoff/i.test(fs.readFileSync(statusPath, 'utf8')) : false

  return {
    ok: true,
    name,
    task,
    gitRepo: isGitRepo(root),
    handoff,
    gates: gateResults,
    statusHandoffMissing: statusPath ? !hasHandoffBlock : null
  }
}

export function requeueTask(root, arg) {
  return withLock(root, () => requeueTaskUnlocked(root, arg))
}

function requeueTaskUnlocked(root, arg) {
  const aDir = activeDir(root)
  const qDir = queueDir(root)
  const name = resolveTaskName(aDir, arg)
  if (!fs.existsSync(path.join(aDir, name))) return { ok: false, error: `task não está ativa: ${name}` }
  moveTask(root, name, aDir, qDir)
  const db = tryOpenDb(root)
  if (db) {
    try {
      upsertTask(db, taskFromMarkdown(qDir, name))
      logEvent(db, name, 'requeued')
    } catch {}
  }
  return { ok: true, name }
}

export function reopenTask(root, arg) {
  return withLock(root, () => reopenTaskUnlocked(root, arg))
}

function reopenTaskUnlocked(root, arg) {
  const dDir = doneDir(root)
  const aDir = activeDir(root)
  const name = resolveTaskName(dDir, arg)
  if (!fs.existsSync(path.join(dDir, name))) return { ok: false, error: `task não está em done/: ${name}` }
  moveTask(root, name, dDir, aDir)
  const db = tryOpenDb(root)
  if (db) {
    try {
      upsertTask(db, taskFromMarkdown(aDir, name))
      logEvent(db, name, 'reopened')
    } catch {}
  }
  return { ok: true, name }
}

export function parseBaseline(task) {
  const key = Object.keys(task.sections).find((k) => k.toLowerCase().includes('baseline'))
  if (!key) return []
  return task.sections[key]
    .map((line) => line.trim().replace(/^[-*]\s*/, '').replace(/`/g, ''))
    .filter(Boolean)
}