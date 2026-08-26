import { startTask } from './lib/pipeline.js'

export async function start(args) {
  const res = startTask(process.cwd(), args[0])
  if (!res.ok) throw new Error(res.error)

  process.stdout.write(
    `▶️  ${res.name} iniciada (queue → active). Escopo declarado: ${res.task.scope.length} arquivo(s).\n` +
      (res.parallel.length > 0 ? `   Rodando em paralelo com: ${res.parallel.join(', ')}\n` : '')
  )
}