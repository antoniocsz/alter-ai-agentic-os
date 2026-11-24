import { parseArgs, flagBool } from './lib/flags.js'
import { resolveExecutable, toolVersion } from './lib/runner.js'
import { DRIVERS, driverFor } from './run.js'

/** Permissões padrão de cada driver (o que o harness passa sem --unsafe). */
const DEFAULTS = {
  claude: '--permission-mode acceptEdits (+ deny do perfil de sandbox)',
  codex: '--sandbox workspace-write',
  opencode: 'exige --unsafe (o opencode run pode aprovar sozinho)',
  gemini: '--approval-mode auto_edit'
}

/**
 * `harness runtimes [--json]` — quais tools de agente estão instaladas, onde, em que versão e o
 * comando que o `harness run` executa com cada uma (task 111). Só lê `--version`; não gasta uso.
 */
export function detectRuntimes(env = process.env) {
  return Object.keys(DRIVERS).map((name) => {
    const driver = driverFor(name)
    const exe = resolveExecutable(driver.bin, { env })
    return {
      tool: name,
      installed: Boolean(exe),
      path: exe?.file ?? null,
      version: exe ? toolVersion(exe, { env }) : null,
      command: [driver.bin, ...driver.command({})].join(' '),
      defaults: DEFAULTS[name] ?? null,
      install: exe ? null : driver.installHint,
      requires_unsafe: Boolean(driver.requiresUnsafe)
    }
  })
}

export async function runtimesCmd(args) {
  const { flags } = parseArgs(args)
  const rows = detectRuntimes()

  if (flagBool(flags, 'json')) {
    process.stdout.write(JSON.stringify(rows, null, 2) + '\n')
    return
  }
  const out = []
  for (const r of rows) {
    out.push(`${r.installed ? '✅' : '—'} ${r.tool.padEnd(9)} ${r.installed ? `${r.version ?? 'versão n/d'} · ${r.path}` : 'não instalado'}`)
    out.push(`   executa: ${r.command}  (prompt pelo stdin)`)
    out.push(`   padrão: ${r.defaults}`)
    if (!r.installed) out.push(`   instalar: ${r.install}`)
  }
  out.push('', 'teste uma tool: harness run <task> --tool <tool> --raw .tmp/<tool>-raw.jsonl')
  process.stdout.write(out.join('\n') + '\n')
}
