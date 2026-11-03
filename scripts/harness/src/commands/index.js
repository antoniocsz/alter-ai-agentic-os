import { readFileSync } from 'node:fs'
import { init } from '../init.js'
import { moduleCmd } from '../module.js'
import { start } from '../start.js'
import { finish } from '../finish.js'
import { check } from '../check.js'
import { sync } from '../sync.js'
import { logCmd, historyCmd } from '../log.js'
import { kanban } from '../kanban.js'
import { requeue, reopen } from '../requeue.js'
import { task } from '../task.js'
import { report } from '../report.js'
import { update } from '../update.js'
import { workspace } from '../workspace.js'
import { versionCmd, changelogCmd } from '../version.js'
import { profileCmd } from '../profile.js'
import { featureCmd } from '../feature.js'
import { worktreeCmd } from '../worktree.js'
import { gatesCmd } from '../gates.js'
import { sessionCmd } from '../session.js'
import { recallCmd } from '../recall.js'
import { memoryCmd } from '../memory.js'
import { statusCmd } from '../status.js'
import { adapterCmd } from '../adapter.js'

export const usage = `harness <comando> [args]

Comandos:
  init <dir>          Gera projeto novo [--profile <p>] [--tools opencode,claude,codex]
                      [--prisma] [--git [--branch <b>]]
                      ou, com --workspace <dir>: gera um workspace (delega p/ workspace init)
  profile [perfil]    Lista os perfis de projeto (ou detalha um)
  adapter [tool]      Instala (ou lista) adaptadores de tool no projeto atual
  feature <slug>      Cria context/features/<slug>/ (spec.md + plan.md)
  worktree <sub>      start <task> | finish <task> [--keep] [--skip-gates] | list | prune
  gates [--phase finish|merge] [--json]   Roda os gates do harness.json
  status              WIP, ativas, worktrees, próximas e últimas sessões (prime de sessão)
  session <end|list>  Memória local: end "<resumo>" | list [--limit n]
  memory <list|prune> Memória local: list | prune [--days n] [--apply] (arquiva antigas)
  recall "<termo>"    Busca em sessões, tasks, notas e docs [--limit n] [--json]
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
Flags do task:  --feature <slug> | --module <m> | --agent backend|frontend|mobile | --scope "p1,p2" | --dep <task> | --complexity
Flags do finish: --handoff "<resumo>" | --skip-gates
Flag global:    --project <projeto> (ou -p) roda o comando dentro do projeto do workspace
`

function harnessVersion() {
  return JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version
}

export const commands = {
  init: async (args) => {
    if (args.includes('--workspace')) {
      await workspace(['init', ...args.filter((a) => a !== '--workspace')])
    } else {
      await init(args)
    }
  },
  module: moduleCmd,
  profile: profileCmd,
  adapter: adapterCmd,
  feature: featureCmd,
  worktree: worktreeCmd,
  gates: gatesCmd,
  status: statusCmd,
  session: sessionCmd,
  memory: memoryCmd,
  recall: recallCmd,
  task,
  start,
  finish,
  requeue,
  reopen,
  sync,
  log: logCmd,
  history: historyCmd,
  report,
  update,
  kanban,
  workspace,
  check,
  changelog: changelogCmd,
  version: (args) => {
    if (args.includes('--bump')) {
      versionCmd(args)
    } else {
      process.stdout.write(`harness ${harnessVersion()}\n`)
    }
  },
  '--version': (args) => commands.version(args),
  '-v': (args) => commands.version(args),
  help: () => {
    process.stdout.write(usage)
  },
  '--help': () => commands.help(),
  '-h': () => commands.help()
}

export async function dispatch(cmd, args) {
  const handler = commands[cmd]
  if (!handler) {
    process.stderr.write(`Comando desconhecido: ${cmd}\n\n${usage}`)
    process.exit(1)
  }
  await handler(args)
}
