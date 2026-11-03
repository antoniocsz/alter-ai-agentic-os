// Script principal (perfil script). Mantenha pequeno e testável: extraia funções
// puras para `src/` e deixe este arquivo apenas orquestrar entrada/saída.
export function main(args = process.argv.slice(2)) {
  if (args.length === 0) {
    console.log('uso: node src/main.js <args...>')
    return 0
  }
  console.log(`args: ${args.join(' ')}`)
  return 0
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  process.exitCode = main()
}
