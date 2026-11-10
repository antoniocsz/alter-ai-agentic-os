import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { adapterCmd } from '../src/adapter.js'
import { update } from '../src/update.js'
import { readAdaptersMarker, BROWSER_DEFAULT_PACKAGE } from '../src/lib/adapters.js'
import { tmpdir } from './helpers.js'

const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const markerFile = (root) => path.join(root, '.harness', 'adapters.json')
const agentFile = (root, name) => path.join(root, '.opencode', 'agent', name)

// Espelho de captureStdout de adapter-sandbox.test.js: captura as strings do
// produto sem afetar o protocolo v8-serializado do runner do node --test.
async function captureStdout(fn) {
  const chunks = []
  const original = process.stdout.write
  process.stdout.write = (chunk, ...rest) => {
    if (typeof chunk === 'string') {
      chunks.push(chunk)
      return true
    }
    return original.call(process.stdout, chunk, ...rest)
  }
  try {
    await fn()
  } finally {
    process.stdout.write = original
  }
  return chunks.join('')
}

async function inProject(root, fn) {
  const original = process.cwd()
  process.chdir(root)
  try {
    return await fn()
  } finally {
    process.chdir(original)
  }
}

/** Fonte mínima de harness para os testes de update (camada + adapters). */
function writeSource(src, { agentBody = 'adapter demo {{NAME}} {{PROFILE}}\n{{SANDBOX_DENY}}\n' } = {}) {
  fs.writeFileSync(path.join(src, 'AGENTS.md'), '# fonte de teste\n')
  fs.mkdirSync(path.join(src, '.agents'), { recursive: true })
  fs.writeFileSync(path.join(src, '.agents', 'README.md'), 'agents da fonte\n')
  fs.mkdirSync(path.join(src, '.opencode'), { recursive: true })
  fs.writeFileSync(path.join(src, '.opencode', 'camada.md'), 'camada da fonte\n')
  fs.mkdirSync(path.join(src, 'adapters', 'opencode', '.opencode', 'agent'), { recursive: true })
  fs.writeFileSync(path.join(src, 'adapters', 'opencode', '.opencode', 'agent', 'demo.md'), agentBody)
  fs.mkdirSync(path.join(src, 'adapters', 'shared', 'skill', 'demo'), { recursive: true })
  fs.writeFileSync(path.join(src, 'adapters', 'shared', 'skill', 'demo', 'SKILL.md'), 'skill {{NAME}}\n')
  fs.mkdirSync(path.join(src, 'adapters', 'shared', 'command'), { recursive: true })
  fs.writeFileSync(path.join(src, 'adapters', 'shared', 'command', 'demo.md'), 'cmd {{NAME}}\n')
}

/* ------------------------- marcador .harness/adapters.json ------------------------- */

test('adapter grava o marcador: tools, sandbox null sem flag e browser null', async () => {
  const root = tmpdir()
  await inProject(root, async () => {
    await captureStdout(() => adapterCmd(['opencode']))
  })

  const marker = JSON.parse(read(root, '.harness/adapters.json'))
  assert.deepEqual(marker, { tools: ['opencode'], sandbox: null, browser: null })
})

test('--sandbox strict atualiza o marcador; sem flag o perfil salvo é preservado', async () => {
  const root = tmpdir()
  await inProject(root, async () => {
    await captureStdout(() => adapterCmd(['claude', '--sandbox', 'strict']))
    assert.deepEqual(JSON.parse(read(root, '.harness/adapters.json')), {
      tools: ['claude'],
      sandbox: 'strict',
      browser: null
    })

    // re-instalação sem flag: o perfil legado não é derrubado pela default
    await captureStdout(() => adapterCmd(['claude']))
    assert.equal(readAdaptersMarker(root).sandbox, 'strict')
  })
})

test('merge idempotente: nova tool entra, existente não duplica nem troca sandbox', async () => {
  const root = tmpdir()
  await inProject(root, async () => {
    await captureStdout(() => adapterCmd(['opencode']))
    await captureStdout(() => adapterCmd(['claude', '--sandbox', 'strict']))
    await captureStdout(() => adapterCmd(['opencode']))

    const marker = readAdaptersMarker(root)
    assert.deepEqual(marker.tools, ['opencode', 'claude'])
    assert.equal(marker.sandbox, 'strict')
    assert.equal(marker.issues.length, 0)
  })
})

test('adapter browser grava tool-alvo e pacote no marcador (sandbox intocado)', async () => {
  const root = tmpdir()
  await inProject(root, async () => {
    await captureStdout(() => adapterCmd(['opencode', '--sandbox', 'strict']))
    await captureStdout(() => adapterCmd(['browser', 'claude']))

    const marker = readAdaptersMarker(root)
    assert.deepEqual(marker.tools, ['opencode', 'browser'])
    assert.equal(marker.sandbox, 'strict')
    assert.deepEqual(marker.browser, { target: 'claude', package: BROWSER_DEFAULT_PACKAGE })
  })
})

test('readAdaptersMarker normaliza e reporta problemas sem travar o consumidor', () => {
  const root = tmpdir()
  assert.deepEqual(readAdaptersMarker(root), { tools: [], sandbox: null, browser: null, issues: [] })

  fs.mkdirSync(path.join(root, '.harness'), { recursive: true })
  fs.writeFileSync(
    markerFile(root),
    JSON.stringify({ tools: ['opencode', 'vim', 42, 'opencode'], sandbox: 'fancy', browser: 'claude' })
  )
  const marker = readAdaptersMarker(root)
  assert.deepEqual(marker.tools, ['opencode'])
  assert.equal(marker.sandbox, null)
  assert.equal(marker.browser, null)
  assert.equal(marker.issues.length, 4)
  for (const expected of ['vim', '"sandbox"', '"browser"']) {
    assert.ok(marker.issues.some((issue) => issue.includes(expected)), `issue esperada: ${expected}`)
  }
})

/* --------------------------------- update --------------------------------- */

test('update sem marcador: nenhum sync de adapters (comportamento preservado)', async () => {
  const project = tmpdir()
  const src = tmpdir()
  writeSource(src)

  const out = await inProject(project, () => captureStdout(() => update(['--source', src])))

  assert.ok(!out.includes('adapters ressincronizados'), 'sem sync de adapters')
  assert.ok(!out.includes('aviso:'), 'sem avisos')
  assert.ok(!fs.existsSync(path.join(project, 'CLAUDE.md')), 'claude não deveria ser instalado')
  assert.ok(!fs.existsSync(markerFile(project)), 'update não cria marcador')
  assert.ok(!fs.existsSync(agentFile(project, 'demo.md')), 'agent da fonte não instalado')
  assert.equal(read(project, 'AGENTS.md'), '# fonte de teste\n', 'camada padrão continua sendo copiada')
})

test('update ressincroniza os adapters do marcador com os templates da fonte (v1 → v2)', async () => {
  const project = tmpdir()
  const src = tmpdir()
  writeSource(src)

  const out = await inProject(project, () =>
    captureStdout(async () => {
      await adapterCmd(['opencode'])
      await update(['--source', src])
    })
  )

  const first = fs.readFileSync(agentFile(project, 'demo.md'), 'utf8')
  assert.ok(first.includes('adapter demo') && first.includes('web'), 'NAME/PROFILE renderizados')
  assert.ok(first.includes('"git reset*": deny'), 'SANDBOX_DENY do perfil minimal')
  assert.ok(!first.includes('{{'), 'sem placeholder residual')
  assert.ok(out.includes('adapters ressincronizados: opencode'))
  assert.ok(
    fs.existsSync(path.join(project, 'adapters', 'opencode', '.opencode', 'agent', 'demo.md')),
    'a camada copiada agora traz adapters/ também'
  )

  // fonte atualizada → segundo sync reflete os templates novos
  fs.writeFileSync(path.join(src, 'adapters', 'opencode', '.opencode', 'agent', 'demo.md'), 'adaptador demo v2\n')
  const second = await inProject(project, () => captureStdout(() => update(['--source', src])))
  assert.equal(fs.readFileSync(agentFile(project, 'demo.md'), 'utf8'), 'adaptador demo v2\n')
  assert.ok(second.includes('adapters ressincronizados: opencode'))
  assert.deepEqual(readAdaptersMarker(project).tools, ['opencode'])
})

test('update respeita o perfil de sandbox salvo no marcador', async () => {
  const project = tmpdir()
  const src = tmpdir()
  fs.writeFileSync(path.join(src, 'AGENTS.md'), '# fonte de teste\n')
  fs.mkdirSync(path.join(src, 'adapters', 'claude'), { recursive: true })
  fs.writeFileSync(path.join(src, 'adapters', 'claude', 'CLAUDE.md.tpl'), '@AGENTS.md {{PROFILE}}\n')

  await inProject(project, () =>
    captureStdout(async () => {
      await adapterCmd(['claude', '--sandbox', 'strict'])
      await update(['--source', src])
    })
  )

  const settings = JSON.parse(read(project, '.claude/settings.json'))
  for (const rule of ['Bash(pnpm install:*)', 'Bash(curl:*)', 'Bash(git reset:*)']) {
    assert.ok(settings.permissions.deny.includes(rule), `sandbox strict ressincronizado: ${rule}`)
  }
  const claude = read(project, 'CLAUDE.md')
  assert.ok(claude.includes('@AGENTS.md') && claude.includes('web'))
  assert.ok(!fs.existsSync(path.join(project, 'CLAUDE.md.tpl')))
  assert.equal(readAdaptersMarker(project).sandbox, 'strict')
})

test('update com fonte sem adapters/: aviso claro e skip, não erro', async () => {
  const project = tmpdir()
  const src = tmpdir()
  fs.writeFileSync(path.join(src, 'AGENTS.md'), '# fonte sem adapters\n')

  const claudeBefore = await inProject(project, async () => {
    await captureStdout(() => adapterCmd(['opencode']))
    await captureStdout(() => adapterCmd(['claude']))
    return read(project, 'CLAUDE.md')
  })

  const out = await inProject(project, () => captureStdout(() => update(['--source', src])))

  assert.ok(out.includes('fonte do harness sem adapters/'), 'aviso claro da fonte sem adapters/')
  assert.ok(out.includes('adapters não ressincronizados'))
  assert.ok(!out.includes('adapters ressincronizados'), 'nenhum adapter foi ressincronizado')
  assert.equal(read(project, 'AGENTS.md'), '# fonte sem adapters\n', 'camada segue sincronizada')
  assert.equal(read(project, 'CLAUDE.md'), claudeBefore, 'adapter instalado preservado do update')
})

test('update com marcador corrompido: aviso e skip, não erro', async () => {
  const project = tmpdir()
  const src = tmpdir()
  writeSource(src)

  await inProject(project, () => captureStdout(async () => {
    await adapterCmd(['opencode'])
    fs.writeFileSync(markerFile(project), '{ não é json')
    await update(['--source', src])
  }))

  const out = await inProject(project, () => captureStdout(() => update(['--source', src])))

  assert.ok(out.includes('não é JSON estrito'), 'aviso do marcador ilegível')
  assert.ok(!out.includes('adapters ressincronizados'), 'nenhum sync com marcador corrompido')
  assert.ok(!fs.existsSync(agentFile(project, 'demo.md')), 'templates da fonte não aplicados')
  assert.equal(read(project, 'AGENTS.md'), '# fonte de teste\n', 'camada copiada mesmo assim')
})

test('update --dry-run não ressincroniza adapters', async () => {
  const project = tmpdir()
  const src = tmpdir()
  writeSource(src)

  await inProject(project, () =>
    captureStdout(async () => {
      await adapterCmd(['opencode'])
      await update(['--source', src])
    })
  )
  fs.writeFileSync(path.join(src, 'adapters', 'opencode', '.opencode', 'agent', 'demo.md'), 'adaptador demo v2\n')
  const before = fs.readFileSync(agentFile(project, 'demo.md'), 'utf8')

  const out = await inProject(project, () =>
    captureStdout(() => update(['--source', src, '--dry-run']))
  )

  assert.ok(out.includes('dry-run'))
  assert.equal(fs.readFileSync(agentFile(project, 'demo.md'), 'utf8'), before, 'conteúdo alvo inalterado')
})
