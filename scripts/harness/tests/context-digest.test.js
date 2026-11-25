// Digest do módulo (feature otimizador-de-contexto, task 133): um agente resume o histórico do
// status.md em digest.md (só leitura; o harness grava), e o pacote de contexto passa a usá-lo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseDigest, buildDigestPrompt } from '../src/lib/digest.js'
import { buildContextPackage } from '../src/lib/context.js'
import { init } from '../src/init.js'
import { tmpdir, write, withSilentStdout } from './helpers.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FAKE = path.join(HERE, 'fixtures', 'runtimes', 'fake-flow-agent.js')
const BIN = path.resolve(HERE, '../bin/harness.js')

function fakeEnv(extra = {}) {
  const dir = tmpdir()
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(dir, 'claude.cmd'), `@"${process.execPath}" "${FAKE}" %*\r\n`)
  } else {
    const file = path.join(dir, 'claude')
    fs.writeFileSync(file, `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" "$@"\n`)
    fs.chmodSync(file, 0o755)
  }
  return { ...process.env, PATH: dir + path.delimiter + (process.env.PATH ?? ''), ...extra }
}

const STATUS = `# m1 — Status

## Handoff (task 1 — a)
- Feito: parser.
- Decisões: prompt pelo argv.

## Handoff (task 2 — b)
- Feito: runner.
- Decisões: prompt pelo stdin (troca a decisão da task 1).
`

async function project() {
  const root = path.join(tmpdir(), 'proj-digest')
  await withSilentStdout(() => init([root, '--profile', 'script', '--git']))
  write(root, 'context/modules/m1/context.md', '# m1\n\nRunner.\n')
  write(root, 'context/modules/m1/status.md', STATUS)
  write(root, 'tasks/active/03-x.md', '# Task: x\n## Agente: `backend` | Módulo: `m1` | Prioridade: P2 | Tipo: feat\n## Escopo (arquivos que esta task vai tocar):\n- `src/a.js`\n## Critério de conclusão:\n- [ ] ok\n')
  return root
}

const cli = (root, env, ...args) => spawnSync(process.execPath, [BIN, 'context', ...args], { cwd: root, encoding: 'utf8', env })

test('digest: parseDigest e prompt', () => {
  assert.equal(parseDigest('x\n--- DIGEST ---\n- um resumo com conteúdo suficiente\n--- FIM ---\ny'), '- um resumo com conteúdo suficiente')
  assert.equal(parseDigest('sem bloco'), null)
  assert.equal(parseDigest('--- DIGEST ---\ncurto\n--- FIM ---'), null)
  const p = buildDigestPrompt('m1', STATUS, null, 300)
  assert.match(p, /Você é o REDATOR/)
  assert.match(p, /no máximo 300 palavras/)
  assert.match(p, /prompt pelo stdin/)
})

test('harness context digest: grava digest.md a partir da resposta; o pacote usa; guardas', async () => {
  const root = await project()
  const dry = cli(root, fakeEnv(), 'digest', 'm1', '--tool', 'claude', '--dry-run')
  assert.equal(dry.status, 0, dry.stderr + dry.stdout)
  assert.match(dry.stdout, /dry-run: nada gravado/)
  assert.ok(!fs.existsSync(path.join(root, 'context/modules/m1/digest.md')))

  const ok = cli(root, fakeEnv(), 'digest', 'm1', '--tool', 'claude')
  assert.equal(ok.status, 0, ok.stderr + ok.stdout)
  assert.match(ok.stdout, /context\/modules\/m1\/digest\.md gravado/)
  const digest = fs.readFileSync(path.join(root, 'context/modules/m1/digest.md'), 'utf8')
  assert.match(digest, /^<!-- gerado por harness context digest/)
  assert.match(digest, /Decisão vigente: prompt sempre pelo stdin/)
  const mod = buildContextPackage(root, '03').sections.find((s) => s.id === 'module')
  assert.match(mod.content, /Resumo do histórico[\s\S]*prompt sempre pelo stdin/)

  const dirty = cli(root, fakeEnv({ FAKE_DIGEST_WRITE: '1' }), 'digest', 'm1', '--tool', 'claude')
  assert.notEqual(dirty.status, 0)
  assert.match(dirty.stderr, /alterou arquivos do repositório/)
  fs.rmSync(path.join(root, 'redator.txt'))
  const noBlock = cli(root, fakeEnv({ FAKE_DIGEST_NOBLOCK: '1' }), 'digest', 'm1', '--tool', 'claude')
  assert.notEqual(noBlock.status, 0)
  assert.match(noBlock.stderr, /sem o bloco --- DIGEST ---/)

  assert.match(cli(root, fakeEnv(), 'digest', 'nao-existe', '--tool', 'claude').stderr, /módulo sem status\.md/)
  assert.match(cli(root, fakeEnv(), 'digest', 'm1').stderr, /uso: harness context digest/)
  assert.match(cli(root, fakeEnv(), 'digest', 'm1', '--tool', 'claude', '--max-words', '10').stderr, /--max-words inválido/)
})
