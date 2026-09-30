import fs from 'node:fs'
import path from 'node:path'
import { templatesDir } from './lib/paths.js'
import { render } from './lib/templates.js'

export async function moduleCmd(args) {
  const [name] = args
  if (!name) throw new Error('uso: harness module <nome>')
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error('nome de módulo inválido — use minúsculas, dígitos e hífen (ex: finance)')
  }

  const root = process.cwd()
  const moduleDest = path.join(root, 'packages', 'modules', name)
  const contextDest = path.join(root, 'context', 'modules', name)
  if (fs.existsSync(moduleDest)) {
    throw new Error(`módulo já existe: ${moduleDest}`)
  }

  const withPrisma = args.includes('--with-prisma')
  const withHttp = args.includes('--with-http')

  const deps = { '@saas/contracts': 'workspace:*' }
  if (withPrisma) deps['@saas/database'] = 'workspace:*'
  if (withHttp) deps.fastify = '^5.0.0'

  const tpl = path.join(templatesDir(), 'module')
  const depsJson = JSON.stringify(deps, null, 2).replace(/^/gm, '  ')
  const vars = { NAME: name, DEPS: depsJson }

  walk(tpl, (relpath) => {
    const isContext = relpath.startsWith('context/')
    const base = isContext ? contextDest : moduleDest
    const rel = isContext ? relpath.slice('context/'.length) : relpath
    const from = path.join(tpl, relpath)
    const isTpl = path.basename(rel).endsWith('.tpl')
    const to = path.join(base, isTpl ? rel.replace(/\.tpl$/, '') : rel)

    fs.mkdirSync(path.dirname(to), { recursive: true })
    if (isTpl) {
      fs.writeFileSync(to, render(fs.readFileSync(from, 'utf8'), vars))
    } else {
      fs.copyFileSync(from, to)
    }
  })

  process.stdout.write(
    [
      `✅ Módulo @saas/${name} criado`,
      `  - ${path.relative(root, moduleDest)}`,
      `  - ${path.relative(root, contextDest)}/context.md e status.md`,
      `  - deps: ${Object.keys(deps).join(', ')}`,
      '',
      'Próximos passos:',
      '  - Preencher context.md (responsabilidade, entidades, use cases)',
      '  - Configurar a regra de fronteira no eslint.config.js se necessário',
      '  - Adicionar tasks na queue para as primeiras entregas',
      ''
    ].join('\n') + '\n'
  )
}

function walk(dir, onFile, prefix = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, onFile, rel)
    } else {
      onFile(rel)
    }
  }
}