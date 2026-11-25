import { execFile, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { scanSecrets } from './redact.js'

/**
 * Motor de gates do harness.
 *
 * Gates nativos:
 *   scope          — validado pelo pipeline (aqui: skipped)
 *   test:affected  — vitest --changed quando disponível; senão `pnpm run test`
 *   links          — links relativos em markdown (README, docs/, context/)
 *   artifact       — exige artefato em assets/ ou BRIEF.md preenchido
 *
 * Qualquer outro nome é tratado como script do package.json (`pnpm run <gate>`).
 */

function readPackage(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  } catch {
    return null
  }
}

function hasDependencies(pkg) {
  if (!pkg) return false
  return (
    Object.keys(pkg.dependencies ?? {}).length > 0 ||
    Object.keys(pkg.devDependencies ?? {}).length > 0
  )
}

function runArgs(bin, args, root) {
  try {
    const opts = { cwd: root, stdio: 'pipe', encoding: 'utf8' }
    // No Windows, pnpm é um .cmd e precisa de shell; os args são validados
    // (gate ^[a-z0-9:_-]+$) para não permitir injeção.
    if (process.platform === 'win32') opts.shell = true
    opts.timeout = Number(process.env.HARNESS_GATE_TIMEOUT_MS ?? 10 * 60_000)
    const stdout = execFileSync(bin, args, opts)
    return { ok: true, output: stdout.slice(-2000) }
  } catch (err) {
    const output =
      err.code === 'ETIMEDOUT'
        ? 'gate excedeu o timeout (HARNESS_GATE_TIMEOUT_MS)'
        : `${err.stdout ?? ''}${err.stderr ?? ''}`.trim().slice(-4000)
    return { ok: false, output }
  }
}

// `pnpm run` pode criar pnpm-lock.yaml como efeito colateral. Removemos apenas
// se o arquivo não existia antes do gate — nunca apagamos um lockfile real.
function runClean(bin, args, root) {
  const lock = path.join(root, 'pnpm-lock.yaml')
  const existed = fs.existsSync(lock)
  try {
    return runArgs(bin, args, root)
  } finally {
    if (!existed) {
      try {
        fs.rmSync(lock, { force: true })
      } catch {}
    }
  }
}

const GATE_RE = /^[a-z0-9:_-]+$/

const MD_LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

export function checkLinks(root) {
  const files = []
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.md')) files.push(full)
    }
  }
  walk(path.join(root, 'docs'))
  walk(path.join(root, 'context'))
  for (const extra of ['README.md']) {
    const full = path.join(root, extra)
    if (fs.existsSync(full)) files.push(full)
  }

  const broken = []
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    for (const match of content.matchAll(MD_LINK)) {
      const raw = match[1]
      if (/^(https?:|mailto:|tel:|#)/i.test(raw)) continue
      const target = raw.split('#')[0].split('?')[0]
      if (!target) continue
      const resolved = path.resolve(path.dirname(file), target)
      if (!fs.existsSync(resolved)) {
        broken.push(`${path.relative(root, file)} → ${raw}`)
      }
    }
  }
  return broken
}

export function checkArtifact(root) {
  const assets = path.join(root, 'assets')
  const files = []
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.gitkeep') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else files.push(full)
    }
  }
  walk(assets)
  if (files.length > 0) return null

  const brief = path.join(root, 'BRIEF.md')
  if (fs.existsSync(brief)) {
    const content = fs.readFileSync(brief, 'utf8')
    const filled = content
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith('#') && !l.trim().startsWith('>'))
    if (filled.length > 0) return null
  }
  return 'sem artefato em assets/ e BRIEF.md vazio'
}

/**
 * `runGates` sem bloquear o processo (task 128): roda num processo Node filho. O `harness serve`
 * usa isso depois dos runs que dispara — testes longos não travam o servidor.
 */
export function runGatesAsync(root, gates = [], opts = {}) {
  if (!gates.length) return Promise.resolve([])
  const script =
    `import(${JSON.stringify(new URL(import.meta.url).href)}).then((m) => {` +
    `const a = JSON.parse(process.argv[1]); process.stdout.write(JSON.stringify(m.runGates(a.root, a.gates, a.opts)))})`
  return new Promise((resolve) => {
    const started = Date.now()
    execFile(
      process.execPath,
      ['--input-type=module', '-e', script, JSON.stringify({ root, gates, opts: { strict: Boolean(opts.strict) } })],
      { cwd: root, env: opts.env ?? process.env, maxBuffer: 16 * 1024 * 1024, windowsHide: true, timeout: Number(process.env.HARNESS_GATE_TIMEOUT_MS ?? 10 * 60_000) * Math.max(1, gates.length) },
      (err, stdout) => {
        try {
          const results = JSON.parse(String(stdout).trim().split('\n').pop())
          resolve(results.map((r) => ({ ...r, duration_ms: null })))
        } catch {
          resolve([{ gate: gates.join(','), status: 'failed', output: `gates não rodaram: ${err?.message ?? 'saída inválida'}`.slice(0, 2000), duration_ms: Date.now() - started }])
        }
      }
    )
  })
}

/** Qualidade agregada: algum falhou → failed; algum passou → passed; senão skipped. */
export function qualityOf(results = []) {
  if (!results.length) return null
  if (results.some((r) => r.status === 'failed')) return 'failed'
  if (results.some((r) => r.status === 'passed')) return 'passed'
  return 'skipped'
}

export function runGates(root, gates = [], opts = {}) {
  const results = []
  if (!gates.length) return results
  const strict = Boolean(opts.strict)
  const skip = (gate, reason) =>
    strict
      ? results.push({ gate, status: 'failed', output: `gate não executável (strict): ${reason}` })
      : results.push({ gate, status: 'skipped', reason })

  const pkg = readPackage(root)
  const needsModules = hasDependencies(pkg) && !fs.existsSync(path.join(root, 'node_modules'))

  const push = (gate, status, extra = {}) => results.push({ gate, status, ...extra })

  for (const gate of gates) {
    if (gate === 'scope') {
      push(gate, 'skipped', { reason: 'validado pelo pipeline' })
      continue
    }

    if (gate === 'secrets') {
      const findings = scanSecrets(root)
      if (findings.length === 0) push(gate, 'passed')
      else push(gate, 'failed', { output: `possíveis segredos:\n  ${findings.join('\n  ')}` })
      continue
    }

    if (gate === 'links') {      const broken = checkLinks(root)
      if (broken.length === 0) push(gate, 'passed')
      else push(gate, 'failed', { output: `links quebrados:\n  ${broken.join('\n  ')}` })
      continue
    }

    if (gate === 'artifact') {
      const problem = checkArtifact(root)
      if (!problem) push(gate, 'passed')
      else push(gate, 'failed', { output: problem })
      continue
    }

    if (gate === 'test:affected') {
      if (!pkg?.scripts?.test && !pkg?.devDependencies?.vitest) {
        skip(gate, 'sem script test/vitest')
        continue
      }
      if (needsModules) {
        skip(gate, 'node_modules ausente')
        continue
      }
      const command = pkg?.devDependencies?.vitest
        ? ['pnpm', ['exec', 'vitest', 'run', '--changed']]
        : ['pnpm', ['run', 'test']]
      const res = runClean(command[0], command[1], root)
      push(gate, res.ok ? 'passed' : 'failed', res.ok ? {} : { output: res.output })
      continue
    }

    if (!GATE_RE.test(gate)) {
      push(gate, 'failed', { output: 'nome de gate inválido (use apenas a-z, 0-9, :, _, -)' })
      continue
    }
    if (!pkg?.scripts?.[gate]) {
      skip(gate, 'script ausente no package.json')
      continue
    }
    if (needsModules) {
      skip(gate, 'node_modules ausente')
      continue
    }
    const res = runClean('pnpm', ['run', gate], root)
    push(gate, res.ok ? 'passed' : 'failed', res.ok ? {} : { output: res.output })
  }

  return results
}

export function firstFailure(results) {
  return results.find((r) => r.status === 'failed')
}

export function summarize(results) {
  return results
    .map((r) => {
      const icon = r.status === 'passed' ? '✅' : r.status === 'failed' ? '❌' : '⏭️'
      return `${icon} ${r.gate}${r.reason ? ` (${r.reason})` : ''}`
    })
    .join('\n')
}
