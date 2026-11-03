import fs from 'node:fs'
import path from 'node:path'
import { PROFILES, PROFILE_INFO, profileTemplateDir } from './lib/profiles.js'
import { readConfig, resolveConfig } from './lib/config.js'

export async function profileCmd(args = [], root = process.cwd()) {
  const target = args[0]

  if (target === 'set') {
    const name = args[1]
    if (!name) throw new Error(`uso: profile set <${PROFILES.join('|')}>`)
    if (!PROFILES.includes(name)) {
      throw new Error(`perfil inválido: ${name} (use: ${PROFILES.join(' | ')})`)
    }
    const defaults = JSON.parse(
      fs.readFileSync(path.join(profileTemplateDir(name), 'harness.json'), 'utf8')
    )
    const current = readConfig(root) ?? {}
    const merged = {
      ...defaults,
      profile: name,
      gates: defaults.gates,
      wip: defaults.wip,
      git: { ...defaults.git, ...(current.git ?? {}) }
    }
    fs.writeFileSync(path.join(root, 'harness.json'), JSON.stringify(merged, null, 2) + '\n')
    process.stdout.write(
      `✅ perfil do projeto alterado para "${name}".\n` +
        `   gates.finish: ${merged.gates.finish.join(', ') || '—'}\n` +
        `   gates.merge:  ${merged.gates.merge.join(', ') || '—'}\n` +
        '   revise o esqueleto/contexto do novo perfil (o código existente não é migrado).\n'
    )
    return
  }

  if (target === 'current') {
    const cfg = resolveConfig(root)
    process.stdout.write(`perfil atual: ${cfg.profile}\n  ${PROFILE_INFO[cfg.profile] ?? ''}\n`)
    return
  }

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
  lines.push('', 'use: harness init <dir> --profile <perfil> | harness profile set <perfil>')
  process.stdout.write(lines.join('\n') + '\n')
}
