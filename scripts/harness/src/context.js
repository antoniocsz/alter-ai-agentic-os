import fs from 'node:fs'
import path from 'node:path'
import { parseArgs, flagBool, flagString } from './lib/flags.js'
import { buildContextPackage, renderContextMarkdown } from './lib/context.js'

/** `harness context <task> [--budget n] [--json | --out arquivo]` — pacote de contexto (task 103). */
export async function contextCmd(args) {
  const root = process.cwd()
  const { positionals, flags } = parseArgs(args)
  const arg = positionals[0]
  if (!arg) throw new Error('uso: harness context <task> [--budget <tokens>] [--json | --out <arquivo>]')

  const raw = flagString(flags, 'budget')
  if (flags.budget === true) throw new Error('--budget exige um número de tokens (ex.: --budget 6000)')
  const budget = raw === null ? null : Number(raw)
  if (budget !== null && (!Number.isInteger(budget) || budget <= 0)) {
    throw new Error(`--budget inválido: ${raw} (use inteiro > 0)`)
  }

  const pkg = buildContextPackage(root, arg, { budget })

  if (flagBool(flags, 'json')) {
    process.stdout.write(JSON.stringify(pkg, null, 2) + '\n')
    return
  }
  const md = renderContextMarkdown(pkg)
  const out = flagString(flags, 'out')
  if (flags.out === true) throw new Error('--out exige o caminho do arquivo')
  if (out) {
    const file = path.resolve(root, out)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, md)
    process.stdout.write(
      `📦 pacote de ${pkg.task} → ${path.relative(root, file) || file} · ${pkg.sections.length} seção(ões) · ~${pkg.total_tokens} tokens (estimado)` +
        (pkg.omitted.length ? ` · omitidas: ${pkg.omitted.map((o) => o.id).join(', ')}` : '') +
        '\n'
    )
    return
  }
  process.stdout.write(md)
}
