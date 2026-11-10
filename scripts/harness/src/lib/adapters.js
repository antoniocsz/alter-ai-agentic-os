import fs from 'node:fs'
import path from 'node:path'
import { harnessRoot } from './paths.js'
import { copyDir, render } from './templates.js'

export const TOOLS = ['opencode', 'claude', 'codex', 'browser']

/** Tools-alvo da camada `browser` (recebem config MCP do Playwright). */
export const MCP_TARGETS = ['opencode', 'claude', 'codex']

export const BROWSER_DEFAULT_PACKAGE = '@playwright/mcp@latest'
export const BROWSER_SERVER_NAME = 'browser'

export const TOOL_INFO = {
  opencode: 'OpenCode (.opencode/agent|skill|command + AGENTS.md nativo)',
  claude: 'Claude Code (CLAUDE.md @import + .claude/agents|skills|commands + settings.json)',
  codex: 'Codex (AGENTS.md nativo + .codex/prompts para copiar p/ ~/.codex/prompts)',
  browser: 'Browser MCP (Playwright via npx, zero deps — opencode.json | .mcp.json | .codex/prompts)'
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

  if (tool === 'codex') {
    copyDir(path.join(kit, 'adapters', 'codex'), target, { vars, renderAll: true })
    return
  }

  // tool === 'browser' — config MCP do Playwright nos tools-alvo pedidos.
  return installBrowser(target, { ...opts, vars, kit })
}

/**
 * Camada `browser`: config MCP do Playwright por tool-alvo (opencode → opencode.json,
 * claude → .mcp.json, codex → instrução em .codex/prompts/browser.md).
 * Zero instalação: o server resolve via `npx` na 1ª execução do agente (guard rail 4 —
 * nada toca package.json/lockfile).
 *
 * @param {string} target raiz do projeto
 * @param {{tools?: string[], targetTool?: string, browserPackage?: string, vars: Record<string,string>, kit: string}} opts
 * @returns {Record<string, 'created'|'merged'|'noop'|'written'>} status por tool-alvo
 */
function installBrowser(target, opts = {}) {
  const pkg = opts.browserPackage ?? BROWSER_DEFAULT_PACKAGE
  if (!/^[A-Za-z0-9@/._-]+$/.test(pkg)) {
    throw new Error(`browser-package inválida: ${pkg} (use um nome de pacote npm válido)`)
  }

  const requested = opts.tools ?? (opts.targetTool ? [opts.targetTool] : [])
  const targets = []
  for (const t of requested) {
    if (t === 'browser') continue // a própria camada browser não é um tool-alvo
    if (!MCP_TARGETS.includes(t)) {
      throw new Error(`tool desconhecida: ${t} (o browser escreve em: ${MCP_TARGETS.join(' | ')})`)
    }
    targets.push(t)
  }

  const results = {}
  if (targets.includes('opencode')) {
    results.opencode = upsertJsonSection(
      path.join(target, 'opencode.json'),
      'mcp',
      BROWSER_SERVER_NAME,
      { type: 'local', command: ['npx', '-y', pkg] },
      { $schema: 'https://opencode.ai/config.json', mcp: { [BROWSER_SERVER_NAME]: { type: 'local', command: ['npx', '-y', pkg] } } }
    )
  }
  if (targets.includes('claude')) {
    results.claude = upsertJsonSection(
      path.join(target, '.mcp.json'),
      'mcpServers',
      BROWSER_SERVER_NAME,
      { command: 'npx', args: ['-y', pkg] }
    )
  }
  if (targets.includes('codex')) {
    copyDir(path.join(opts.kit, 'adapters', 'browser'), target, { vars: opts.vars, renderAll: true })
    results.codex = 'written'
  }
  return results
}

/**
 * Injeção segura de um server MCP num arquivo de config JSON.
 *
 * Regras da spec `browser-adapter`:
 * - arquivo ausente → cria JSON canônico novo (seed, quando dado)
 * - JSON estrito, sem conflito → insere preservando o resto (entries existentes intactas)
 * - server já presente na seção → no-op idempotente
 * - JSONC/comentários ou estrutura inesperada → fail-safe: nada é escrito e o erro
 *   carrega o bloco de merge manual (bin imprime em stderr → exit ≠ 0)
 *
 * @param {string} file caminho absoluto do arquivo de config
 * @param {string} sectionKey chave da seção ("mcp" | "mcpServers")
 * @param {string} serverName nome do server ("browser")
 * @param {object} entry objeto do server
 * @param {object} [seed] documento canônico usado na criação do arquivo
 * @returns {'created'|'merged'|'noop'}
 */
export function upsertJsonSection(file, sectionKey, serverName, entry, seed = null) {
  if (!fs.existsSync(file)) {
    const doc = seed ?? { [sectionKey]: { [serverName]: entry } }
    fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n')
    return 'created'
  }

  let config
  try {
    config = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    throw manualMergeError(file, sectionKey, serverName, entry, `não é JSON estrito (comentário/JSONC?): ${err.message}`)
  }
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw manualMergeError(file, sectionKey, serverName, entry, 'a raiz não é um objeto JSON')
  }
  const section = config[sectionKey]
  if (section !== undefined && (typeof section !== 'object' || section === null || Array.isArray(section))) {
    throw manualMergeError(file, sectionKey, serverName, entry, `"${sectionKey}" existe mas não é um objeto`)
  }
  if (section && serverName in section) return 'noop'

  config[sectionKey] = { ...section, [serverName]: entry }
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n')
  return 'merged'
}

/** Erro fail-safe: mensagem carrega o bloco a fundir manualmente (nada foi escrito). */
function manualMergeError(file, sectionKey, serverName, entry, reason) {
  const block = JSON.stringify({ [sectionKey]: { [serverName]: entry } }, null, 2)
  return new Error(
    `fail-safe: ${file} não foi alterado (${reason}).\n` +
      `Funde manualmente este bloco em ${file}:\n\n${block}\n`
  )
}
