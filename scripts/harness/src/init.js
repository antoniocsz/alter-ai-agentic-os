import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { harnessRoot, templatesDir } from './lib/paths.js'
import { copyDir, ensureDir } from './lib/templates.js'

const DB_SCRIPTS =
  ',\n' +
  [
    '    "db:up": "docker compose up -d postgres redis",',
    '    "db:down": "docker compose down",',
    '    "db:migrate": "pnpm --filter @saas/prisma migrate",',
    '    "db:deploy": "pnpm --filter @saas/prisma deploy",',
    '    "db:generate": "pnpm --filter @saas/prisma generate"'
  ].join('\n')

export async function init(args) {
  const [dir] = args
  if (!dir) throw new Error('uso: harness init <dir> [--prisma] [--git [--branch <nome>]]')

  const withPrisma = args.includes('--prisma')
  const withGit = args.includes('--git')
  const branchIdx = args.indexOf('--branch')
  const branch = branchIdx !== -1 ? args[branchIdx + 1] : null

  const target = path.resolve(dir)
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    throw new Error(`diretório não está vazio: ${target}`)
  }
  ensureDir(target)

  const root = harnessRoot()
  const name = sanitize(path.basename(target))

  fs.copyFileSync(path.join(root, 'AGENTS.md'), path.join(target, 'AGENTS.md'))
  copyDir(path.join(root, '.agents'), path.join(target, '.agents'))
  copyDir(path.join(root, '.opencode', 'agent'), path.join(target, '.opencode', 'agent'))
  copyDir(path.join(root, 'scripts', 'harness'), path.join(target, 'scripts', 'harness'))
  copyDir(path.join(templatesDir(), 'project'), target, {
    vars: { NAME: name, DB_SCRIPTS: withPrisma ? DB_SCRIPTS : '' },
    renderAll: true
  })

  const gerado = [
    '  - AGENTS.md + .agents/ (camada harness)',
    '  - .opencode/agent/ (agents prontos) + scripts/harness (CLI)',
    '  - context/ (overview.md, stack.md, adr/, modules/, agents/queue|active|done)',
    '  - Monorepo mínimo (turbo.json, pnpm-workspace.yaml, tsconfig.base.json, eslint.config.js)',
    '  - apps/api (Fastify) + apps/web (Next.js), packages/contracts + packages/api-client',
    '  - Vitest configurado (turbo test) e opencode.json + CI (.github/workflows/ci.yml)'
  ]
  if (withPrisma) {
    copyDir(path.join(templatesDir(), 'prisma'), target, { vars: { NAME: name }, renderAll: true })
    const envExample = path.join(target, '.env.example')
    if (fs.existsSync(envExample) && !fs.existsSync(path.join(target, '.env'))) {
      fs.copyFileSync(envExample, path.join(target, '.env'))
      gerado.push('  - .env copiado de .env.example (ajuste credenciais se necessário)')
    }
    gerado.push(
      '  - docker-compose.yml (Postgres + Redis, limites de memória/CPU)',
      '  - packages/prisma (schema + client) e .env.example'
    )
  }

  const lines = [
    `✅ Projeto criado em ${target}`,
    '',
    'Gerado:',
    ...gerado,
    '  - Banco .harness/harness.db (criado sob demanda; gitignored)',
    ''
  ]

  if (withGit) {
    try {
      const initBranch = branch ? ` -b ${branch}` : ''
      execSync(`git init${initBranch}`, { cwd: target, stdio: 'ignore' })
      execSync(`git add -A`, { cwd: target, stdio: 'ignore' })
      execSync(
        `git -c user.name="harness" -c user.email="harness@local" commit -qm "chore: bootstrap harness"`,
        { cwd: target, stdio: 'ignore' }
      )
      lines.push(`   git: repositório inicializado${branch ? ` na branch ${branch}` : ''} com commit inicial.`)
    } catch {
      lines.push('   git: repositório inicializado, mas o commit falhou — configure user.name/user.email e commite.')
    }
    lines.push('', 'Próximos passos:')
  } else {
    lines.push('Próximos passos:')
  }

  lines.push(
    `  1. ${withGit ? 'git commit já feito' : `cd ${dir} && git init && git add -A && git commit -m "chore: bootstrap harness"`}`,
    '  2. pnpm install',
    ...(withPrisma ? ['  3. docker compose up -d (Postgres + Redis) — .env já copiado'] : ['  3. Rodar a context-interview (7 blocos) para preencher overview.md e stack.md']),
    '  4. pnpm harness module <nome> — criar o primeiro módulo',
    '  5. Criar tasks em context/agents/queue/ e executar com pnpm harness start/finish',
    '',
    'Guia completo: ver seção "Começando um projeto" no README.md.'
  )

  process.stdout.write(lines.join('\n') + '\n')
}

function sanitize(name) {
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'project'
}