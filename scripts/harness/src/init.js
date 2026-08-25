import fs from 'node:fs'
import path from 'node:path'
import { harnessRoot, templatesDir } from './lib/paths.js'
import { copyDir, ensureDir } from './lib/templates.js'

export async function init(args) {
  const [dir] = args
  if (!dir) throw new Error('uso: harness init <dir>')

  const target = path.resolve(dir)
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    throw new Error(`diretório não está vazio: ${target}`)
  }
  ensureDir(target)

  const root = harnessRoot()
  const name = sanitize(path.basename(target))

  fs.copyFileSync(path.join(root, 'AGENTS.md'), path.join(target, 'AGENTS.md'))
  copyDir(path.join(root, '.agents'), path.join(target, '.agents'))
  copyDir(path.join(root, 'scripts', 'harness'), path.join(target, 'scripts', 'harness'))
  copyDir(path.join(templatesDir(), 'project'), target, { vars: { NAME: name }, renderAll: true })

  const lines = [
    `✅ Projeto criado em ${target}`,
    '',
    'Gerado:',
    '  - AGENTS.md + .agents/ (camada harness)',
    '  - scripts/harness (CLI: init, module, start, finish, check)',
    '  - context/ (overview.md, stack.md, adr/, modules/, agents/queue|active|done)',
    '  - Monorepo mínimo (turbo.json, pnpm-workspace.yaml, tsconfig.base.json, eslint.config.js)',
    '  - apps/api (Fastify) e packages/contracts',
    '',
    'Próximos passos:',
    `  1. cd ${dir} && git init && git add -A && git commit -m "chore: bootstrap harness"`,
    '  2. pnpm install',
    '  3. Rodar a context-interview (7 blocos) para preencher overview.md e stack.md',
    '  4. pnpm harness module <nome> — criar o primeiro módulo',
    '  5. Criar tasks em context/agents/queue/ e executar com pnpm harness start/finish',
    '',
    'Guia completo: ver seção "Começando um projeto" no README.md.'
  ]
  process.stdout.write(lines.join('\n') + '\n')
}

function sanitize(name) {
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'project'
}