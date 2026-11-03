import fs from 'node:fs'
import path from 'node:path'
import { harnessRoot } from './paths.js'
import { copyDir, render } from './templates.js'

export const TOOLS = ['opencode', 'claude', 'codex']

export const TOOL_INFO = {
  opencode: 'OpenCode (.opencode/agent|skill|command + AGENTS.md nativo)',
  claude: 'Claude Code (CLAUDE.md @import + .claude/agents|skills|commands + settings.json)',
  codex: 'Codex (AGENTS.md nativo + .codex/prompts para copiar p/ ~/.codex/prompts)'
}

export function resolveTools(args = []) {
  const idx = args.indexOf('--tools')
  if (idx === -1) return ['opencode']
  const raw = args[idx + 1]
  if (!raw || raw.startsWith('-')) {
    throw new Error(`uso: --tools <${TOOLS.join(',')}>`)
  }
  const tools = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  for (const tool of tools) {
    if (!TOOLS.includes(tool)) {
      throw new Error(`tool desconhecida: ${tool} (use: ${TOOLS.join(' | ')})`)
    }
  }
  return [...new Set(tools)]
}

/**
 * Renderiza um adaptador de tool dentro do projeto. A saída é descartável:
 * pode ser regenerada a qualquer momento com `harness adapter <tool>`.
 */
export function installAdapter(tool, target, opts = {}) {
  if (!TOOLS.includes(tool)) {
    throw new Error(`tool desconhecida: ${tool} (use: ${TOOLS.join(' | ')})`)
  }

  const kit = harnessRoot()
  if (!fs.existsSync(path.join(kit, 'adapters'))) {
    throw new Error(
      `adapters não encontrados em ${kit} — rode \`harness update --source <harness>\` ` +
        'ou gere o projeto novamente com `--tools`.'
    )
  }
  const name = opts.name ?? path.basename(target)
  const profile = opts.profile ?? 'web'
  const vars = { NAME: name, PROFILE: profile }

  if (tool === 'opencode') {
    copyDir(path.join(kit, '.opencode', 'agent'), path.join(target, '.opencode', 'agent'), {
      vars,
      renderAll: true
    })
    copyDir(path.join(kit, 'adapters', 'shared', 'skill'), path.join(target, '.opencode', 'skill'), {
      vars,
      renderAll: true
    })
    copyDir(path.join(kit, 'adapters', 'shared', 'command'), path.join(target, '.opencode', 'command'), {
      vars,
      renderAll: true
    })
    return
  }

  if (tool === 'claude') {
    copyDir(path.join(kit, 'adapters', 'claude'), target, { vars, renderAll: true })
    const tplPath = path.join(target, 'CLAUDE.md.tpl')
    if (fs.existsSync(tplPath)) {
      const rendered = render(fs.readFileSync(tplPath, 'utf8'), vars)
      fs.writeFileSync(path.join(target, 'CLAUDE.md'), rendered)
      fs.rmSync(tplPath)
    }
    copyDir(path.join(kit, 'adapters', 'shared', 'skill'), path.join(target, '.claude', 'skills'), {
      vars,
      renderAll: true
    })
    copyDir(path.join(kit, 'adapters', 'shared', 'command'), path.join(target, '.claude', 'commands'), {
      vars,
      renderAll: true
    })
    return
  }

  copyDir(path.join(kit, 'adapters', 'codex'), target, { vars, renderAll: true })
}
