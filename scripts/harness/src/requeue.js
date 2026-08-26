import { requeueTask, reopenTask } from './lib/pipeline.js'

export async function requeue(args) {
  const res = requeueTask(process.cwd(), args[0])
  if (!res.ok) throw new Error(res.error)
  process.stdout.write(`↩️  ${res.name} devolvida à queue (active → queue).\n`)
}

export async function reopen(args) {
  const res = reopenTask(process.cwd(), args[0])
  if (!res.ok) throw new Error(res.error)
  process.stdout.write(`🔁 ${res.name} reaberta (done → active).\n`)
}