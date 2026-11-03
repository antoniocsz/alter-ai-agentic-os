import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { redact, scanSecrets } from '../src/lib/redact.js'
import { runGates } from '../src/lib/gates.js'
import { sessionEnd } from '../src/lib/memory.js'
import { tmpdir, write } from './helpers.js'

const FAKE_SK = 'sk-' + 'abcdefghijklmnop1234'
const FAKE_JWT =
  'eyJ' + 'hbGciOiJIUzI1NiJ9.' + 'eyJzdWIiOiIxMjM0NTY3ODkwIn0.' + 'abcdefghijk'
const FAKE_PW = 'DB_PASSWORD=' + 'supersecreto123'
const FAKE_DB = 'DATABASE_URL=' + 'postgres://user:senha123@host/db'
const FAKE_BEARER = 'Authorization: Bearer ' + 'abcdefghijklmnopqrstuvwxyz'

test('redact: mascara chaves, env e bearer preservando prefixo', () => {
  const out = redact(`api ${FAKE_SK} e ${FAKE_PW} e ${FAKE_DB} e ${FAKE_JWT} e ${FAKE_BEARER}`)
  assert.ok(!out.includes(FAKE_SK))
  assert.ok(!out.includes('supersecreto123'))
  assert.ok(!out.includes('senha123'))
  assert.ok(!out.includes(FAKE_JWT))
  assert.ok(!out.includes('abcdefghijklmnopqrstuvwxyz'))
  assert.match(out, /DB_PASSWORD=\[REDACTED\]/)
  assert.match(out, /Bearer \[REDACTED\]/)
})

test('scanSecrets: pega .env, arquivo com "lock" no nome e diretório de testes', () => {
  const root = tmpdir()
  write(root, '.env', 'DB_PASSWORD=' + 'supersecreto123' + '\n')
  write(root, 'src/blocklist.ts', 'export const x = "' + FAKE_SK + '"\n')
  write(root, 'tests/fixture.test.js', 'DATABASE_URL=' + 'postgres://user:senha123@host/db\n')
  write(root, 'src/clean.ts', 'export const ok = 1\n')

  const findings = scanSecrets(root)
  const joined = findings.join('\n')
  assert.match(joined, /\.env:1/)
  assert.match(joined, /blocklist\.ts:1/)
  assert.match(joined, /fixture\.test\.js:1/)

  const results = runGates(root, ['secrets'])
  assert.equal(results[0].status, 'failed')
})

test('gate secrets: passa em repositório limpo e não flagra exemplos', () => {
  const root = tmpdir()
  write(root, 'src/index.js', 'export const ok = true\n')
  write(root, '.env.example', 'POSTGRES_PASSWORD=postgres\n')
  const results = runGates(root, ['secrets'])
  assert.equal(results[0].status, 'passed')
})

test('session end não persiste segredo', () => {
  const root = tmpdir()
  const res = sessionEnd(root, 'configurei ' + 'DB_PASSWORD=' + 'supersecreto123' + ' no deploy')
  const content = fs.readFileSync(path.join(root, res.file), 'utf8')
  assert.ok(!content.includes('supersecreto123'))
  assert.match(content, /\[REDACTED\]/)
})
