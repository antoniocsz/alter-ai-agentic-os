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

/**
 * Camada de sandbox (feature `sandbox-por-tool`): perfis de permissão declarados
 * e aplicados por tool no `installAdapter`. O deny é POR PREFIXO de comando — o
 * `*` só marca "tudo depois", sem glob/lógica extra.
 *
 * allow explícito do pipeline em TODOS os perfis: o harness usa `git` internamente
 * (via node) e `pnpm harness …`/`node scripts/harness/…` nunca podem casar nos denies.
 */
export const SANDBOX_DEFAULT = 'minimal'

export const SANDBOX_ALLOW = ['pnpm harness*', 'node scripts/harness*']

export const SANDBOX_PROFILES = {
  minimal: {
    label: 'minimal (default)',
    note: 'git destrutivos, rm -rf e escalada de privilégio',
    deny: [
      'git reset*',
      'git checkout*',
      'git restore*',
      'git clean*',
      'git push*',
      'rm -rf*',
      'sudo *'
    ]
  },
  strict: {
    label: 'strict',
    note: 'minimal + instaladores de dependência e rede — guard rails 4 e 9',
    deny: [
      'git reset*',
      'git checkout*',
      'git restore*',
      'git clean*',
      'git push*',
      'rm -rf*',
      'sudo *',
      'pnpm install*',
      'npm install*',
      'expo install*',
      'curl *',
      'wget *'
    ]
  }
}

/** Onde o perfil de sandbox aterrissa em cada tool. */
export const SANDBOX_SUPPORT = {
  opencode: 'frontmatter `permission:` dos agents gerados (reviewer preserva `edit: deny`)',
  claude: 'allow/deny em .claude/settings.json',
  codex: 'documentação honesta nos arquivos gerados (a tool não reforça deny)',
  browser: 'n/a — camada MCP de navegador, sem execução de comandos declarada'
}

export function resolveSandbox(value = SANDBOX_DEFAULT) {
  const profile = value ?? SANDBOX_DEFAULT
  if (!SANDBOX_PROFILES[profile]) {
    throw new Error(
      `perfil de sandbox desconhecido: "${profile}" (use: ${Object.keys(SANDBOX_PROFILES).join(' | ')})`
    )
  }
  return profile
}

/**
 * Semântica de casamento: o comando casa com o deny quando COMEÇA com o prefixo
 * do pattern (`git reset*` ⇢ `git reset`). O pipeline é inocente por construção —
 * `pnpm harness worktree finish <task>` e `node scripts/harness/…` não casam com
 * nenhum deny dos dois perfis.
 */
export function matchesSandboxDeny(command, profile = SANDBOX_DEFAULT) {
  const name = resolveSandbox(profile)
  const normalized = String(command).toLowerCase().trim()
  return SANDBOX_PROFILES[name].deny.some((pattern) =>
    normalized.startsWith(pattern.toLowerCase().replace(/\*+$/, ''))
  )
}

/** opencode → itens do mapa `permission.bash` (4 espaços de indentação por linha). */
export function opencodeDenyLines(profile = SANDBOX_DEFAULT) {
  return SANDBOX_PROFILES[resolveSandbox(profile)]
    .deny.map((pattern) => `    "${pattern}": deny`)
    .join('\n')
}

/** claude → regra de prefixo `Bash(comando:*)` (sintaxe do settings.json). */
function toClaudeRule(pattern) {
  return `Bash(${pattern.replace(/\s*\*+$/, '')}:*)`
}

export function claudePermissions(profile = SANDBOX_DEFAULT) {
  const name = resolveSandbox(profile)
  return {
    allow: SANDBOX_ALLOW.map(toClaudeRule),
    deny: SANDBOX_PROFILES[name].deny.map(toClaudeRule)
  }
}

/** Escreve (sobrescreve) o `.claude/settings.json` do projeto com as regras do perfil. */
export function writeClaudeSettings(target, profile = SANDBOX_DEFAULT) {
  const settings = { permissions: claudePermissions(profile) }
  const file = path.join(target, '.claude', 'settings.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n')
}

/** codex → seção markdown do perfil (o que declarar e o que a tool NÃO reforça). */
export function codexSandboxSection(profile = SANDBOX_DEFAULT) {
  const name = resolveSandbox(profile)
  const profileInfo = SANDBOX_PROFILES[name]
  const list = (patterns) => patterns.map((p) => `\`${p}\``).join(', ')
  return [
    '## Sandbox do harness',
    '',
    `Perfil aplicado nesta instalação: **${profileInfo.label}** — deny por prefixo de comando.`,
    '',
    `Sempre bloqueados (${profileInfo.note}): ${list(profileInfo.deny)}.`,
    `Sempre permitidos (o pipeline não pode quebrar): ${list(SANDBOX_ALLOW)}.`,
    '',
    'Fidelidade honesta: o Codex **não reforça** essas negações automaticamente —',
    'não há engine de allowlist/denylist nativa nos prompts do harness. Trate a lista',
    'acima como instrução vinculante: um comando bloqueado só sai com consentimento',
    'humano explícito (guard rails do AGENTS.md). A fonte de verdade do perfil e a',
    'matriz por tool (harness × codex) estão em `.agents/sandbox.md`; mudar o deny',
    'do perfil é decisão estrutural e exige ADR.'
  ].join('\n')
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
 *
 * `opts.kit` sobrepõe a raiz de onde os templates de `adapters/` são lidos
 * (usado pelo `update` para ressincronizar com a fonte do harness e não com
 * a cópia possivelmente antiga do projeto).
 */
export function installAdapter(tool, target, opts = {}) {
  if (!TOOLS.includes(tool)) {
    throw new Error(`tool desconhecida: ${tool} (use: ${TOOLS.join(' | ')})`)
  }

  const kit = opts.kit ?? harnessRoot()
  if (!fs.existsSync(path.join(kit, 'adapters'))) {
    throw new Error(
      `adapters não encontrados em ${kit} — rode \`harness update --source <harness>\` ` +
        'ou gere o projeto novamente com `--tools`.'
    )
  }
  const name = opts.name ?? path.basename(target)
  const profile = opts.profile ?? 'web'
  const sandbox = resolveSandbox(opts.sandbox)
  const vars = { NAME: name, PROFILE: profile }

  if (tool === 'opencode') {
    // Template da tool layer (sandbox-aware em adapters/opencode e entregue por init)
    // com fallback para os agents ao vivo do kit (instalações anteriores ao sandbox).
    const sandboxed = path.join(kit, 'adapters', 'opencode', '.opencode', 'agent')
    const agentSrc = fs.existsSync(sandboxed) ? sandboxed : path.join(kit, '.opencode', 'agent')
    copyDir(agentSrc, path.join(target, '.opencode', 'agent'), {
      vars: { ...vars, SANDBOX_DENY: opencodeDenyLines(sandbox) },
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
    writeClaudeSettings(target, sandbox)
    return
  }

  if (tool === 'codex') {
    copyDir(path.join(kit, 'adapters', 'codex'), target, {
      vars: { ...vars, SANDBOX_SECTION: codexSandboxSection(sandbox) },
      renderAll: true
    })
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

const ADAPTERS_MARKER_DIR = '.harness'
const ADAPTERS_MARKER_FILE = 'adapters.json'

/**
 * Lê o marcador de adapters instalados (`.harness/adapters.json`, gitignored —
 * junto dos demais artefatos do `.harness/`). Sempre retorna um objeto
 * normalizado; problemas de shape/JSON viram `issues` (o consumidor decide
 * avisar e pular — nunca trava o `update` por causa de um arquivo recriável).
 *
 * Formato: `{ "tools": ["opencode", …], "sandbox": "minimal|strict|null",
 * "browser": { "target": "opencode|claude|codex", "package": "pkg" }? }`.
 */
export function readAdaptersMarker(root) {
  const file = path.join(root, ADAPTERS_MARKER_DIR, ADAPTERS_MARKER_FILE)
  const fresh = () => ({ tools: [], sandbox: null, browser: null, issues: [] })
  if (!fs.existsSync(file)) return fresh()

  let raw
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    return { ...fresh(), issues: [`${ADAPTERS_MARKER_FILE} não é JSON estrito: ${err.message}`] }
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ...fresh(),
      issues: [`${ADAPTERS_MARKER_FILE} deve ser um objeto JSON com { tools, sandbox, browser }`]
    }
  }

  const issues = []
  let tools = []
  if (raw.tools !== undefined) {
    if (!Array.isArray(raw.tools)) {
      issues.push(`"tools" deve ser uma lista de tools (recebido: ${typeof raw.tools})`)
    } else {
      for (const tool of raw.tools) {
        if (typeof tool === 'string' && TOOLS.includes(tool)) tools.push(tool)
        else issues.push(`tool desconhecida no marcador: ${JSON.stringify(tool)}`)
      }
      tools = [...new Set(tools)]
    }
  }

  let sandbox = null
  if (raw.sandbox !== undefined && raw.sandbox !== null) {
    const name = String(raw.sandbox)
    if (SANDBOX_PROFILES[name]) sandbox = name
    else {
      issues.push(
        `"sandbox" desconhecido: ${JSON.stringify(raw.sandbox)} (use: ${Object.keys(SANDBOX_PROFILES).join(' | ')} ou null)`
      )
    }
  }

  let browser = null
  if (raw.browser !== undefined && raw.browser !== null) {
    const detail = raw.browser
    if (
      typeof detail === 'object' &&
      !Array.isArray(detail) &&
      typeof detail.target === 'string' &&
      MCP_TARGETS.includes(detail.target)
    ) {
      browser = {
        target: detail.target,
        package: typeof detail.package === 'string' ? detail.package : BROWSER_DEFAULT_PACKAGE
      }
    } else {
      issues.push(`"browser" deve ser { target: <${MCP_TARGETS.join(' | ')}>, package? }`)
    }
  }

  return { tools, sandbox, browser, issues }
}

/**
 * Grava (merge idempotente) uma instalação de adapter no marcador.
 * Adiciona `tool` se ausente, sem remover entradas de outros adapters;
 * `opts.sandbox` só troca o perfil salvo quando fornecido (a CLI só passa
 * quando a flag `--sandbox` foi usada — nunca derruba o perfil salvo por
 * relics da maioria). Corrompido, o marcador é reconstruído e `recovered`
 * volta `true` para a CLI avisar. O retorno espelha o que ficou gravado.
 */
export function recordAdapterInstall(root, tool, opts = {}) {
  if (!TOOLS.includes(tool)) {
    throw new Error(`tool desconhecida: ${tool} (use: ${TOOLS.join(' | ')})`)
  }
  if (opts.browser && !MCP_TARGETS.includes(opts.browser.target)) {
    throw new Error(`tool-alvo do browser desconhecida: ${JSON.stringify(opts.browser.target)} (use: ${MCP_TARGETS.join(' | ')})`)
  }

  const file = path.join(root, ADAPTERS_MARKER_DIR, ADAPTERS_MARKER_FILE)
  let current = { tools: [], sandbox: null, browser: null }
  let recovered = false
  if (fs.existsSync(file)) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        if (Array.isArray(raw.tools)) current.tools = raw.tools.filter((t) => typeof t === 'string')
        if (typeof raw.sandbox === 'string' && SANDBOX_PROFILES[raw.sandbox]) current.sandbox = raw.sandbox
        if (raw.browser && typeof raw.browser === 'object' && !Array.isArray(raw.browser)) current.browser = raw.browser
      }
    } catch {
      recovered = true
    }
  }

  const tools = [...new Set(current.tools.includes(tool) ? current.tools : [...current.tools, tool])]
  const browser = opts.browser
    ? { target: opts.browser.target, package: opts.browser.package ?? BROWSER_DEFAULT_PACKAGE }
    : current.browser
  const marker = {
    tools,
    sandbox: opts.sandbox ?? current.sandbox,
    browser
  }
  fs.mkdirSync(path.join(root, ADAPTERS_MARKER_DIR), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(marker, null, 2) + '\n')
  return { ...marker, recovered }
}
