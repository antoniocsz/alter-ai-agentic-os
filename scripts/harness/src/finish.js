import { finishTask } from './lib/pipeline.js'

export async function finish(args) {
  const handoffIdx = args.indexOf('--handoff')
  const handoff = handoffIdx !== -1 ? args.slice(handoffIdx + 1).join(' ').trim() : null
  const positional = args.filter((a) => !a.startsWith('--'))

  const res = finishTask(process.cwd(), positional[0], { handoff })
  if (!res.ok) throw new Error(res.error)
  if (!res.gitRepo) process.stdout.write('   ⚠️  não é repositório git — enforcement de escopo pulado.\n')
  if (res.handoff) process.stdout.write('   📝 handoff registrado no banco.\n')
  if (res.statusHandoffMissing) {
    process.stdout.write('   ⚠️  status.md do módulo não tem bloco ## Handoff — preencha (feito/pendências/decisões).\n')
  }
  process.stdout.write(`✅ ${res.name} concluída (active → done).\n`)
}