import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { isGitRepo, modifiedFiles, outOfScopeFiles } from '../src/lib/git.js'
import { tmpdir, write, gitInit } from './helpers.js'

test('isGitRepo: detecta repositório', () => {
  const root = tmpdir()
  assert.equal(isGitRepo(root), false)
  write(root, 'a.txt', 'x')
  gitInit(root)
  assert.equal(isGitRepo(root), true)
})

test('outOfScopeFiles: arquivo fora do escopo é reportado', () => {
  const root = tmpdir()
  write(root, 'base.txt', 'x')
  gitInit(root)
  write(root, 'fora.txt', 'y')
  assert.deepEqual(outOfScopeFiles(root, [], []), ['fora.txt'])
})

test('outOfScopeFiles: baseline e escopo permitem o arquivo', () => {
  const root = tmpdir()
  write(root, 'base.txt', 'x')
  gitInit(root)
  write(root, 'fora.txt', 'y')
  assert.deepEqual(outOfScopeFiles(root, ['fora.txt'], []), [])
  assert.deepEqual(outOfScopeFiles(root, [], ['fora.txt']), [])
})

test('modifiedFiles: usa -uall (arquivos individuais, não diretórios colapsados)', () => {
  const root = tmpdir()
  write(root, 'base.txt', 'x')
  gitInit(root)
  write(root, 'packages/modules/foo/src/index.ts', '// novo')
  const files = modifiedFiles(root)
  assert.ok(files.includes('packages/modules/foo/src/index.ts'), JSON.stringify(files))
  assert.ok(!files.some((f) => f === 'packages' || f === 'packages/'), JSON.stringify(files))
})

test('modifiedFiles: lista untracked e modificados', () => {
  const root = tmpdir()
  write(root, 'base.txt', 'x')
  gitInit(root)
  fs.writeFileSync(path.join(root, 'base.txt'), 'xx')
  write(root, 'novo.txt', 'n')
  const files = modifiedFiles(root)
  assert.ok(files.includes('base.txt'), JSON.stringify(files))
  assert.ok(files.includes('novo.txt'), JSON.stringify(files))
})