import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { init } from '../src/init.js'
import { installAdapter, resolveTools } from '../src/lib/adapters.js'
import { tmpdir } from './helpers.js'

test('adapters: opencode renderiza agent, skill e command', () => {
  const root = tmpdir()
  installAdapter('opencode', root, { name: 'demo', profile: 'script' })

  assert.ok(fs.existsSync(path.join(root, '.opencode/agent/coordinator.md')))
  assert.ok(fs.existsSync(path.join(root, '.opencode/skill/mem-search/SKILL.md')))
  assert.ok(fs.existsSync(path.join(root, '.opencode/command/status.md')))
})

test('adapters: claude gera CLAUDE.md (@AGENTS.md), agents, skills e settings', () => {
  const root = tmpdir()
  installAdapter('claude', root, { name: 'demo', profile: 'docs' })

  const claude = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8')
  assert.match(claude, /@AGENTS\.md/)
  assert.ok(fs.existsSync(path.join(root, '.claude/agents/executor.md')))
  assert.ok(fs.existsSync(path.join(root, '.claude/skills/spec-driven/SKILL.md')))
  assert.ok(fs.existsSync(path.join(root, '.claude/commands/recall.md')))
  assert.ok(!fs.existsSync(path.join(root, 'CLAUDE.md.tpl')))

  const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf8'))
  assert.ok(settings.permissions.deny.some((r) => r.includes('git reset')))
})

test('adapters: codex gera prompts e README', () => {
  const root = tmpdir()
  installAdapter('codex', root, { name: 'demo', profile: 'script' })

  assert.ok(fs.existsSync(path.join(root, '.codex/prompts/status.md')))
  assert.ok(fs.existsSync(path.join(root, '.codex/README.md')))
})

test('adapters: --tools válido/ inválido', () => {
  assert.deepEqual(resolveTools([]), ['opencode'])
  assert.deepEqual(resolveTools(['--tools', 'claude,codex']), ['claude', 'codex'])
  assert.throws(() => resolveTools(['--tools', 'vim']), /tool desconhecida/)
})

test('init: --tools claude instala a camada Claude', async () => {
  const root = path.join(tmpdir(), 'tools-projeto')
  await init([root, '--profile', 'script', '--tools', 'claude'])

  assert.ok(fs.existsSync(path.join(root, 'CLAUDE.md')))
  assert.ok(fs.existsSync(path.join(root, '.claude/agents/coordinator.md')))
  assert.ok(!fs.existsSync(path.join(root, '.opencode/agent')), 'opencode não deveria ser instalado')
})
