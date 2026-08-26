import fs from 'node:fs'
import path from 'node:path'
import { queueDir, activeDir, doneDir, listTasks } from './lib/tasks.js'
import { templatesDir } from './lib/paths.js'
import { render } from './lib/templates.js'

const AGENT_REF = {
  backend: 'backend.md',
  frontend: 'frontend.md',
  mobile: 'mobile.md',
  reviewer: 'review.md',
  coordinator: 'orchestration.md'
}

export async function task(args) {
  const root = process.cwd()
  const description = args.find((a) => !a.startsWith('--'))
  if (!description) {
    throw new Error(
      'uso: harness task "<descrição>" [--module <m>] [--agent backend|frontend|mobile] [--scope "p1,p2"] [--dep <task>] [--complexity baixa|média|alta]'
    )
  }

  const flag = (names) => {
    const i = args.findIndex((a) => names.includes(a))
    return i !== -1 ? args[i + 1] : null
  }

  const module = flag(['--module']) ?? ''
  const agent = flag(['--agent']) ?? 'backend'
  const dep = flag(['--dep']) ?? '-'
  const complexity = flag(['--complexity']) ?? 'baixa'
  const scopeRaw = flag(['--scope']) ?? ''

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
      COMPLEXITY: complexity
    })
  )

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