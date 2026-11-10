import path from 'node:path'
import { resolveConfig } from './lib/config.js'
import {
  installAdapter,
  TOOLS,
  TOOL_INFO,
  MCP_TARGETS,
  BROWSER_DEFAULT_PACKAGE,
  BROWSER_SERVER_NAME,
  SANDBOX_DEFAULT,
  SANDBOX_SUPPORT,
  resolveSandbox
} from './lib/adapters.js'
import { parseArgs, flagString } from './lib/flags.js'

const BROWSER_TARGET_FILE = { opencode: 'opencode.json', claude: '.mcp.json' }

const BROWSER_USAGE =
  `Adapter browser — config do Playwright MCP por tool (zero dependências: ` +
  `o server resolve via npx na 1ª execução do agente, nada é instalado).\n\n` +
  'usar:  harness adapter browser <opencode|claude|codex> [--browser-package <pkg>]\n' +
  `       (default: ${BROWSER_DEFAULT_PACKAGE})\n\n` +
  'O que escreve em cada tool:\n' +
  '  opencode    server MCP "browser" no opencode.json — entries existentes preservadas\n' +
  '  claude      server MCP "browser" no .mcp.json da raiz — entries existentes preservadas\n' +
  '  codex       instrução de MCP em .codex/prompts/browser.md (Codex usa config.toml, não .mcp.json)\n\n' +
  'Se o server "browser" já existir no arquivo-alvo → no-op (idempotente).\n' +
  'Se o arquivo não for JSON estrito ou a estrutura não casar com a injeção segura,\n' +
  'nada é tocado: o bloco a fundir manualmente é impresso e o comando falha (exit ≠ 0).\n'

export async function adapterCmd(args = []) {
  const { positionals, flags } = parseArgs(args)
  const [layer, sub] = positionals
  const root = process.cwd()

  if (!layer || layer === 'list') {
    const sandbox = resolveSandbox(flagString(flags, 'sandbox', SANDBOX_DEFAULT))
    process.stdout.write('Adapters disponíveis:\n')
    for (const t of TOOLS) process.stdout.write(`  ${t.padEnd(9)} ${TOOL_INFO[t]}\n`)
    process.stdout.write(
      `\nperfil de sandbox aplicado: ${sandbox} (default: minimal; troque com \`--sandbox strict|minimal\`)\n`
    )
    for (const t of TOOLS) process.stdout.write(`  ${t.padEnd(9)} ${SANDBOX_SUPPORT[t]}\n`)
    process.stdout.write('\nuse: harness adapter <tool> [--sandbox minimal|strict]\n')
    return
  }

  if (layer === 'browser') return browserCmd(sub, flags, root)

  if (!TOOLS.includes(layer)) {
    throw new Error(`tool desconhecida: ${layer} (use: ${TOOLS.join(' | ')})`)
  }

  const sandbox = resolveSandbox(flagString(flags, 'sandbox', SANDBOX_DEFAULT))
  installAdapter(layer, root, {
    name: path.basename(root),
    profile: resolveConfig(root).profile,
    sandbox
  })
  process.stdout.write(`✅ adapter "${layer}" instalado em ${root}\n`)
  process.stdout.write(`🔒 sandbox "${sandbox}": ${SANDBOX_SUPPORT[layer]}\n`)
}

function browserCmd(sub, flags, root) {
  if (!sub) {
    process.stdout.write(BROWSER_USAGE)
    return
  }

  if (!MCP_TARGETS.includes(sub)) {
    throw new Error(`tool desconhecida: ${sub} (browser escreve em: ${MCP_TARGETS.join(' | ')})`)
  }

  const pkg = flagString(flags, 'browser-package', BROWSER_DEFAULT_PACKAGE)
  const results = installAdapter('browser', root, {
    name: path.basename(root),
    profile: resolveConfig(root).profile,
    targetTool: sub,
    browserPackage: pkg
  })

  if (sub === 'codex') {
    process.stdout.write(
      '✅ instrução de MCP escrita em .codex/prompts/browser.md (Codex usa config.toml — sem .mcp.json).\n'
    )
  } else {
    const file = BROWSER_TARGET_FILE[sub]
    const status = results[sub]
    const msg =
      status === 'created'
        ? `✅ ${file} criado com server MCP "${BROWSER_SERVER_NAME}" (npx ${pkg}).\n`
        : status === 'merged'
          ? `✅ server MCP "${BROWSER_SERVER_NAME}" adicionado em ${file} (entries existentes preservadas).\n`
          : `ℹ️ server "${BROWSER_SERVER_NAME}" já presente em ${file} — no-op (idempotente).\n`
    process.stdout.write(msg)
  }
  process.stdout.write(
    `ℹ️ nada foi instalado: o Playwright MCP roda via \`npx ${pkg}\` na 1ª execução do agente.\n`
  )
}
