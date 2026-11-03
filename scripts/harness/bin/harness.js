#!/usr/bin/env node
import { dispatch, usage } from '../src/commands/index.js'
import { findWorkspaceRoot, loadRegistry, resolveProject } from '../src/lib/workspace.js'

// --project <nome> | -p <nome> | --project=<nome> → chdir para o projeto do workspace
function applyProjectFlag(rawArgs) {
  const idx = rawArgs.findIndex(
    (a) => a === '--project' || a === '-p' || a.startsWith('--project=')
  )
  if (idx === -1) return rawArgs

  let name
  if (rawArgs[idx].startsWith('--project=')) {
    name = rawArgs[idx].slice('--project='.length)
  } else {
    name = rawArgs[idx + 1]
    if (!name || name.startsWith('-')) {
      throw new Error('uso: harness <comando> ... --project <projeto>')
    }
  }

  const wsRoot = findWorkspaceRoot(process.cwd())
  if (!wsRoot) {
    throw new Error(
      `não encontrei workspace para resolver o projeto "${name}".\n` +
        '  Rode a partir do workspace ou defina HARNESS_WORKSPACE.'
    )
  }
  const reg = loadRegistry(wsRoot)
  const proj = resolveProject(reg, name)
  process.chdir(proj.path)

  const removeIdx = new Set([idx])
  if (!rawArgs[idx].startsWith('--project=')) removeIdx.add(idx + 1)
  return rawArgs.filter((a, i) => !removeIdx.has(i))
}

const rawArgs = process.argv.slice(2)

let cmd, args
try {
  const [parsedCmd, ...parsedArgs] = applyProjectFlag(rawArgs)
  cmd = parsedCmd
  args = parsedArgs
} catch (err) {
  process.stderr.write(`erro: ${err.message}\n`)
  process.exit(1)
}

try {
  if (cmd === undefined) {
    process.stdout.write(usage)
  } else {
    await dispatch(cmd, args)
  }
} catch (err) {
  process.stderr.write(`erro: ${err.message}\n`)
  process.exit(1)
}
