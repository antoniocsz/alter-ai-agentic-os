import { execSync } from 'node:child_process'
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

function run(command, root) {
  try {
    const stdout = execSync(command, { cwd: root, stdio: 'pipe', encoding: 'utf8' })
    return { ok: true, output: stdout.slice(-2000) }
  } catch (err) {
    const output = `${err.stdout ?? ''}${err.stderr ?? ''}`.trim().slice(-4000)
    return { ok: false, output }
  }
}

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

export function runGates(root, gates = [], opts = {}) {
  const results = []
  if (!gates.length) return results

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
        push(gate, 'skipped', { reason: 'sem script test/vitest' })
        continue
      }
      if (needsModules) {
        push(gate, 'skipped', { reason: 'node_modules ausente' })
        continue
      }
      const command = pkg?.devDependencies?.vitest
        ? 'pnpm exec vitest run --changed'
        : 'pnpm run test'
      const res = run(command, root)
      push(gate, res.ok ? 'passed' : 'failed', res.ok ? {} : { output: res.output })
      continue
    }

    if (!pkg?.scripts?.[gate]) {
      push(gate, 'skipped', { reason: 'script ausente no package.json' })
      continue
    }
    if (needsModules) {
      push(gate, 'skipped', { reason: 'node_modules ausente' })
      continue
    }
    const res = run(`pnpm run ${gate}`, root)
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
