import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Executor mínimo de gates declarados em harness.json.
 * Fase 3: executa scripts do package.json; pula gates desconhecidos ou sem
 * node_modules. O motor completo (por perfil, affected-only) chega na Fase 4.
 */
export function runGates(root, gates = []) {
  const results = []
  if (!gates.length) return results

  let pkg = null
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  } catch {}

  const hasModules = fs.existsSync(path.join(root, 'node_modules'))

  for (const gate of gates) {
    if (gate === 'scope') {
      results.push({ gate, status: 'skipped', reason: 'validado pelo pipeline' })
      continue
    }
    if (!pkg?.scripts?.[gate]) {
      results.push({ gate, status: 'skipped', reason: 'script ausente no package.json' })
      continue
    }
    if (!hasModules) {
      results.push({ gate, status: 'skipped', reason: 'node_modules ausente na worktree' })
      continue
    }
    try {
      execSync(`pnpm run ${gate}`, { cwd: root, stdio: 'pipe', encoding: 'utf8' })
      results.push({ gate, status: 'passed' })
    } catch (err) {
      const output = `${err.stdout ?? ''}${err.stderr ?? ''}`.trim().slice(-4000)
      results.push({ gate, status: 'failed', output })
    }
  }

  return results
}

export function firstFailure(results) {
  return results.find((r) => r.status === 'failed')
}
