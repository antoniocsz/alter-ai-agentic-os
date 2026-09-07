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

const usage = `harness <comando> [args]

Comandos:
  init <dir>          Gera projeto novo [--prisma] [--git [--branch <b>]] [--bare]
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
  check [--json]      Valida o protocolo (pipeline, escopos, seções, módulos)
  version             Mostra a versão do harness
  help                Mostra esta ajuda

Flags do check: --json | --barrel | --lint | --typecheck | --db
Flags do task:  --module <m> | --agent backend|frontend|mobile | --scope "p1,p2" | --dep <task> | --complexity
Flags do finish: --handoff "<resumo>"
`

const [cmd, ...args] = process.argv.slice(2)
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version

try {
  switch (cmd) {
    case 'init':
      await init(args)
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
      process.stdout.write(`harness ${version}\n`)
      break
    case 'kanban':
      await kanban(args)
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