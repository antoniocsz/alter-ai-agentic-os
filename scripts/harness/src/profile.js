import fs from 'node:fs'
import path from 'node:path'
import { PROFILES, PROFILE_INFO, profileTemplateDir } from './lib/profiles.js'

export async function profileCmd(args = []) {
  const target = args[0]

  if (target) {
    if (!PROFILES.includes(target)) {
      throw new Error(`perfil inválido: ${target} (use: ${PROFILES.join(' | ')})`)
    }
    const file = path.join(profileTemplateDir(target), 'harness.json')
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'))
    process.stdout.write(
      `perfil: ${target}\n  ${PROFILE_INFO[target]}\n\n` +
        `gates.finish: ${cfg.gates.finish.join(', ') || '—'}\n` +
        `gates.merge:  ${cfg.gates.merge.join(', ') || '—'}\n` +
        `wip:          active=${cfg.wip.active} queue=${cfg.wip.queue}\n`
    )
    return
  }

  const lines = ['Perfis disponíveis:']
  for (const p of PROFILES) {
    lines.push(`  ${p.padEnd(7)} ${PROFILE_INFO[p]}`)
  }
  lines.push('', 'use: harness init <dir> --profile <perfil>')
  process.stdout.write(lines.join('\n') + '\n')
}
