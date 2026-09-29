import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { initWorkspace, newProject, addProject, listWorkspace, checkWorkspace } from '../src/workspace.js'
import { createProject } from '../src/init.js'
import { loadRegistry, saveRegistry } from '../src/lib/workspace.js'
import { tmpdir, write } from './helpers.js'

const TASK = `# Task: Foo
## Agente: \`backend\`
## Módulo: \`packages/modules/foo\`
## Escopo:
- \`packages/modules/foo/src/index.ts\`
## Critério de conclusão:
- [ ] typecheck
`

async function makeWorkspace() {
  const ws = path.join(tmpdir(), 'ws-teste')
  await initWorkspace([ws])
  return ws
}

function harnessBin(ws) {
  return path.join(ws, 'scripts', 'harness', 'bin', 'harness.js')
}

function run(ws, args, opts = {}) {
  return spawnSync(process.execPath, [harnessBin(ws), ...args], {
    cwd: ws,
    encoding: 'utf8',
    ...opts
  })
}

async function capture(fn) {
  const chunks = []
  const orig = process.stdout.write
  process.stdout.write = (c) => {
    chunks.push(String(c))
    return true
  }
  try {
    await fn()
  } finally {
    process.stdout.write = orig
  }
  return chunks.join('')
}

/* ------------------------------ init ------------------------------ */

test('workspace init: cria estrutura + registro + cache do AGENTS.md', async () => {
  const ws = path.join(tmpdir(), 'meu-workspace')
  await initWorkspace([ws])

  for (const rel of [
    'AGENTS.md',
    'package.json',
    '.harness-workspace.json',
    '.harness/workspace/AGENTS.md',
    '.agents/codegen.md',
    '.opencode/agent/backend.md',
    'scripts/harness/bin/harness.js'
  ]) {
    assert.ok(fs.existsSync(path.join(ws, rel)), `faltou: ${rel}`)
  }

  const reg = loadRegistry(ws)
  assert.equal(reg.projectsDir, 'projects')
  assert.deepEqual(reg.projects, [])

  const agents = fs.readFileSync(path.join(ws, 'AGENTS.md'), 'utf8')
  assert.ok(agents.includes('workspace'))
  assert.ok(agents.includes('harness workspace list'))

  // cache = AGENTS.md padrão do harness
  const cache = fs.readFileSync(path.join(ws, '.harness', 'workspace', 'AGENTS.md'), 'utf8')
  assert.ok(cache.includes('## Perfil do projeto'))
})

test('workspace init: --dry-run não cria nada', async () => {
  const ws = path.join(tmpdir(), 'ws-dry')
  await initWorkspace([ws, '--dry-run'])
  assert.ok(!fs.existsSync(ws))
})

/* ------------------------------ new ------------------------------ */

test('workspace new: cria projeto e registra no workspace', async () => {
  const ws = await makeWorkspace()
  await newProject(ws, ['projeto-a'])

  const target = path.join(ws, 'projects', 'projeto-a')
  assert.ok(fs.existsSync(path.join(target, 'AGENTS.md')))
  assert.ok(fs.existsSync(path.join(target, 'context', 'agents', 'queue')))
  assert.ok(fs.existsSync(path.join(target, 'scripts', 'harness', 'bin', 'harness.js')))

  const reg = loadRegistry(ws)
  assert.equal(reg.projects.length, 1)
  assert.equal(reg.projects[0].name, 'projeto-a')
  assert.equal(reg.projects[0].path, target)
})

test('workspace new: rejeita nome duplicado', async () => {
  const ws = await makeWorkspace()
  await newProject(ws, ['projeto-a'])
  await assert.rejects(() => newProject(ws, ['projeto-a']), /já registrado/)
})

/* ------------------------------ add ------------------------------ */

test('workspace add: onboarding de projeto pré-existente (backup + camada + context)', async () => {
  const ws = await makeWorkspace()
  const existing = path.join(tmpdir(), 'projeto-legado')
  fs.mkdirSync(existing, { recursive: true })
  fs.writeFileSync(path.join(existing, 'AGENTS.md'), '# AGENTS.md do projeto legado\ninstruções próprias\n')
  write(existing, 'src/app.ts', 'console.log(1)')

  await addProject(ws, [existing])

  // backup preserva o AGENTS.md original
  const backups = path.join(existing, '.harness', 'backups')
  const backupFiles = fs.readdirSync(backups).filter((f) => f.startsWith('AGENTS.md.'))
  assert.equal(backupFiles.length, 1)
  assert.ok(fs.readFileSync(path.join(backups, backupFiles[0]), 'utf8').includes('projeto legado'))

  // camada instalada
  assert.ok(fs.existsSync(path.join(existing, 'scripts', 'harness', 'bin', 'harness.js')))
  assert.ok(fs.existsSync(path.join(existing, '.agents', 'codegen.md')))
  // AGENTS.md agora é o do harness
  assert.ok(fs.readFileSync(path.join(existing, 'AGENTS.md'), 'utf8').includes('## Perfil do projeto'))
  // esqueleto context/
  for (const d of ['context/project/adr', 'context/modules', 'context/agents/queue', 'context/agents/active', 'context/agents/done']) {
    assert.ok(fs.existsSync(path.join(existing, d)), `faltou: ${d}`)
  }
  // registrado
  const reg = loadRegistry(ws)
  assert.equal(reg.projects.length, 1)
  assert.equal(reg.projects[0].name, 'projeto-legado')
})

test('workspace add: projeto harness pronto só registra (sem onboarding)', async () => {
  const ws = await makeWorkspace()
  const ready = path.join(tmpdir(), 'projeto-pronto')
  const agentsMd = path.join(ws, '.harness', 'workspace', 'AGENTS.md')
  await createProject(ready, {}, ws, agentsMd)

  await addProject(ws, [ready])
  const reg = loadRegistry(ws)
  assert.equal(reg.projects.length, 1)
  assert.equal(reg.projects[0].name, 'projeto-pronto')
})

test('workspace add: validações de isolamento', async () => {
  const ws = await makeWorkspace()

  // raiz do workspace
  await assert.rejects(() => addProject(ws, ['.']), /raiz do workspace/)

  // aninhado
  await newProject(ws, ['projeto-a'])
  const nested = path.join(ws, 'projects', 'projeto-a', 'subdir')
  fs.mkdirSync(nested, { recursive: true })
  await assert.rejects(() => addProject(ws, [nested]), /aninhado/)

  // duplicado (mesmo path)
  await assert.rejects(() => addProject(ws, [path.join(ws, 'projects', 'projeto-a')]), /já registrado/)
})

test('workspace add: --dry-run não modifica projeto pré-existente', async () => {
  const ws = await makeWorkspace()
  const existing = path.join(tmpdir(), 'projeto-dry')
  fs.mkdirSync(existing, { recursive: true })
  fs.writeFileSync(path.join(existing, 'AGENTS.md'), '# original')

  await addProject(ws, [existing, '--dry-run'])

  assert.ok(!fs.existsSync(path.join(existing, 'scripts')))
  assert.ok(!fs.existsSync(path.join(existing, '.harness')))
  const reg = loadRegistry(ws)
  assert.equal(reg.projects.length, 0)
})

/* ------------------------------ list ------------------------------ */

test('workspace list: conta queue/active/done por projeto', async () => {
  const ws = await makeWorkspace()
  await newProject(ws, ['projeto-a'])
  const p = path.join(ws, 'projects', 'projeto-a')
  // limpa as tasks de fundação do template para contar só as nossas
  for (const sub of ['queue', 'active', 'done']) {
    const dir = path.join(p, 'context', 'agents', sub)
    for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f))
  }
  write(p, 'context/agents/queue/01-foo.md', TASK)
  write(p, 'context/agents/queue/02-bar.md', TASK)
  write(p, 'context/agents/active/03-baz.md', TASK)
  write(p, 'context/agents/done/04-qux.md', TASK)

  const out = await capture(() => listWorkspace(ws, [], false))
  const line = out.split(/\r?\n/).find((l) => l.startsWith('projeto-a'))
  assert.ok(line, `linha do projeto não encontrada:\n${out}`)
  assert.match(line, /projeto-a\s+2\s+1\s+1/)
})

/* ------------------------------ isolamento / check ------------------------------ */

test('workspace check: detecta violação de isolamento (duplicado)', async () => {
  const ws = await makeWorkspace()
  await newProject(ws, ['projeto-a'])

  // corrompe o registro: mesmo projeto registrado duas vezes
  const reg = loadRegistry(ws)
  reg.projects.push({ name: 'projeto-a', path: reg.projects[0].path })
  saveRegistry(ws, reg)

  const res = run(ws, ['workspace', 'check'])
  assert.notEqual(res.status, 0)
  assert.ok(res.stdout.includes('duplicado'))
})

test('workspace check --all: check de cada projeto + exit code agregado', async () => {
  const ws = await makeWorkspace()
  await newProject(ws, ['projeto-a'])
  const res = run(ws, ['workspace', 'check', '--all'])
  assert.equal(res.status, 0, res.stdout + res.stderr)
})

/* ------------------------------ --project (end-to-end) ------------------------------ */

test('--project: roda o comando no projeto certo (chdir)', async () => {
  const ws = await makeWorkspace()
  await newProject(ws, ['projeto-a'])

  // sem --project, check na raiz do workspace falha (não é projeto)
  const fail = run(ws, ['check'])
  assert.notEqual(fail.status, 0)

  // com --project, check roda dentro do projeto e passa
  const ok = run(ws, ['check', '--project', 'projeto-a'])
  assert.equal(ok.status, 0, ok.stdout + ok.stderr)
})

test('workspace run: executa comando dentro do projeto', async () => {
  const ws = await makeWorkspace()
  await newProject(ws, ['projeto-a'])
  const res = run(ws, ['workspace', 'run', 'projeto-a', 'check'])
  assert.equal(res.status, 0, res.stdout + res.stderr)
})