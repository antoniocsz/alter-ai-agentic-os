import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { init } from '../src/init.js'
import { adapterCmd } from '../src/adapter.js'
import { installAdapter } from '../src/lib/adapters.js'
import {
  SANDBOX_PROFILES,
  SANDBOX_ALLOW,
  SANDBOX_DEFAULT,
  SANDBOX_SUPPORT,
  matchesSandboxDeny,
  resolveSandbox,
  claudePermissions
} from '../src/lib/adapters.js'
import { tmpdir } from './helpers.js'

const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const json = (root, rel) => JSON.parse(read(root, rel))
const kitRoot = (...rel) => path.resolve(import.meta.dirname, '../../..', ...rel)

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

/* --------------------------- perfis e semântica --------------------------- */

test('sandbox: strict é superset estrito de minimal (AC-2)', () => {
  const minimal = SANDBOX_PROFILES.minimal.deny
  const strict = SANDBOX_PROFILES.strict.deny

  for (const pattern of minimal) assert.ok(strict.includes(pattern), `strict deve conter ${pattern}`)
  assert.deepEqual(
    strict.filter((p) => !minimal.includes(p)),
    ['pnpm install*', 'npm install*', 'expo install*', 'curl *', 'wget *']
  )
  assert.deepEqual(minimal, [
    'git reset*',
    'git checkout*',
    'git restore*',
    'git clean*',
    'git push*',
    'rm -rf*',
    'sudo *'
  ])
})

test('sandbox: pipeline do harness NUNCA casa nos denies dos dois perfis (AC-6)', () => {
  const pipeline = [
    'pnpm harness worktree finish 87',
    'pnpm harness status',
    'node scripts/harness/bin/harness.js worktree finish 87',
    'node scripts/harness/src/lib/adapters.js',
    'node scripts/harness/bin/harness.js check'
  ]
  for (const profile of Object.keys(SANDBOX_PROFILES)) {
    for (const cmd of pipeline) {
      assert.equal(
        matchesSandboxDeny(cmd, profile),
        false,
        `pipeline não pode ser bloqueado no perfil ${profile}: ${cmd}`
      )
    }
  }
})

test('sandbox: allow declarado é só o pipeline e o default é minimal (AC-2)', () => {
  assert.deepEqual(SANDBOX_ALLOW, ['pnpm harness*', 'node scripts/harness*'])
  assert.equal(SANDBOX_DEFAULT, 'minimal')
  assert.equal(resolveSandbox(), 'minimal')
  assert.equal(resolveSandbox('strict'), 'strict')
  assert.throws(() => resolveSandbox('paranoid'), /perfil de sandbox desconhecido/)
})

test('sandbox: deny é por prefixo de comando (sem glob extra)', () => {
  for (const cmd of [
    'git reset --hard HEAD~1',
    'git checkout -b nova',
    'git restore .',
    'git clean -fd',
    'git push origin main',
    'rm -rf .',
    'sudo rm -rf /etc'
  ]) {
    assert.equal(matchesSandboxDeny(cmd, 'minimal'), true, `minimal deveria bloquear: ${cmd}`)
  }
  // só no strict (instaladores e rede)
  for (const cmd of ['pnpm install', 'npm install --force x', 'expo install expo-router', 'curl https://exemplo.dev', 'wget http://exemplo.dev/x']) {
    assert.equal(matchesSandboxDeny(cmd, 'minimal'), false, `minimal não bloqueia instalador/rede: ${cmd}`)
    assert.equal(matchesSandboxDeny(cmd, 'strict'), true, `strict deveria bloquear: ${cmd}`)
  }
  // comandos inocentes passam nos dois perfis
  for (const cmd of ['git add -A', 'git commit -m "x"', 'git status', 'pnpm test', 'node --test x.test.js', 'node scripts/other/foo.js']) {
    for (const profile of Object.keys(SANDBOX_PROFILES)) {
      assert.equal(matchesSandboxDeny(cmd, profile), false, `${profile} não deveria bloquear: ${cmd}`)
    }
  }
})

/* ------------------------------- claude (AC-1/2) ------------------------------- */

test('claude adapter (default minimal): settings.json allow/deny do perfil (AC-1)', () => {
  const root = tmpdir()
  installAdapter('claude', root, { name: 'demo', profile: 'docs' })

  const settings = json(root, '.claude/settings.json')
  assert.deepEqual(settings.permissions.allow, ['Bash(pnpm harness:*)', 'Bash(node scripts/harness:*)'])
  assert.deepEqual(settings.permissions.deny, [
    'Bash(git reset:*)',
    'Bash(git checkout:*)',
    'Bash(git restore:*)',
    'Bash(git clean:*)',
    'Bash(git push:*)',
    'Bash(rm -rf:*)',
    'Bash(sudo:*)'
  ])
  // zero regressão do restante da camada claude
  assert.match(read(root, 'CLAUDE.md'), /@AGENTS\.md/)
  assert.ok(fs.existsSync(path.join(root, '.claude/agents/executor.md')))
  assert.ok(fs.existsSync(path.join(root, '.claude/skills/spec-driven/SKILL.md')))

  // template da fonte == saída minimal (coerência, sem drift)
  const template = JSON.parse(fs.readFileSync(kitRoot('adapters/claude/.claude/settings.json'), 'utf8'))
  assert.deepEqual(template, { permissions: claudePermissions('minimal') })
})

test('claude adapter --sandbox strict: estende com instaladores e rede (AC-2)', () => {
  const root = tmpdir()
  installAdapter('claude', root, { name: 'demo', profile: 'docs', sandbox: 'strict' })

  const deny = json(root, '.claude/settings.json').permissions.deny
  for (const block of ['Bash(pnpm install:*)', 'Bash(npm install:*)', 'Bash(expo install:*)', 'Bash(curl:*)', 'Bash(wget:*)']) {
    assert.ok(deny.includes(block), `strict lacking ${block}`)
  }
  assert.equal(deny.length, 12)
  assert.deepEqual(json(root, '.claude/settings.json').permissions.allow, [
    'Bash(pnpm harness:*)',
    'Bash(node scripts/harness:*)'
  ])
})

test('adapter CLI: default minimal, --sandbox strict rende perfil e inválido falha', async () => {
  const root = tmpdir()
  process.chdir(root)
  try {
    await captureStdout(() => adapterCmd(['claude']))
    assert.deepEqual(json(root, '.claude/settings.json').permissions, claudePermissions('minimal'))

    await captureStdout(() => adapterCmd(['claude', '--sandbox', 'strict']))
    assert.deepEqual(json(root, '.claude/settings.json').permissions, claudePermissions('strict'))

    await assert.rejects(() => adapterCmd(['claude', '--sandbox', 'paranoid']), /perfil de sandbox desconhecido/)
  } finally {
    process.chdir(kitRoot())
  }
})

/* ------------------------------ opencode (AC-3) ------------------------------ */

const stripPermission = (content) => {
  const start = content
    .split('\n')
    .findIndex((l, i) => i > 0 && l.trim() === 'permission:')
  if (start === -1) return content
  const lines = content.split('\n')
  const end = lines.findIndex((l, i) => i > start && l.trim() === '---')
  return [...lines.slice(0, start), ...lines.slice(end)].join('\n')
}

test('opencode adapter (default minimal): permission nos agents gerados (AC-3)', () => {
  const root = tmpdir()
  installAdapter('opencode', root, { name: 'demo', profile: 'script' })

  for (const agent of ['coordinator.md', 'backend.md', 'frontend.md', 'mobile.md', 'reviewer.md']) {
    const md = read(root, `.opencode/agent/${agent}`)
    assert.ok(!md.includes('{{'), `${agent} não pode conter placeholder`)
    const frontmatter = md.slice(0, md.indexOf('---', 3))
    assert.equal(frontmatter.split('permission:').length, 2, `${agent}: um único bloco permission:`)
    assert.ok(frontmatter.includes('    "*": allow'))
    const denyCount = md.split('"git reset*"').length - 1
    assert.equal(denyCount, 1, `${agent} precisa do deny de git reset`)
    for (const pattern of SANDBOX_PROFILES.minimal.deny) {
      assert.ok(md.includes(`"${pattern}": deny`), `${agent} lacking "${pattern}": deny`)
    }
    const bashDenies = md.match(/^    "[^"]*": deny$/gm) ?? []
    assert.equal(
      bashDenies.length,
      SANDBOX_PROFILES.minimal.deny.length,
      `${agent}: deny lines baterem com o perfil minimal`
    )
  }
  // executor não tem edit deny; reviewer preserva
  assert.ok(!read(root, '.opencode/agent/backend.md').includes('edit: deny'))
  assert.ok(read(root, '.opencode/agent/reviewer.md').includes('edit: deny'))
})

test('opencode adapter strict: instaladores/rede nos denies e reviewer edit:deny (AC-3)', () => {
  const root = tmpdir()
  installAdapter('opencode', root, { name: 'demo', profile: 'script', sandbox: 'strict' })

  const md = read(root, '.opencode/agent/backend.md')
  for (const pattern of SANDBOX_PROFILES.strict.deny) {
    assert.ok(md.includes(`"${pattern}": deny`), `executor lacking "${pattern}": deny`)
  }
  assert.ok(read(root, '.opencode/agent/reviewer.md').includes('edit: deny'))
})

test('opencode templates são espelho dos agents ao vivo (corpo sem drift)', () => {
  const liveDir = kitRoot('.opencode', 'agent')
  for (const file of fs.readdirSync(liveDir)) {
    const live = fs.readFileSync(path.join(liveDir, file), 'utf8')
    const tpl = read(kitRoot('adapters', 'opencode'), path.join('.opencode', 'agent', file))
    assert.equal(stripPermission(tpl), stripPermission(live), `template divergente: ${file}`)
  }
})

/* ------------------------------- codex (AC-4) ------------------------------- */

test('codex adapter: seção sandbox documentada e honesta (AC-4)', () => {
  const root = tmpdir()
  installAdapter('codex', root, { name: 'demo', profile: 'script' })

  const readme = read(root, '.codex/README.md')
  assert.ok(readme.includes('## Sandbox do harness'))
  assert.ok(readme.includes('minimal'))
  for (const pattern of SANDBOX_PROFILES.minimal.deny) assert.ok(readme.includes(`\`${pattern}\``), `seção lacking ${pattern}`)
  for (const allow of SANDBOX_ALLOW) assert.ok(readme.includes(`\`${allow}\``), `seção lacking allow ${allow}`)
  assert.ok(readme.match(/não reforça/i), 'codex deve admitir que não reforça deny')
  assert.ok(readme.includes('.agents/sandbox.md'))

  const strictRoot = tmpdir()
  installAdapter('codex', strictRoot, { name: 'demo', profile: 'script', sandbox: 'strict' })
  const strictReadme = read(strictRoot, '.codex/README.md')
  for (const pattern of ['pnpm install*', 'npm install*', 'expo install*', 'curl *', 'wget *']) {
    assert.ok(strictReadme.includes(`\`${pattern}\``), `codex strict lacking ${pattern}`)
  }
})

/* ---------------------------- list e entrega (AC-5/7) ---------------------------- */

test('adapter list: mostra perfil de sandbox por tool (AC-7)', async () => {
  const out = await captureStdout(() => adapterCmd(['list']))
  assert.deepEqual(Object.keys(SANDBOX_SUPPORT), ['opencode', 'claude', 'codex', 'browser'])
  assert.ok(out.includes('perfil de sandbox aplicado: minimal'))
  assert.ok(out.includes('--sandbox'))
  for (const support of Object.values(SANDBOX_SUPPORT)) assert.ok(out.includes(support))

  const strictOut = await captureStdout(() => adapterCmd(['list', '--sandbox', 'strict']))
  assert.ok(strictOut.includes('perfil de sandbox aplicado: strict'))
})

test('init entrega .agents/sandbox.md (AC-5)', async () => {
  const root = path.join(tmpdir(), 'sandbox-entregue')
  await init([root, '--profile', 'script', '--tools', 'opencode'])
  const doc = read(root, '.agents/sandbox.md')
  for (const section of ['## Matriz de garantias', '## Política de evolução', 'ADR', 'minimal', 'strict']) {
    assert.ok(doc.includes(section), `.agents/sandbox.md lacking ${section}`)
  }
  // e os agents entregues já nascem com o perfil minimal
  assert.ok(read(root, '.opencode/agent/backend.md').includes('"git reset*": deny'))
})
