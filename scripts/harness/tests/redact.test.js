import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { redact, scanSecrets } from '../src/lib/redact.js'
import { runGates } from '../src/lib/gates.js'
import { sessionEnd } from '../src/lib/memory.js'
import { tmpdir, write } from './helpers.js'

test('redact: mascara chaves e preserva o prefixo de senha', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk'
  const out = redact(`api sk-abcdefghijklmnop1234 e password=supersecreto123 jwt ${jwt}`)
  assert.ok(!out.includes('sk-abcdefghijklmnop1234'))
  assert.ok(!out.includes('supersecreto123'))
  assert.ok(!out.includes(jwt))
  assert.match(out, /password=\[REDACTED\]/)
  assert.match(out, /\[REDACTED\]/)
})

test('scanSecrets: acha segredo plantado e ignora arquivo limpo', () => {
  const root = tmpdir()
  write(root, 'src/config.js', 'export const key = "sk-abcdefghijklmnop1234"\n')
  write(root, 'src/clean.js', 'export const ok = 1\n')

  const findings = scanSecrets(root)
  assert.equal(findings.length, 1)
  assert.match(findings[0], /src\/config\.js:1/)

  const results = runGates(root, ['secrets'])
  assert.equal(results[0].status, 'failed')
})

test('gate secrets: passa em repositório limpo', () => {
  const root = tmpdir()
  write(root, 'src/index.js', 'export const ok = true\n')
  const results = runGates(root, ['secrets'])
  assert.equal(results[0].status, 'passed')
})

test('session end não persiste segredo', () => {
  const root = tmpdir()
  const res = sessionEnd(root, 'configurei password=supersecreto123 no deploy')
  const content = fs.readFileSync(path.join(root, res.file), 'utf8')
  assert.ok(!content.includes('supersecreto123'))
  assert.match(content, /\[REDACTED\]/)
})
