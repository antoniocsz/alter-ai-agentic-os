import { finishTask } from './lib/pipeline.js'
import { summarize } from './lib/gates.js'
import { parseArgs, flagString, flagBool } from './lib/flags.js'

export async function finish(args) {
  const { positionals, flags } = parseArgs(args)
  const handoff = flagString(flags, 'handoff')
  const skipGates = flagBool(flags, 'skip-gates')

  const res = finishTask(process.cwd(), positionals[0], { handoff, skipGates })
  if (!res.ok) throw new Error(res.error)
  if (!res.gitRepo) process.stdout.write('   ⚠️  não é repositório git — enforcement de escopo pulado.\n')
  if (res.gates?.length) {
    for (const line of summarize(res.gates).split('\n')) {
      process.stdout.write(`   ${line}\n`)
    }
  }
  if (res.handoff) process.stdout.write('   📝 handoff registrado no banco.\n')
  if (res.statusHandoffMissing) {
    process.stdout.write('   ⚠️  status.md do módulo não tem bloco ## Handoff — preencha (feito/pendências/decisões).\n')
  }
  process.stdout.write(`✅ ${res.name} concluída (active → done).\n`)
}
