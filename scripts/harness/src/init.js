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
    '    "db:migrate": "pnpm --filter @saas/database migrate",',
    '    "db:deploy": "pnpm --filter @saas/database deploy",',
    '    "db:generate": "pnpm --filter @saas/database generate"'
  ].join('\n')

export async function init(args) {
  const [dir] = args
  if (!dir) throw new Error('uso: harness init <dir> [--prisma] [--git [--branch <nome>]] [--bare]')

  const branchIdx = args.indexOf('--branch')
  const opts = {
    prisma: args.includes('--prisma'),
    git: args.includes('--git'),
    branch: branchIdx !== -1 ? args[branchIdx + 1] : null,
    bare: args.includes('--bare')
  }
  const target = path.resolve(dir)

  await createProject(target, opts, harnessRoot(), path.join(harnessRoot(), 'AGENTS.md'))
}

/**
 * Gera um projeto novo (monorepo + camada harness) dentro de `target`.
 *
 * @param {string} target caminho absoluto do projeto (deve estar vazio)
 * @param {{prisma?: boolean, git?: boolean, branch?: string|null, bare?: boolean}} opts flags
 * @param {string} sourceRoot raiz que contém a camada harness (.agents, .opencode, scripts/harness)
 * @param {string|null} agentsMdSource arquivo AGENTS.md a instalar no projeto (default: sourceRoot/AGENTS.md)
 */
export async function createProject(target, opts = {}, sourceRoot = harnessRoot(), agentsMdSource = null) {
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    throw new Error(`diretório não está vazio: ${target}`)
  }
  ensureDir(target)

  const name = sanitize(path.basename(target))
  const agentsMd = agentsMdSource ?? path.join(sourceRoot, 'AGENTS.md')

  fs.copyFileSync(agentsMd, path.join(target, 'AGENTS.md'))
  copyDir(path.join(sourceRoot, '.agents'), path.join(target, '.agents'))
  copyDir(path.join(sourceRoot, '.opencode', 'agent'), path.join(target, '.opencode', 'agent'))
  copyDir(path.join(sourceRoot, 'scripts', 'harness'), path.join(target, 'scripts', 'harness'))
  copyDir(path.join(templatesDir(), 'project'), target, {
    vars: { NAME: name, DB_SCRIPTS: opts.prisma ? DB_SCRIPTS : '' },
    renderAll: true
  })

  if (opts.bare) {
    for (const m of ['tenancy', 'auth', 'authorization', 'audit']) {
      fs.rmSync(path.join(target, 'context', 'modules', m), { recursive: true, force: true })
    }
    const qDir = path.join(target, 'context', 'agents', 'queue')
    if (fs.existsSync(qDir)) {
      for (const f of fs.readdirSync(qDir)) {
        fs.rmSync(path.join(qDir, f), { recursive: true, force: true })
      }
    }
  }

  const gerado = [
    '  - AGENTS.md + .agents/ (camada harness)',
    '  - .opencode/agent/ (agents prontos) + scripts/harness (CLI)',
    '  - context/ (overview.md, stack.md, adr/, modules/, agents/queue|active|done)',
    '  - Monorepo mínimo (turbo.json, pnpm-workspace.yaml, tsconfig.base.json, eslint.config.js)',
    '  - apps/api (Fastify) + apps/web (Next.js), packages/contracts + packages/api-client',
    ...(opts.bare
      ? ['  - Sem módulos padrão (--bare): crie do zero com `harness module <nome>`']
      : ['  - Módulos padrão (tenancy, auth, authorization, audit) + tasks de fundação na queue']),
    '  - Vitest configurado (turbo test) e opencode.json + CI (.github/workflows/ci.yml)'
  ]
  if (opts.prisma) {
    copyDir(path.join(templatesDir(), 'prisma'), target, { vars: { NAME: name }, renderAll: true })
    const envExample = path.join(target, '.env.example')
    if (fs.existsSync(envExample) && !fs.existsSync(path.join(target, '.env'))) {
      fs.copyFileSync(envExample, path.join(target, '.env'))
      gerado.push('  - .env copiado de .env.example (ajuste credenciais se necessário)')
    }
    gerado.push(
      '  - docker-compose.yml (Postgres + Redis, limites de memória/CPU)',
      '  - packages/database (schema + client) e .env.example'
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

  if (opts.git) {
    try {
      const initBranch = opts.branch ? ` -b ${opts.branch}` : ''
      execSync(`git init${initBranch}`, { cwd: target, stdio: 'ignore' })
      execSync(`git add -A`, { cwd: target, stdio: 'ignore' })
      execSync(
        `git -c user.name="harness" -c user.email="harness@local" commit -qm "chore: bootstrap harness"`,
        { cwd: target, stdio: 'ignore' }
      )
      lines.push(`   git: repositório inicializado${opts.branch ? ` na branch ${opts.branch}` : ''} com commit inicial.`)
    } catch {
      lines.push('   git: repositório inicializado, mas o commit falhou — configure user.name/user.email e commite.')
    }
    lines.push('', 'Próximos passos:')
  } else {
    lines.push('Próximos passos:')
  }

  lines.push(
    `  1. ${opts.git ? 'git commit já feito' : `cd ${target} && git init && git add -A && git commit -m "chore: bootstrap harness"`}`,
    '  2. pnpm install',
    ...(opts.prisma ? ['  3. docker compose up -d (Postgres + Redis) — .env já copiado'] : ['  3. Rodar a context-interview (7 blocos) para preencher overview.md e stack.md']),
    '  4. pnpm harness module <nome> — criar o primeiro módulo',
    '  5. Criar tasks em context/agents/queue/ e executar com pnpm harness start/finish',
    '',
    'Guia completo: ver seção "Começando um projeto" no README.md.'
  )

  process.stdout.write(lines.join('\n') + '\n')
}

export function sanitize(name) {
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'project'
}