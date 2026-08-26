import { openDb, recordInteraction, taskHistory, resolveTaskId } from './lib/db.js'

export async function logCmd(args) {
  const root = process.cwd()
  const content = args.find((a) => !a.startsWith('--'))
  if (!content) {
    throw new Error(
      'uso: harness log "<texto>" [--task <id>] [--kind prompt|response|note|system] [--source agent|human|cli]'
    )
  }
  const flag = (names) => {
    const i = args.findIndex((a) => names.includes(a))
    return i !== -1 ? args[i + 1] : null
  }

  const taskId = resolveTaskId(root, flag(['--task']))
  const db = openDb(root)
  recordInteraction(db, {
    taskId,
    kind: flag(['--kind']) ?? 'note',
    content,
    source: flag(['--source']) ?? 'human'
  })
  process.stdout.write(`✅ interação registrada${taskId ? ` (task ${taskId})` : ''}.\n`)
}

export async function historyCmd(args) {
  const root = process.cwd()
  const taskId = resolveTaskId(root, args.find((a) => !a.startsWith('--')))
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