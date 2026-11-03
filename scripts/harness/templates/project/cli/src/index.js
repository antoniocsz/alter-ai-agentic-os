#!/usr/bin/env node
export async function run(args = []) {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log('uso: {{NAME}} <comando>')
    return 0
  }
  console.error(`comando desconhecido: ${args[0]}`)
  return 1
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  process.exitCode = await run(process.argv.slice(2))
}
