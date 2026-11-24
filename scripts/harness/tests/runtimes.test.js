import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { openDb } from '../src/lib/db.js'
import { runTool } from '../src/lib/runner.js'
import * as claude from '../src/lib/runtimes/claude.js'
import { tmpdir } from './helpers.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BIN = path.resolve(HERE, '../bin/harness.js')
const FAKE = path.join(HERE, 'fixtures', 'runtimes', 'fake-claude.js')
const TRANSCRIPT = path.join(HERE, 'fixtures', 'runtimes', 'claude-success.jsonl')

function binDir(names) {
  const dir = tmpdir()
  // Executável que responde `--version` (os demais argumentos vão para o fake genérico).
  const versionScript = path.join(dir, 'version.mjs')
  fs.writeFileSync(versionScript, `if (process.argv.includes('--version')) { console.log('9.9.9-teste'); process.exit(0) }\nawait import(${JSON.stringify(pathToFileURL(FAKE).href)})\n`)
  for (const name of names) {
    if (process.platform === 'win32') {
      fs.writeFileSync(path.join(dir, `${name}.cmd`), `@"${process.execPath}" "${versionScript}" %*\r\n`)
    } else {
      fs.writeFileSync(path.join(dir, name), `#!/bin/sh\nexec "${process.execPath}" "${versionScript}" "$@"\n`)
      fs.chmodSync(path.join(dir, name), 0o755)
    }
  }
  return dir
}

test('harness runtimes --json: detecta instaladas (caminho + versão) e ausentes (com instrução)', () => {
  const dir = binDir(['codex'])
  const env = { ...process.env, PATH: dir, Path: dir }
  const res = spawnSync(process.execPath, [BIN, 'runtimes', '--json'], { cwd: tmpdir(), encoding: 'utf8', env })
  assert.equal(res.status, 0, res.stderr)
  const rows = Object.fromEntries(JSON.parse(res.stdout).map((r) => [r.tool, r]))
  assert.deepEqual(Object.keys(rows).sort(), ['claude', 'codex', 'gemini', 'opencode'])
  assert.equal(rows.codex.installed, true)
  assert.equal(rows.codex.version, '9.9.9-teste')
  assert.match(rows.codex.path, /codex(\.cmd)?$/)
  assert.equal(rows.codex.command, 'codex exec --json --sandbox workspace-write -')
  for (const t of ['claude', 'gemini', 'opencode']) {
    assert.equal(rows[t].installed, false)
    assert.match(rows[t].install, /instale/)
  }
  const text = spawnSync(process.execPath, [BIN, 'runtimes'], { cwd: tmpdir(), encoding: 'utf8', env })
  assert.match(text.stdout, /✅ codex\s+9\.9\.9-teste/)
  assert.match(text.stdout, /— gemini\s+não instalado/)
})

test('runTool({ rawLog }): grava a saída exatamente como a tool emitiu, inclusive não-JSON, e o stderr', async () => {
  const root = tmpdir()
  const dir = binDir(['claude'])
  const rawLog = path.join(root, 'out', 'claude-raw.jsonl')
  const db = openDb(root)
  const res = await runTool({
    db, taskId: '01-a.md', cwd: root, driver: claude, prompt: 'x', rawLog,
    env: { ...process.env, PATH: dir + path.delimiter + process.env.PATH, FAKE_STDERR: 'aviso no stderr\n' }
  })
  db.close()
  assert.equal(res.status, 'completed')
  assert.equal(fs.readFileSync(rawLog, 'utf8'), fs.readFileSync(TRANSCRIPT, 'utf8').replace(/\r\n/g, '\n'))
  assert.equal(fs.readFileSync(rawLog + '.stderr', 'utf8'), 'aviso no stderr\n')
})

test('harness run --raw: exige caminho e não vale no lote', () => {
  const root = tmpdir()
  const run = (args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' })
  assert.match(run(['run', '--batch', '01,02', '--tool', 'claude', '--raw', 'x.jsonl']).stderr, /--raw vale só para o run único/)
})
