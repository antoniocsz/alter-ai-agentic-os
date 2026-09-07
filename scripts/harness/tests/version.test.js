import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const BIN = fileURLToPath(new URL('../bin/harness.js', import.meta.url))

test('harness --version imprime a versão', () => {
  const out = execFileSync(process.execPath, [BIN, '--version'], { encoding: 'utf8' }).trim()
  assert.match(out, /^harness \d+\.\d+\.\d+$/)
})

test('harness help lista o comando version', () => {
  const out = execFileSync(process.execPath, [BIN, 'help'], { encoding: 'utf8' })
  assert.ok(out.includes('version'))
})

test('harness init sem diretório explica o uso', () => {
  let threw = false
  try {
    execFileSync(process.execPath, [BIN, 'init'], { encoding: 'utf8' })
  } catch (err) {
    threw = true
    assert.match(err.stderr, /uso: harness init/)
  }
  assert.equal(threw, true)
})