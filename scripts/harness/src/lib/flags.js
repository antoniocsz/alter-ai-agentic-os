/**
 * Parser único de flags: `--k v`, `--k=v`, booleanos `--flag`.
 * Valores nunca são inferidos a partir de "não começa com --".
 */
export function parseArgs(args = []) {
  const positionals = []
  const flags = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('--') || arg === '--') {
      positionals.push(arg)
      continue
    }
    const eq = arg.indexOf('=')
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1)
      continue
    }
    const key = arg.slice(2)
    const next = args[i + 1]
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true
    } else {
      flags[key] = next
      i++
    }
  }

  return { positionals, flags }
}

export function flagString(flags, name, fallback = null) {
  const value = flags[name]
  return value === undefined || value === true ? fallback : String(value)
}

export function flagBool(flags, name) {
  return flags[name] === true || flags[name] === 'true'
}
