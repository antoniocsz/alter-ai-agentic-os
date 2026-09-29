import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { harnessRoot, templatesDir } from './lib/paths.js'
import { copyDir, renderTemplateFile, ensureDir } from './lib/templates.js'
import { createProject, sanitize } from './init.js'
import { isGitRepo } from './lib/git.js'
import { kanbanFor } from './kanban.js'
import { computeMetrics } from './lib/metrics.js'
import { task as createTask } from './task.js'
import {
  WORKSPACE_FILE,
  findWorkspaceRoot,
  loadRegistry,
  saveRegistry,
  defaultRegistry,
  resolveProject,
  projectExists,
  isHarnessProject,
  harnessVersion,
  projectStats,
  isolationErrors,
  readWipConfig
} from './lib/workspace.js'

export async function workspace(args) {
  const [sub, ...rest] = args
  if (sub !== 'init' && sub !== 'help') {
    const root = findWorkspaceRoot(process.cwd())
    if (!root) {
      throw new Error(
        `não encontrei um workspace (sem ${WORKSPACE_FILE} em cwd ou ancestrais).\n` +
          '  - Para criar: `harness workspace init <dir>`\n' +
          '  - Ou defina HARNESS_WORKSPACE apontando para a raiz do workspace.'
      )
    }
    return dispatchWorkspace(root, sub, rest)
  }
  return dispatchWorkspace(null, sub, rest)
}

async function dispatchWorkspace(root, sub, rest) {
  switch (sub) {
    case 'init':
      return initWorkspace(rest)
    case 'new':
      return newProject(root, rest)
    case 'add':
      return addProject(root, rest)
    case 'list':
    case 'status':
      return listWorkspace(root, rest, sub === 'status')
    case 'check':
      return checkWorkspace(root, rest)
    case 'sync':
      return syncWorkspace(root, rest)
    case 'report':
      return reportWorkspace(root, rest)
    case 'update':
      return updateWorkspace(root, rest)
    case 'run':
      return runProject(root, rest)
    case 'task':
      return taskInProject(root, rest)
    case 'kanban':
      return kanbanWorkspace(root, rest)
    case 'help':
    case undefined:
      process.stdout.write(usage())
      break
    default:
      throw new Error(
        `subcomando desconhecido: ${sub}\n\n` + usage()
      )
  }
}

function usage() {
  return `harness workspace <subcomando> [args]

Subcomandos:
  init <dir>                Cria um workspace novo [--source <harness>] [--projects-dir <nome>] [--dry-run]
  new <nome>                Cria um projeto novo dentro do workspace [--prisma] [--git] [--bare]
  add <path>                Registra projeto existente [--name <nome>] [--sync] [--dry-run]
  list | status             Lista os projetos (queue/active/done, versão, onboarded)
  check [--all]             Valida o registro (isolamento) e, com --all, o check de cada projeto
  sync --all                Reindexa o banco de cada projeto
  report --all              Métricas de cada projeto [--format] [--module] [--days]
  update [--all]            Atualiza a camada do workspace; com --all, também de cada projeto [--source]
  run <projeto> <cmd...>    Roda um comando harness dentro do projeto
  task <projeto> "<desc>"   Cria uma task no projeto [--module] [--agent] [--scope] [--dep] [--complexity]
  kanban [--serve [porta]]  Kanban agregado do workspace (com detalhes das tasks)
`
}

function flag(args, names) {
  const i = args.findIndex((a) => names.includes(a))
  return i !== -1 ? args[i + 1] : null
}

/* ------------------------------ init ------------------------------ */

export async function initWorkspace(args) {
  const [dir] = args
  if (!dir) throw new Error('uso: harness workspace init <dir> [--source <harness>] [--projects-dir <nome>] [--dry-run]')

  const source = flag(args, ['--source']) || process.env.HARNESS_SOURCE || harnessRoot()
  const projectsDir = flag(args, ['--projects-dir']) || 'projects'
  const dryRun = args.includes('--dry-run')
  const target = path.resolve(dir)

  if (!dryRun && fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    throw new Error(`diretório não está vazio: ${target}`)
  }
  const src = path.resolve(source)
  if (!fs.existsSync(path.join(src, 'AGENTS.md'))) {
    throw new Error(`fonte do harness inválida (sem AGENTS.md): ${src}`)
  }

  const name = sanitize(path.basename(target))

  if (dryRun) {
    process.stdout.write(
      `🔎 dry-run: workspace em ${target}\n` +
        `  copiaria de ${src}: .agents, .opencode/agent, scripts/harness\n` +
        `  geraria: ${WORKSPACE_FILE}, AGENTS.md (workspace), package.json, .harness/workspace/AGENTS.md (cache)\n`
    )
    return
  }

  ensureDir(target)
  copyDir(path.join(src, '.agents'), path.join(target, '.agents'))
  copyDir(path.join(src, '.opencode', 'agent'), path.join(target, '.opencode', 'agent'))
  copyDir(path.join(src, 'scripts', 'harness'), path.join(target, 'scripts', 'harness'))

  ensureDir(path.join(target, '.harness', 'workspace'))
  fs.copyFileSync(path.join(src, 'AGENTS.md'), path.join(target, '.harness', 'workspace', 'AGENTS.md'))

  renderTemplateFile(path.join(templatesDir(), 'workspace', 'AGENTS.md'), path.join(target, 'AGENTS.md'), {
    NAME: name,
    PROJECTS_DIR: projectsDir
  })

  fs.writeFileSync(
    path.join(target, 'package.json'),
    JSON.stringify(
      {
        name,
        private: true,
        type: 'module',
        description: `Workspace do AlterAI - Agentic OS (${name})`,
        scripts: { harness: 'node scripts/harness/bin/harness.js' }
      },
      null,
      2
    ) + '\n'
  )
  fs.writeFileSync(
    path.join(target, '.gitignore'),
    'node_modules/\n.harness/\nkanban.html\n'
  )

  saveRegistry(target, defaultRegistry(projectsDir))

  process.stdout.write(
    `✅ workspace criado em ${target}\n` +
      `  projetos em: ${path.join(target, projectsDir)}\n` +
      '  Próximos passos:\n' +
      '    1. pnpm harness workspace new <nome>   (ou add <path> para projeto existente)\n' +
      '    2. pnpm harness workspace list\n'
  )
}

/* ------------------------------ new ------------------------------ */

export async function newProject(root, args) {
  const [name] = args
  if (!name) throw new Error('uso: harness workspace new <nome> [--prisma] [--git [--branch <b>]] [--bare]')

  const reg = loadRegistry(root)
  const clean = sanitize(name)
  const target = path.join(root, reg.projectsDir, clean)

  if (projectExists(reg, clean, target)) {
    throw new Error(`projeto já registrado: ${clean}`)
  }
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    throw new Error(`diretório não está vazio: ${target}`)
  }
  const agentsMd = path.join(root, '.harness', 'workspace', 'AGENTS.md')
  if (!fs.existsSync(agentsMd)) {
    throw new Error(
      `cache do AGENTS.md ausente (${agentsMd}). Rode \`pnpm harness workspace update\` para re-sincronizar a camada.`
    )
  }

  const branchIdx = args.indexOf('--branch')
  await createProject(
    target,
    {
      prisma: args.includes('--prisma'),
      git: args.includes('--git'),
      branch: branchIdx !== -1 ? args[branchIdx + 1] : null,
      bare: args.includes('--bare')
    },
    root,
    agentsMd
  )

  reg.projects.push({ name: clean, path: target })
  saveRegistry(root, reg)
  process.stdout.write(`✅ projeto ${clean} criado e registrado no workspace.\n`)
}

/* ------------------------------ add ------------------------------ */

export async function addProject(root, args) {
  const [pathArg] = args
  if (!pathArg) throw new Error('uso: harness workspace add <path> [--name <nome>] [--sync] [--dry-run]')

  const name = flag(args, ['--name']) ? sanitize(flag(args, ['--name'])) : sanitize(path.basename(pathArg))
  const target = path.resolve(root, pathArg)
  const dryRun = args.includes('--dry-run')
  const withSync = args.includes('--sync')
  const reg = loadRegistry(root)

  // validações de isolamento
  if (path.resolve(target) === path.resolve(root)) {
    throw new Error('não é possível registrar a raiz do workspace como projeto')
  }
  if (root.startsWith(target + path.sep)) {
    throw new Error(`o workspace está dentro deste caminho — não é possível registrar: ${target}`)
  }
  if (projectExists(reg, name, target)) {
    throw new Error(`projeto já registrado (nome ou path): ${name}`)
  }
  for (const p of reg.projects) {
    const px = path.resolve(p.path)
    if (px === target) throw new Error(`path já registrado por ${p.name}`)
    if (target.startsWith(px + path.sep)) {
      throw new Error(`path aninhado na árvore do projeto registrado ${p.name}: ${target}`)
    }
    if (px.startsWith(target + path.sep)) {
      throw new Error(`path contém o projeto registrado ${p.name}: ${target}`)
    }
  }
  if (!fs.existsSync(target)) {
    throw new Error(`caminho não existe: ${target}`)
  }

  if (isHarnessProject(target)) {
    if (dryRun) {
      process.stdout.write(`🔎 dry-run: ${target} já é projeto harness — só registraria${withSync ? ' (e sincronizaria a camada)' : ''}.\n`)
      return
    }
    if (withSync) syncLayer(target, root, false)
    reg.projects.push({ name, path: target })
    saveRegistry(root, reg)
    process.stdout.write(`✅ projeto harness ${name} registrado no workspace.\n`)
    return
  }

  // onboarding de projeto pré-existente
  if (dryRun) {
    process.stdout.write(
      `🔎 dry-run: onboarding de ${target}\n` +
        `  - backup do AGENTS.md existente em .harness/backups/\n` +
        '  - copiaria a camada do harness (AGENTS.md, .agents/, .opencode/agent/, scripts/harness/)\n' +
        '  - criaria o esqueleto context/ (project/, modules/, agents/queue|active|done)\n' +
        `  - registraria como "${name}"\n`
    )
    return
  }

  const agentsMd = path.join(root, '.harness', 'workspace', 'AGENTS.md')
  if (!fs.existsSync(agentsMd)) {
    throw new Error(`cache do AGENTS.md ausente (${agentsMd}). Rode \`pnpm harness workspace update\`.`)
  }

  if (fs.existsSync(path.join(target, 'AGENTS.md'))) {
    const backups = path.join(target, '.harness', 'backups')
    ensureDir(backups)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    fs.copyFileSync(path.join(target, 'AGENTS.md'), path.join(backups, `AGENTS.md.${stamp}`))
  }

  copyDir(path.join(root, '.agents'), path.join(target, '.agents'))
  copyDir(path.join(root, '.opencode', 'agent'), path.join(target, '.opencode', 'agent'))
  copyDir(path.join(root, 'scripts', 'harness'), path.join(target, 'scripts', 'harness'))
  fs.copyFileSync(agentsMd, path.join(target, 'AGENTS.md'))
  createContextSkeleton(target)

  reg.projects.push({ name, path: target })
  saveRegistry(root, reg)

  const warns = []
  if (!isGitRepo(target)) warns.push('  ⚠️ não é repo git — a validação de escopo do `harness finish` precisa de git.')
  if (!fs.existsSync(path.join(target, 'package.json'))) {
    warns.push('  ⚠️ sem package.json — use `node scripts/harness/bin/harness.js <cmd>` ou adicione o script "harness".')
  }
  process.stdout.write(
    `✅ projeto ${name} onboarded e registrado no workspace.\n` +
      '  Camada do harness instalada + esqueleto context/ criado.\n' +
      warns.join('\n') +
      '\n  Próximo passo: rodar a context-interview (.agents/context-interview.md) para preencher context/project/*.\n'
  )
}

function createContextSkeleton(root) {
  for (const d of [
    'context/project/adr',
    'context/modules',
    'context/agents/queue',
    'context/agents/active',
    'context/agents/done'
  ]) {
    ensureDir(path.join(root, d))
  }
  const p = path.join(root, 'context', 'project')
  if (!fs.existsSync(path.join(p, 'overview.md'))) {
    fs.writeFileSync(
      path.join(p, 'overview.md'),
      '# Overview\n\n> Preencher via context-interview: produto, problema e público.\n'
    )
  }
  if (!fs.existsSync(path.join(p, 'stack.md'))) {
    fs.writeFileSync(
      path.join(p, 'stack.md'),
      '# Stack\n\n> Preencher via context-interview: stack técnica decidida.\n'
    )
  }
}

function syncLayer(target, root, dryRun) {
  const agentsMd = path.join(root, '.harness', 'workspace', 'AGENTS.md')
  if (dryRun) {
    process.stdout.write(`🔎 dry-run: sincronizaria a camada do harness em ${target}\n`)
    return
  }
  copyDir(path.join(root, '.agents'), path.join(target, '.agents'))
  copyDir(path.join(root, '.opencode', 'agent'), path.join(target, '.opencode', 'agent'))
  copyDir(path.join(root, 'scripts', 'harness'), path.join(target, 'scripts', 'harness'))
  if (fs.existsSync(agentsMd)) {
    const backups = path.join(target, '.harness', 'backups')
    if (fs.existsSync(path.join(target, 'AGENTS.md'))) {
      ensureDir(backups)
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      fs.copyFileSync(path.join(target, 'AGENTS.md'), path.join(backups, `AGENTS.md.${stamp}`))
    }
    fs.copyFileSync(agentsMd, path.join(target, 'AGENTS.md'))
  }
}

/* ------------------------------ list / status ------------------------------ */

export function listWorkspace(root, args, detailed) {
  const reg = loadRegistry(root)
  if (reg.projects.length === 0) {
    process.stdout.write(
      '📭 nenhum projeto registrado no workspace.\n' +
        '  - Criar:  pnpm harness workspace new <nome>\n' +
        '  - Adicionar existente: pnpm harness workspace add <path>\n'
    )
    return
  }

  const rows = reg.projects.map((p) => {
    const st = projectStats(p.path)
    return {
      name: p.name,
      path: path.relative(root, p.path),
      queue: st.queue,
      active: st.active,
      done: st.done,
      version: harnessVersion(p.path) ?? '—',
      onboarded: isHarnessProject(p.path) ? 'sim' : 'não'
    }
  })

  const w = (s, n) => String(s).padEnd(n)
  process.stdout.write(`Workspace ${path.basename(root)} — ${rows.length} projeto(s)\n`)
  process.stdout.write(
    w('projeto', 22) + w('queue', 7) + w('active', 8) + w('done', 6) + w('v', 8) + 'harness\n'
  )
  for (const r of rows) {
    process.stdout.write(
      w(r.name, 22) + w(r.queue, 7) + w(r.active, 8) + w(r.done, 6) + w(r.version, 8) +
        (r.onboarded === 'sim' ? 'sim' : 'não (só registrado)') +
        (detailed ? `  · ${r.path}` : '') +
        '\n'
    )
  }
}

/* ------------------------------ check ------------------------------ */

export async function checkWorkspace(root, args) {
  const reg = loadRegistry(root)
  const json = args.includes('--json')
  const all = args.includes('--all')
  const errors = isolationErrors(reg, root)
  const perProject = []

  if (all) {
    const passthrough = args.filter(
      (a) => ['--barrel', '--db', '--lint', '--typecheck'].includes(a)
    )
    for (const p of reg.projects) {
      const status = runInProject(root, p, ['check', ...passthrough])
      perProject.push({ project: p.name, ok: status === 0 })
      if (status !== 0) errors.push(`[${p.name}] harness check falhou`)
    }
  }

  const ok = errors.length === 0
  if (json) {
    process.stdout.write(
      JSON.stringify({ ok, errors, projects: perProject }, null, 2) + '\n'
    )
  } else if (ok) {
    process.stdout.write(`✅ workspace ok — registro válido${all ? ', checks dos projetos ok' : ''}.\n`)
  } else {
    process.stdout.write(`❌ ${errors.length} violação(ões) de workspace:\n`)
    for (const e of errors) process.stdout.write(`  - ${e}\n`)
  }
  process.exit(ok ? 0 : 1)
}

/* ------------------------------ sync / report / update ------------------------------ */

export async function syncWorkspace(root, args) {
  if (!args.includes('--all')) throw new Error('uso: harness workspace sync --all')
  const reg = loadRegistry(root)
  for (const p of reg.projects) {
    process.stdout.write(`\n── ${p.name} ──\n`)
    const status = runInProject(root, p, ['sync'])
    if (status !== 0) process.exitCode = 1
  }
}

export async function reportWorkspace(root, args) {
  if (!args.includes('--all')) throw new Error('uso: harness workspace report --all [--format table|json|csv] [--module] [--days]')
  const reg = loadRegistry(root)
  const format = flag(args, ['--format']) ?? 'table'
  const module = flag(args, ['--module'])
  const days = flag(args, ['--days']) ? Number(flag(args, ['--days'])) : null

  if (format === 'json') {
    // agregação estruturada: um JSON único com as métricas de todos os projetos
    const out = {}
    for (const p of reg.projects) {
      out[p.name] = computeMetrics(p.path, { module, days })
    }
    process.stdout.write(JSON.stringify(out, null, 2) + '\n')
    return
  }

  const keep = []
  for (let i = 0; i < args.length; i++) {
    if (['--format', '--module', '--days'].includes(args[i]) && args[i + 1]) {
      keep.push(args[i], args[i + 1])
      i++
    }
  }
  for (const p of reg.projects) {
    process.stdout.write(`\n── ${p.name} ──\n`)
    const status = runInProject(root, p, ['report', ...keep])
    if (status !== 0) process.exitCode = 1
  }
}

export async function updateWorkspace(root, args) {
  const dryRun = args.includes('--dry-run')
  const all = args.includes('--all')
  const reg = loadRegistry(root)
  const source = flag(args, ['--source']) || reg.harnessSource || process.env.HARNESS_SOURCE
  if (!source) {
    throw new Error(
      'uso: harness workspace update [--all] [--source <harness>] — defina --source, harnessSource no registro ou HARNESS_SOURCE'
    )
  }
  const src = path.resolve(source)
  if (!fs.existsSync(path.join(src, 'AGENTS.md'))) {
    throw new Error(`fonte do harness inválida (sem AGENTS.md): ${src}`)
  }

  // 1. camada do próprio workspace + cache do AGENTS.md
  if (dryRun) {
    process.stdout.write(`🔎 dry-run: sincronizaria a camada do workspace a partir de ${src}\n`)
  } else {
    for (const item of ['.agents', '.opencode', 'scripts']) {
      copyDir(path.join(src, item), path.join(root, item))
    }
    ensureDir(path.join(root, '.harness', 'workspace'))
    fs.copyFileSync(path.join(src, 'AGENTS.md'), path.join(root, '.harness', 'workspace', 'AGENTS.md'))
    process.stdout.write(`✅ camada do workspace sincronizada de ${src}\n`)
  }

  // 2. projetos (--all)
  if (all) {
    for (const p of reg.projects) {
      process.stdout.write(`\n── ${p.name} ──\n`)
      const status = runInProject(root, p, ['update', '--source', src])
      if (status !== 0) process.exitCode = 1
    }
  }
}

/* ------------------------------ run / task / kanban ------------------------------ */

export async function runProject(root, args) {
  const [name, ...cmdArgs] = args
  if (!name) throw new Error('uso: harness workspace run <projeto> <cmd...>')
  const reg = loadRegistry(root)
  const p = resolveProject(reg, name)
  const status = runInProject(root, p, cmdArgs)
  process.exit(status ?? 0)
}

export async function taskInProject(root, args) {
  const [name, ...taskArgs] = args
  if (!name || taskArgs.length === 0) {
    throw new Error('uso: harness workspace task <projeto> "<descrição>" [--module] [--agent] [--scope] [--dep] [--complexity]')
  }
  const reg = loadRegistry(root)
  const p = resolveProject(reg, name)
  process.chdir(p.path)
  await createTask(taskArgs)
}

export async function kanbanWorkspace(root, args) {
  const reg = loadRegistry(root)
  if (reg.projects.length === 0) {
    throw new Error('nenhum projeto registrado no workspace — crie com `harness workspace new` ou `add`.')
  }
  const ctx = {
    kind: 'workspace',
    projects: reg.projects.map((p) => ({ name: p.name, root: p.path, wip: readWipConfig(p.path) })),
    title: `Workspace ${path.basename(root)} — Tasks`
  }
  await kanbanFor(ctx, args)
}

/* ------------------------------ helpers ------------------------------ */

function runInProject(wsRoot, project, args) {
  const bin = path.join(wsRoot, 'scripts', 'harness', 'bin', 'harness.js')
  const res = spawnSync(process.execPath, [bin, ...args], { cwd: project.path, stdio: 'inherit' })
  return res.status ?? 1
}