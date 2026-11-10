import fs from 'node:fs'
import path from 'node:path'
import { queueDir, activeDir, doneDir, listTasks } from './lib/tasks.js'
import { templatesDir } from './lib/paths.js'
import { render } from './lib/templates.js'
import { slugifyFeature } from './feature.js'
import { normalizeCommitType } from './lib/commits.js'
import { parseArgs, flagString } from './lib/flags.js'

const AGENT_REF = {
  backend: 'backend.md',
  frontend: 'frontend.md',
  mobile: 'mobile.md',
  reviewer: 'review.md',
  coordinator: 'orchestration.md'
}

/**
 * Cria o arquivo de task na queue a partir de dados ESTRUTURADOS (sem flags de CLI).
 * Fonte da criação de task — consumida por `harness task` (abaixo) e pelas rotinas
 * (fireRoutine). Defaults idênticos aos do CLI: agent backend, dep '-', complexity
 * baixa, priority P2, type feat. Retorna metadados para o chamador reportar.
 */
export function createTaskFile(root, input = {}) {
  const description = String(input.description ?? '').trim()
  if (!description) throw new Error('task precisa de título (description)')

  const module = String(input.module ?? '').trim()
  const agent = String(input.agent ?? 'backend')
  const dep = String(input.dep ?? '-')
  const complexity = String(input.complexity ?? 'baixa')
  const scopeRaw = Array.isArray(input.scope) ? input.scope.join(',') : String(input.scope ?? '')
  const priorityRaw = String(input.priority ?? 'P2').toUpperCase()
  if (!/^P[0-3]$/.test(priorityRaw)) {
    throw new Error(`prioridade inválida: ${priorityRaw} (use P0 | P1 | P2 | P3)`)
  }
  const commitType = normalizeCommitType(String(input.type ?? 'feat'))
  const acsRaw = Array.isArray(input.acs)
    ? input.acs
    : (input.acs ? String(input.acs).split(',') : [])
  const acs = acsRaw
    .map((a) => String(a).trim().toUpperCase())
    .filter(Boolean)
  for (const ac of acs) {
    if (!/^AC-\d+$/.test(ac)) throw new Error(`AC inválido: ${ac} (use AC-1, AC-2...)`)
  }
  const featureRaw = String(input.feature ?? '')
  const feature = featureRaw ? slugifyFeature(featureRaw) : '—'

  const moduleName = module.match(/modules\/([a-z0-9-]+)/)?.[1] ?? module.replace(/^@saas\//, '')
  const displayModule = module || (moduleName ? `packages/modules/${moduleName}` : 'packages/modules/<modulo>')
  const ref = AGENT_REF[agent.toLowerCase()] ?? `${agent}.md`

  const scopes = scopeRaw
    ? scopeRaw.split(',').map((s) => s.trim()).filter(Boolean).map((s) => `- \`${s.replace(/^`|`$/g, '')}\``)
    : [`- \`${displayModule}/src/...\``]

  const qDir = queueDir(root)
  const allNames = [
    ...listTasks(qDir),
    ...listTasks(activeDir(root)),
    ...listTasks(doneDir(root))
  ]
  const num = nextNumber(allNames)
  const slug = slugify(description)
  const name = `${String(num).padStart(2, '0')}-${slug}.md`
  const dest = path.join(qDir, name)

  fs.mkdirSync(qDir, { recursive: true })
  const tpl = fs.readFileSync(path.join(templatesDir(), 'task', 'task.md.tpl'), 'utf8')
  fs.writeFileSync(
    dest,
    render(tpl, {
      DESCRIPTION: description,
      AGENT: agent,
      MODULE: displayModule,
      SCOPE: scopes.join('\n'),
      DEP: dep,
      MODULE_NAME: moduleName || '<modulo>',
      AGENT_REF: ref,
      FILE: name,
      FEATURE: feature,
      PRIORITY: priorityRaw,
      TYPE: commitType,
      ACS: acs.length ? acs.join(', ') : '—',
      COMPLEXITY: complexity
    })
  )

  return { name, num, dest, relPath: path.relative(root, dest), feature, moduleName }
}

export async function task(args) {
  const root = process.cwd()
  const { positionals, flags } = parseArgs(args)
  const description = positionals.join(' ').trim()
  if (!description) {
    throw new Error(
      'uso: harness task "<descrição>" [--module <m>] [--agent backend|frontend|mobile] [--scope "p1,p2"] [--dep <task>] [--complexity baixa|média|alta] [--feature <slug>] [--acs AC-1,AC-2] [--priority P0..P3] [--type feat|fix|...]'
    )
  }

  const created = createTaskFile(root, {
    description,
    module: flagString(flags, 'module', ''),
    agent: flagString(flags, 'agent', 'backend'),
    dep: flagString(flags, 'dep', '-'),
    complexity: flagString(flags, 'complexity', 'baixa'),
    scope: flagString(flags, 'scope', '') || [],
    priority: flagString(flags, 'priority', 'P2'),
    type: flagString(flags, 'type', 'feat'),
    acs: flagString(flags, 'acs') ?? [],
    feature: flagString(flags, 'feature')
  })

  if (created.feature !== '—' && !fs.existsSync(path.join(root, 'context', 'features', created.feature, 'spec.md'))) {
    process.stdout.write(
      `   ⚠️  spec da feature ausente: context/features/${created.feature}/spec.md — rode \`pnpm harness feature ${created.feature}\`\n`
    )
  }
  if (created.moduleName && !fs.existsSync(path.join(root, 'context', 'modules', created.moduleName, 'context.md'))) {
    process.stdout.write(`   ⚠️  contexto do módulo ausente: context/modules/${created.moduleName}/ — rode \`pnpm harness module ${created.moduleName}\`\n`)
  }
  process.stdout.write(`✅ task criada: ${created.relPath}\n  inicie com: pnpm harness start ${created.num}\n`)
}

function nextNumber(names) {
  const max = names.reduce((acc, n) => {
    const m = n.match(/^(\d+)-/)
    return m ? Math.max(acc, Number(m[1])) : acc
  }, 0)
  return max + 1
}

/** Normalização de título → slug, igual à usada no nome de arquivo das tasks. */
export function slugify(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'task'
}
