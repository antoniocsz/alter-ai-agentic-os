import fs from 'node:fs'
import path from 'node:path'
import { parseArgs, flagBool, flagString } from './lib/flags.js'
import { buildContextPackage, renderContextMarkdown } from './lib/context.js'
import { openDb } from './lib/db.js'
import { DigestError, generateDigest } from './lib/digest.js'
import { budgetFor, budgetGate, resolveRunOptions, withSigint, printRunEvent } from './run.js'

/** `harness context <task> [--budget n] [--json | --out arquivo]` — pacote de contexto (task 103). */
/**
 * `harness context digest <módulo> --tool <t> [--model m] [--max-words 400] [--dry-run]
 *  [--ignore-budget] [--unsafe]` (task 133): um agente resume o histórico de handoffs em
 *  context/modules/<m>/digest.md; o pacote de contexto passa a usá-lo.
 */
async function digestCmd(root, positionals, flags) {
  const mod = positionals[1]
  if (!mod || !flagString(flags, 'tool')) {
    throw new Error('uso: harness context digest <módulo> --tool <claude|codex|opencode|gemini> [--model m] [--max-words 400] [--dry-run]')
  }
  const maxRaw = flagString(flags, 'max-words', '400')
  const maxWords = Number(maxRaw)
  if (!Number.isInteger(maxWords) || maxWords < 50 || maxWords > 3000) throw new Error(`--max-words inválido: ${maxRaw} (50–3000)`)
  const { probe: driver, opts, unsafe } = resolveRunOptions(flags, flagString(flags, 'tool'))
  if (!unsafe) {
    opts.readOnly = true
    if (driver.id === 'claude') opts.permissionMode = 'plan'
  }
  const money = budgetFor(root, flags)
  const db = openDb(root)
  const { signal, dispose } = withSigint()
  try {
    const gate = budgetGate(db, money.budget, money.ignore, `module:${mod}`)
    if (gate.skip) throw new Error(`orçamento estourado: ${gate.skip} — veja harness budget (ou --ignore-budget)`)
    process.stdout.write(`📝 resumindo o histórico de ${mod} com ${driver.id}…\n`)
    const res = await generateDigest({
      root, db, mod, driver, opts, unsafe, signal, maxWords,
      limit: gate.limit ?? null,
      dryRun: flagBool(flags, 'dry-run'),
      onEvent: (ev) => printRunEvent(ev)
    })
    if (!res.written) process.stdout.write(`\n${res.digest}\n\n(dry-run: nada gravado)\n`)
    else process.stdout.write(`✅ ${res.file} gravado (run ${res.runId}) · histórico ~${res.tokens.history} → digest ~${res.tokens.digest} tokens (estimado)\n   revise e commite; o pacote de contexto já usa o digest.\n`)
  } catch (err) {
    if (err instanceof DigestError) throw new Error(err.message)
    throw err
  } finally {
    dispose()
    db.close()
  }
}

export async function contextCmd(args) {
  const root = process.cwd()
  const { positionals, flags } = parseArgs(args)
  if (positionals[0] === 'digest') return digestCmd(root, positionals, flags)
  const arg = positionals[0]
  if (!arg) throw new Error('uso: harness context <task> [--budget <tokens>] [--full] [--stats | --json | --out <arquivo>]')

  const raw = flagString(flags, 'budget')
  if (flags.budget === true) throw new Error('--budget exige um número de tokens (ex.: --budget 6000)')
  const budget = raw === null ? null : Number(raw)
  if (budget !== null && (!Number.isInteger(budget) || budget <= 0)) {
    throw new Error(`--budget inválido: ${raw} (use inteiro > 0)`)
  }

  const pkg = buildContextPackage(root, arg, { budget, optimize: flagBool(flags, 'full') ? false : null })

  // `--stats` (task 132): tokens por seção, integral × otimizado, e o que ficou de fora.
  if (flagBool(flags, 'stats')) {
    const rows = pkg.sections.map((s) => [s.id, String(s.tokens), String(s.full_tokens), s.outline ? 'resumida' : s.compacted ? 'compactada' : '—'])
    for (const o of pkg.omitted) rows.push([o.id, '0', String(o.tokens), 'omitida'])
    const header = ['seção', 'tokens', 'integral', 'otimização']
    const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
    const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd()
    process.stdout.write(
      [
        `📦 ${pkg.task} · ~${pkg.total_tokens} tokens (estimado)${pkg.budget !== null ? ` de ${pkg.budget}` : ''} · integral ~${pkg.full_tokens} · otimizador ${pkg.optimized ? `ligado (-${pkg.saved_tokens})` : 'desligado'}`,
        line(header),
        line(widths.map((w) => '-'.repeat(w))),
        ...rows.map(line)
      ].join('\n') + '\n'
    )
    return
  }

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
