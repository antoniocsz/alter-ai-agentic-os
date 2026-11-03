import path from 'node:path'
import { resolveConfig } from './lib/config.js'
import { installAdapter, TOOLS, TOOL_INFO } from './lib/adapters.js'

export async function adapterCmd(args = []) {
  const tool = args[0]
  const root = process.cwd()

  if (!tool || tool === 'list') {
    process.stdout.write('Adapters disponíveis:\n')
    for (const t of TOOLS) process.stdout.write(`  ${t.padEnd(9)} ${TOOL_INFO[t]}\n`)
    process.stdout.write('\nuse: harness adapter <tool>\n')
    return
  }

  if (!TOOLS.includes(tool)) {
    throw new Error(`tool desconhecida: ${tool} (use: ${TOOLS.join(' | ')})`)
  }

  installAdapter(tool, root, {
    name: path.basename(root),
    profile: resolveConfig(root).profile
  })
  process.stdout.write(`✅ adapter "${tool}" instalado em ${root}\n`)
}
