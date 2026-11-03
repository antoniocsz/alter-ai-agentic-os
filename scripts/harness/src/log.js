import { openDb, recordInteraction, taskHistory, resolveTaskId } from './lib/db.js'
import { parseArgs, flagString } from './lib/flags.js'

export async function logCmd(args) {
  const root = process.cwd()
  const { positionals, flags } = parseArgs(args)
  const content = positionals.join(' ').trim()
  if (!content) {
    throw new Error(
      'uso: harness log "<texto>" [--task <id>] [--kind prompt|response|note|system] [--source agent|human|cli]'
    )
  }

  const taskId = resolveTaskId(root, flagString(flags, 'task'))
  const db = openDb(root)
  recordInteraction(db, {
    taskId,
    kind: flagString(flags, 'kind', 'note'),
    content,
    source: flagString(flags, 'source', 'human')
  })
  process.stdout.write(`✅ interação registrada${taskId ? ` (task ${taskId})` : ''}.\n`)
}

export async function historyCmd(args) {
  const root = process.cwd()
  const { positionals } = parseArgs(args)
  const taskId = resolveTaskId(root, positionals[0])
  if (!taskId) throw new Error('uso: harness history <task>')

  const db = openDb(root)
  const { events, interactions } = taskHistory(db, taskId)

  process.stdout.write(`# Histórico de ${taskId}\n\n`)
  process.stdout.write('## Eventos\n')
  for (const e of events) {
    const suffix = e.message ? ` — ${e.message}` : ''
    process.stdout.write(`  [${e.at}] ${e.event}${suffix}\n`)
  }
  process.stdout.write('## Interações\n')
  if (interactions.length === 0) process.stdout.write('  (nenhuma)\n')
  for (const i of interactions) {
    process.stdout.write(`  [${i.at}] ${i.source}/${i.kind}${i.task_id ? ` (task ${i.task_id})` : ''}\n`)
    process.stdout.write(`      ${i.content.split('\n').join('\n      ')}\n`)
  }
}
