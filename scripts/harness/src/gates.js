import { resolveConfig } from './lib/config.js'
import { runGates, summarize, firstFailure } from './lib/gates.js'

export async function gatesCmd(args = []) {
  const root = process.cwd()
  const phaseIdx = args.indexOf('--phase')
  const phase = phaseIdx !== -1 ? args[phaseIdx + 1] : 'finish'
  if (!['finish', 'merge'].includes(phase)) {
    throw new Error(`fase inválida: ${phase} (use finish | merge)`)
  }

  const gates = resolveConfig(root).gates?.[phase] ?? []
  const results = runGates(root, gates, { phase })

  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify({ phase, gates, results }, null, 2) + '\n')
  } else {
    if (results.length === 0) {
      process.stdout.write(`nenhum gate declarado em gates.${phase}.\n`)
    } else {
      for (const line of summarize(results).split('\n')) process.stdout.write(`${line}\n`)
    }
  }

  const failed = firstFailure(results)
  if (failed) process.exitCode = 1
}
