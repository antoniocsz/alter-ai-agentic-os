import fs from 'node:fs'
import path from 'node:path'
import { templatesDir } from './lib/paths.js'
import { render } from './lib/templates.js'
import { localDate } from './lib/dates.js'

export function slugifyFeature(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export async function featureCmd(args, root = process.cwd()) {
  const raw = args.find((a) => !a.startsWith('--'))
  if (!raw) throw new Error('uso: harness feature <slug>')

  const slug = slugifyFeature(raw)
  if (!slug) throw new Error(`slug inválido: ${raw}`)

  const dir = path.join(root, 'context', 'features', slug)
  if (fs.existsSync(path.join(dir, 'spec.md'))) {
    throw new Error(`feature já existe: context/features/${slug}/spec.md`)
  }

  fs.mkdirSync(dir, { recursive: true })
  const vars = { SLUG: slug, DATE: localDate() }
  for (const [tpl, out] of [
    ['spec.md.tpl', 'spec.md'],
    ['plan.md.tpl', 'plan.md']
  ]) {
    const source = fs.readFileSync(path.join(templatesDir(), 'feature', tpl), 'utf8')
    fs.writeFileSync(path.join(dir, out), render(source, vars))
  }

  process.stdout.write(
    `✅ feature criada: context/features/${slug}/\n` +
      `   preencha spec.md (critérios AC-N) e plan.md antes de gerar tasks.\n` +
      `   crie tasks com: pnpm harness task "<desc>" --feature ${slug}\n`
  )
}
