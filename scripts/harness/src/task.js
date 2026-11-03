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

export async function task(args) {
  const root = process.cwd()
  const { positionals, flags } = parseArgs(args)
  const description = positionals.join(' ').trim()
  if (!description) {
    throw new Error(
      'uso: harness task "<descrição>" [--module <m>] [--agent backend|frontend|mobile] [--scope "p1,p2"] [--dep <task>] [--complexity baixa|média|alta] [--feature <slug>] [--acs AC-1,AC-2] [--priority P0..P3] [--type feat|fix|...]'
    )
  }

  const module = flagString(flags, 'module', '')
  const agent = flagString(flags, 'agent', 'backend')
  const dep = flagString(flags, 'dep', '-')
  const complexity = flagString(flags, 'complexity', 'baixa')
  const scopeRaw = flagString(flags, 'scope', '')
  const priorityRaw = flagString(flags, 'priority', 'P2').toUpperCase()
  if (!/^P[0-3]$/.test(priorityRaw)) {
    throw new Error(`prioridade inválida: ${priorityRaw} (use P0 | P1 | P2 | P3)`)
  }
  const commitType = normalizeCommitType(flagString(flags, 'type', 'feat'))
  const acsRaw = flagString(flags, 'acs')
  const acs = acsRaw
    ? acsRaw
        .split(',')
        .map((a) => a.trim().toUpperCase())
        .filter(Boolean)
    : []
  for (const ac of acs) {
    if (!/^AC-\d+$/.test(ac)) throw new Error(`AC inválido: ${ac} (use AC-1, AC-2...)`)
  }
  const featureRaw = flagString(flags, 'feature')
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
  const file = `${String(num).padStart(2, '0')}-${slug}.md`
  const dest = path.join(qDir, file)

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
      FILE: file,
      FEATURE: feature,
      PRIORITY: priorityRaw,
      TYPE: commitType,
      ACS: acs.length ? acs.join(', ') : '—',
      COMPLEXITY: complexity
    })
  )

  if (feature !== '—' && !fs.existsSync(path.join(root, 'context', 'features', feature, 'spec.md'))) {
    process.stdout.write(
      `   ⚠️  spec da feature ausente: context/features/${feature}/spec.md — rode \`pnpm harness feature ${feature}\`\n`
    )
  }
  if (moduleName && !fs.existsSync(path.join(root, 'context', 'modules', moduleName, 'context.md'))) {
    process.stdout.write(`   ⚠️  contexto do módulo ausente: context/modules/${moduleName}/ — rode \`pnpm harness module ${moduleName}\`\n`)
  }
  process.stdout.write(`✅ task criada: ${path.relative(root, dest)}\n  inicie com: pnpm harness start ${num}\n`)
}

function nextNumber(names) {
  const max = names.reduce((acc, n) => {
    const m = n.match(/^(\d+)-/)
    return m ? Math.max(acc, Number(m[1])) : acc
  }, 0)
  return max + 1
}

function slugify(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'task'
}