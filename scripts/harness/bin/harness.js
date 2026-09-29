#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { init } from '../src/init.js'
import { moduleCmd } from '../src/module.js'
import { start } from '../src/start.js'
import { finish } from '../src/finish.js'
import { check } from '../src/check.js'
import { sync } from '../src/sync.js'
import { logCmd, historyCmd } from '../src/log.js'
import { kanban } from '../src/kanban.js'
import { requeue, reopen } from '../src/requeue.js'
import { task } from '../src/task.js'
import { report } from '../src/report.js'
import { update } from '../src/update.js'
import { workspace } from '../src/workspace.js'
import { versionCmd, changelogCmd } from '../src/version.js'
import { findWorkspaceRoot, loadRegistry, resolveProject } from '../src/lib/workspace.js'

const usage = `harness <comando> [args]

Comandos:
  init <dir>          Gera projeto novo [--prisma] [--git [--branch <b>]] [--bare]
                      ou, com --workspace <dir>: gera um workspace (delega p/ workspace init)
  module <nome>       Scaffold de módulo [--with-prisma] [--with-http]
  task "<descrição>"  Cria task na queue com numeração automática e ## Escopo
  start <task>        Move queue/<task> → active/ com checagem de conflito de escopo
  finish <task>       Valida escopo (git diff) e move active/<task> → done/
  requeue <task>      Move active/<task> → queue/ (volta para a fila)
  reopen <task>       Move done/<task> → active/ (reabre)
  sync                Reindexa o banco SQLite (.harness/harness.db) a partir do markdown
  log "<texto>"       Registra uma interação no banco [--task] [--kind] [--source]
  history <task>      Mostra eventos e interações de uma task
  report              Métricas do banco [--format table|json|csv] [--module] [--days]
  kanban [--serve [porta] | --out <arquivo>]   Painel kanban (servidor ou HTML estático)
  update [--source <cam>] [--dry-run] Re-sincroniza a camada harness a partir da fonte (ou HARNESS_SOURCE)
  workspace ...       Opera sobre múltiplos projetos (ver "harness workspace help")
  check [--json]      Valida o protocolo (pipeline, escopos, seções, módulos)
  version [--bump patch|minor|major]  Mostra ou incrementa a versão do harness
  changelog [--out <arquivo>]  Gera CHANGELOG.md a partir dos handoffs registrados
  version             Mostra a versão do harness
  help                Mostra esta ajuda

Flags do check: --json | --barrel | --lint | --typecheck | --db
Flags do task:  --module <m> | --agent backend|frontend|mobile | --scope "p1,p2" | --dep <task> | --complexity
Flags do finish: --handoff "<resumo>"
Flag global:    --project <projeto> (ou -p) roda o comando dentro do projeto do workspace
`

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

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version

try {
  switch (cmd) {
    case 'init':
      if (args.includes('--workspace')) {
        // harness init --workspace <dir> → delega para workspace init
        await workspace(['init', ...args.filter((a) => a !== '--workspace')])
      } else {
        await init(args)
      }
      break
    case 'module':
      await moduleCmd(args)
      break
    case 'task':
      await task(args)
      break
    case 'start':
      await start(args)
      break
    case 'finish':
      await finish(args)
      break
    case 'requeue':
      await requeue(args)
      break
    case 'reopen':
      await reopen(args)
      break
    case 'sync':
      await sync(args)
      break
    case 'log':
      await logCmd(args)
      break
    case 'history':
      await historyCmd(args)
      break
    case 'report':
      await report(args)
      break
    case 'update':
      await update(args)
      break
    case 'version':
    case '--version':
    case '-v':
      if (args.includes('--bump')) {
        versionCmd(args)
      } else {
        process.stdout.write(`harness ${version}\n`)
      }
      break
    case 'changelog':
      changelogCmd(args)
      break
    case 'kanban':
      await kanban(args)
      break
    case 'workspace':
      await workspace(args)
      break
    case 'check':
      await check(args)
      break
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      process.stdout.write(usage)
      break
    default:
      process.stderr.write(`Comando desconhecido: ${cmd}\n\n${usage}`)
      process.exit(1)
  }
} catch (err) {
  process.stderr.write(`erro: ${err.message}\n`)
  process.exit(1)
}