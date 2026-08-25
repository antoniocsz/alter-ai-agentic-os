import fs from 'node:fs'
import path from 'node:path'
import { queueDir, activeDir, listTasks, parseTask, findConflicts, moveTask, resolveTaskName } from './lib/tasks.js'
import { captureBaseline } from './lib/git.js'

export async function start(args) {
  const [arg] = args
  const root = process.cwd()

  const qDir = queueDir(root)
  const aDir = activeDir(root)
  const name = resolveTaskName(qDir, arg)
  if (!fs.existsSync(path.join(qDir, name))) {
    const available = listTasks(qDir)
    throw new Error(
      `task não está na queue: ${name}\n  tasks na queue: ${available.join(', ') || '(vazia)'}`
    )
  }
  if (fs.existsSync(path.join(aDir, name))) throw new Error(`task já está ativa: ${name}`)

  const task = parseTask(path.join(qDir, name))
  const activeTasks = listTasks(aDir).map((n) => parseTask(path.join(aDir, n)))

  if (activeTasks.length > 0) {
    if (task.scope.length === 0) {
      throw new Error(
        `task sem ## Escopo não pode rodar em paralelo com: ${activeTasks.map((t) => t.name).join(', ')}\n` +
          'adicione ## Escopo (arquivos que esta task vai tocar) à task e tente de novo.'
      )
    }
    const conflicts = findConflicts([task, ...activeTasks])
    if (conflicts.length > 0) {
      const c = conflicts[0]
      throw new Error(
        `conflito de escopo com a task ativa ${c.b}:\n  ${c.aPath} ↔ ${c.bPath}\n` +
          'duas tasks paralelas não podem tocar os mesmos arquivos.'
      )
    }
  }

  const baseline = captureBaseline(root)
  const moved = moveTask(root, name, qDir, aDir)

  if (baseline.length > 0) {
    const lines = ['', '## Baseline (git)', ...baseline.map((f) => `- ${f}`)]
    fs.appendFileSync(moved, lines.join('\n') + '\n')
  }

  process.stdout.write(
    `▶️  ${name} iniciada (queue → active). Escopo declarado: ${task.scope.length} arquivo(s).\n` +
      (activeTasks.length > 0
        ? `   Rodando em paralelo com: ${activeTasks.map((t) => t.name).join(', ')}\n`
        : '')
  )
}