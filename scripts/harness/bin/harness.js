#!/usr/bin/env node
import { init } from '../src/init.js'
import { moduleCmd } from '../src/module.js'
import { start } from '../src/start.js'
import { finish } from '../src/finish.js'
import { check } from '../src/check.js'

const usage = `harness <comando> [args]

Comandos:
  init <dir>          Gera um projeto novo com camada harness + monorepo mínimo
  module <nome>       Scaffold de módulo (packages/modules/<nome> + context/)
  start <task>        Move queue/<task> → active/ com checagem de conflito de escopo
  finish <task>       Valida escopo (git diff) e move active/<task> → done/
  check [--json]      Valida o protocolo (pipeline, escopos, módulos, projeto)
  help                Mostra esta ajuda
`

const [cmd, ...args] = process.argv.slice(2)

try {
  switch (cmd) {
    case 'init':
      await init(args)
      break
    case 'module':
      await moduleCmd(args)
      break
    case 'start':
      await start(args)
      break
    case 'finish':
      await finish(args)
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