import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { init } from '../src/init.js'
import { adapterCmd } from '../src/adapter.js'
import { installAdapter, resolveTools } from '../src/lib/adapters.js'
import { tmpdir, write } from './helpers.js'

// Captura stdout do produto (strings) sem afetar o protocolo do runner (Buffers).
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

const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const json = (root, rel) => JSON.parse(read(root, rel))

/* ---------------------------------- AC-1 ---------------------------------- */

test('browser opencode: cria opencode.json canônico quando ausente (AC-1)', () => {
  const root = tmpdir()
  const res = installAdapter('browser', root, { targetTool: 'opencode' })

  assert.equal(res.opencode, 'created')
  const config = json(root, 'opencode.json')
  assert.equal(config.$schema, 'https://opencode.ai/config.json')
  assert.deepEqual(config.mcp.browser, {
    type: 'local',
    command: ['npx', '-y', '@playwright/mcp@latest']
  })
})

test('browser opencode: preserva entries existentes ao injetar (AC-1)', () => {
  const root = tmpdir()
  write(
    root,
    'opencode.json',
    JSON.stringify(
      {
        $schema: 'https://opencode.ai/config.json',
        model: 'provider/model',
        mcp: { context7: { type: 'remote', url: 'https://mcp.context7.example/sse' } }
      },
      null,
      2
    ) + '\n'
  )
  const res = installAdapter('browser', root, { targetTool: 'opencode' })

  assert.equal(res.opencode, 'merged')
  const config = json(root, 'opencode.json')
  assert.deepEqual(config.mcp.context7, { type: 'remote', url: 'https://mcp.context7.example/sse' })
  assert.equal(config.model, 'provider/model')
  assert.ok(config.mcp.browser.command.includes('-y'))
})

/* ---------------------------------- AC-3 ---------------------------------- */

test('browser opencode: 2ª execução é no-op idempotente (AC-3)', () => {
  const root = tmpdir()
  installAdapter('browser', root, { targetTool: 'opencode' })
  const before = read(root, 'opencode.json')

  const res = installAdapter('browser', root, { targetTool: 'opencode' })

  assert.equal(res.opencode, 'noop')
  assert.equal(read(root, 'opencode.json'), before, 'arquivo não deveria mudar no no-op')
})

test('browser: CLI no-op em 2ª execução com mensagem clara (AC-3)', async () => {
  const root = tmpdir()
  const previousCwd = process.cwd()
  process.chdir(root)
  try {
    const out1 = await captureStdout(() => adapterCmd(['browser', 'opencode']))
    assert.match(out1, /criado/)
    const out2 = await captureStdout(() => adapterCmd(['browser', 'opencode']))
    assert.match(out2, /no-op \(idempotente\)/)
  } finally {
    process.chdir(previousCwd)
  }
})

/* ------------------------- AC-2 / fail-safe (AC-4) ------------------------ */

test('browser claude: cria .mcp.json na raiz quando ausente (AC-2)', () => {
  const root = tmpdir()
  const res = installAdapter('browser', root, { targetTool: 'claude' })

  assert.equal(res.claude, 'created')
  const config = json(root, '.mcp.json')
  assert.deepEqual(config.mcpServers.browser, {
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest']
  })
})

test('browser claude: preserva outros servers e é idempotente (AC-2/AC-3)', () => {
  const root = tmpdir()
  write(
    root,
    '.mcp.json',
    JSON.stringify(
      {
        mcpServers: {
          filesystem: { command: 'npx', args: ['-y', 'server-fs', '/tmp'] },
          github: { command: 'npx', args: ['-y', 'server-gh', '<TOKEN>'] }
        }
      },
      null,
      2
    ) + '\n'
  )
  installAdapter('browser', root, { targetTool: 'claude' })

  const config = json(root, '.mcp.json')
  assert.deepEqual(config.mcpServers.filesystem, { command: 'npx', args: ['-y', 'server-fs', '/tmp'] })
  assert.deepEqual(config.mcpServers.github, { command: 'npx', args: ['-y', 'server-gh', '<TOKEN>'] })
  assert.ok(config.mcpServers.browser)

  const before = read(root, '.mcp.json')
  const res = installAdapter('browser', root, { targetTool: 'claude' })
  assert.equal(res.claude, 'noop')
  assert.equal(read(root, '.mcp.json'), before)
})

test('browser codex: escreve instrução em .codex/prompts e não toca .mcp.json/opencode.json (AC-2)', () => {
  const root = tmpdir()
  const res = installAdapter('browser', root, { targetTool: 'codex' })

  assert.equal(res.codex, 'written')
  const prompt = read(root, path.join('.codex', 'prompts', 'browser.md'))
  assert.match(prompt, /config\.toml/)
  assert.match(prompt, /@playwright\/mcp@latest/)
  assert.ok(!fs.existsSync(path.join(root, '.mcp.json')), 'Codex não usa .mcp.json')
  assert.ok(!fs.existsSync(path.join(root, 'opencode.json')))
})

test('browser: fail-safe em JSONC — arquivo intacto + bloco p/ merge manual (AC-4)', () => {
  const root = tmpdir()
  const raw = '{\n  // comentário quebra o JSON.parse estrito\n  "mcpServers": {}\n}'
  write(root, '.mcp.json', raw)

  assert.throws(
    () => installAdapter('browser', root, { targetTool: 'claude' }),
    (err) => {
      assert.match(err.message, /fail-safe/)
      assert.match(err.message, /não foi alterado/)
      assert.match(err.message, /Funde manualmente/)
      assert.match(err.message, /mcpServers/)
      return true
    }
  )
  assert.equal(read(root, '.mcp.json'), raw, 'fail-safe nunca deve tocar o arquivo')
})

test('browser: fail-safe em estrutura inesperada — raiz não-objeto e seção inválida (AC-4)', () => {
  const root = tmpdir()
  const rawArray = '[1, 2, 3]'
  write(root, 'opencode.json', rawArray)
  assert.throws(() => installAdapter('browser', root, { targetTool: 'opencode' }), /raiz não é um objeto/)
  assert.equal(read(root, 'opencode.json'), rawArray)

  const rawSection = JSON.stringify({ mcp: 'valor-escalar' }, null, 2) + '\n'
  write(root, 'opencode.json', rawSection)
  assert.throws(() => installAdapter('browser', root, { targetTool: 'opencode' }), /"mcp" existe mas não é um objeto/)
  assert.equal(read(root, 'opencode.json'), rawSection)
})

/* ---------------------------------- AC-5 ---------------------------------- */

test('adapter list inclui browser como camada disponível (AC-5)', async () => {
  const out = await captureStdout(() => adapterCmd([]))

  assert.match(out, /browser\s+Browser MCP/)
  assert.match(out, /opencode\s+OpenCode/)
  assert.match(out, /Playwright via npx/)
})

test('resolveTools aceita browser na lista de tools (AC-5/AC-7)', () => {
  assert.deepEqual(resolveTools(['--tools', 'opencode,claude,browser']), ['opencode', 'claude', 'browser'])
  assert.deepEqual(resolveTools(['--tools', 'browser']), ['browser'])
  assert.throws(() => resolveTools(['--tools', 'browser,vim']), /tool desconhecida/)
})

/* ---------------------------- uso / --browser-package ---------------------- */

test('adapter browser sem tool → ajuda de uso (exit 0, lista o que escreve em cada)', async () => {
  const out = await captureStdout(() => adapterCmd(['browser']))

  assert.match(out, /harness adapter browser <opencode\|claude\|codex>/)
  assert.match(out, /--browser-package/)
  assert.match(out, /opencode\.json/)
  assert.match(out, /\.mcp\.json/)
  assert.match(out, /config\.toml/)
})

test('browser: --browser-package customizado cai na entry gerada', () => {
  const root = tmpdir()
  installAdapter('browser', root, {
    targetTool: 'claude',
    browserPackage: '@playwright/mcp@1.2.3'
  })

  const config = json(root, '.mcp.json')
  assert.deepEqual(config.mcpServers.browser, {
    command: 'npx',
    args: ['-y', '@playwright/mcp@1.2.3']
  })
})

test('browser: --browser-package inválida reprova sem tocar o arquivo', () => {
  const root = tmpdir()
  const raw = JSON.stringify({ mcp: {} }, null, 2) + '\n'
  write(root, 'opencode.json', raw)

  assert.throws(
    () => installAdapter('browser', root, { targetTool: 'opencode', browserPackage: 'pacote com espaço' }),
    /browser-package inválida/
  )
  assert.equal(read(root, 'opencode.json'), raw)
})

/* ---------------------------------- AC-8 ---------------------------------- */

test('browser: nada toca package.json/lockfile nas 3 instâncias (AC-8)', () => {
  const root = tmpdir()
  const pkg = '{\n  "name": "demo",\n  "version": "1.0.0"\n}\n'
  const lock = 'lockfileVersion: 9.0\n'
  write(root, 'package.json', pkg)
  write(root, 'pnpm-lock.yaml', lock)

  installAdapter('browser', root, { tools: ['opencode', 'claude', 'codex'] })

  assert.equal(read(root, 'package.json'), pkg)
  assert.equal(read(root, 'pnpm-lock.yaml'), lock)
  assert.ok(!fs.existsSync(path.join(root, 'node_modules')))
})

/* --------------------------- init (AC-6 / AC-7) --------------------------- */

test('init --tools opencode,claude,browser instala a config do browser no scaffold (AC-7)', async () => {
  const root = path.join(tmpdir(), 'browser-tools-projeto')
  await init([root, '--profile', 'script', '--tools', 'opencode,claude,browser'])

  assert.ok(json(root, 'opencode.json')?.mcp?.browser)
  assert.ok(json(root, '.mcp.json')?.mcpServers?.browser)
  assert.ok(fs.existsSync(path.join(root, '.opencode', 'agent', 'coordinator.md')))
  assert.ok(!fs.existsSync(path.join(root, '.codex')), 'codex não foi pedido na lista')
  assert.ok(fs.existsSync(path.join(root, 'adapters', 'browser', '.codex', 'prompts', 'browser.md')))
})

test('.agents/browser.md é entregue no init do projeto (AC-6)', async () => {
  const root = path.join(tmpdir(), 'ac6-projeto')
  await init([root, '--profile', 'bare'])

  const browserMd = read(root, path.join('.agents', 'browser.md'))
  assert.match(browserMd, /Quando usar navegador em task/)
  assert.match(browserMd, /guard rails/i)
  assert.match(browserMd, /\.tmp\//)
})

/* ------------------------------- sanidade ---------------------------------- */

test('browser: installAdapter p/ camada browser valida tool desconhecida', () => {
  const root = tmpdir()
  assert.throws(
    () => installAdapter('browser', root, { targetTool: 'vim' }),
    /browser escreve em:/
  )
})
