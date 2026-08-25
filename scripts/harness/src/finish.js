import fs from 'node:fs'
import path from 'node:path'
import { activeDir, doneDir, listTasks, parseTask, moveTask, resolveTaskName, norm } from './lib/tasks.js'
import { isGitRepo, outOfScopeFiles } from './lib/git.js'

export async function finish(args) {
  const [arg] = args
  const root = process.cwd()

  const aDir = activeDir(root)
  const dDir = doneDir(root)
  const name = resolveTaskName(aDir, arg)
  const activePath = path.join(aDir, name)
  if (!fs.existsSync(activePath)) {
    const available = listTasks(aDir)
    throw new Error(`task não está ativa: ${name}\n  tasks ativas: ${available.join(', ') || '(vazia)'}`)
  }
  if (fs.existsSync(path.join(dDir, name))) throw new Error(`task já concluída: ${name}`)

  const task = parseTask(activePath)
  const baseline = parseBaseline(task)
  const activeTasks = listTasks(aDir).map((n) => parseTask(path.join(aDir, n)))
  const doneTasks = listTasks(dDir).map((n) => parseTask(path.join(dDir, n)))

  if (isGitRepo(root)) {
    const allowedScopes = [
      ...activeTasks.flatMap((t) => t.scope),
      ...doneTasks.flatMap((t) => t.scope),
      'context/'
    ]
    const out = outOfScopeFiles(root, baseline, allowedScopes)
    if (out.length > 0) {
      throw new Error(
        `fora do escopo declarado (${task.scope.length} arquivo(s)):\n  ${out.join('\n  ')}\n` +
          'reverta os arquivos fora do escopo ou adicione-os ao ## Escopo antes de concluir.'
      )
    }
  } else {
    process.stdout.write('   ⚠️  não é repositório git — enforcement de escopo pulado.\n')
  }

  const moved = moveTask(root, name, aDir, dDir)
  process.stdout.write(`✅ ${name} concluída (active → done).\n`)
}

function parseBaseline(task) {
  const key = Object.keys(task.sections).find((k) => k.toLowerCase().includes('baseline'))
  if (!key) return []
  return task.sections[key]
    .map((line) => line.trim().replace(/^[-*]\s*/, '').replace(/`/g, ''))
    .filter(Boolean)
    .map(norm)
}