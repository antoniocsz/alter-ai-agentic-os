import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { render, copyDir, renderTemplateFile } from '../src/lib/templates.js'
import { tmpdir, write } from './helpers.js'

test('render: substitui placeholders e ignora desconhecidos', () => {
  assert.equal(render('oi {{NAME}}', { NAME: 'x' }), 'oi x')
  assert.equal(render('{{A}}{{UNKNOWN}}', { A: '1' }), '1')
  assert.equal(render('sem placeholder', {}), 'sem placeholder')
})

test('copyDir: copia árvore e renderAll substitui placeholders', () => {
  const src = tmpdir()
  const dest = tmpdir()
  write(src, 'a.txt', '{{NAME}}')
  write(src, 'sub/b.txt', '{{NAME}}')
  copyDir(src, dest, { vars: { NAME: 'acme' }, renderAll: true })
  assert.equal(fs.readFileSync(path.join(dest, 'a.txt'), 'utf8'), 'acme')
  assert.equal(fs.readFileSync(path.join(dest, 'sub', 'b.txt'), 'utf8'), 'acme')
})

test('copyDir sem renderAll copia o conteúdo literal', () => {
  const src = tmpdir()
  const dest = tmpdir()
  write(src, 'a.txt', '{{NAME}}')
  copyDir(src, dest, { vars: { NAME: 'acme' } })
  assert.equal(fs.readFileSync(path.join(dest, 'a.txt'), 'utf8'), '{{NAME}}')
})

test('copyDir: fonte inexistente não faz nada', () => {
  const dest = tmpdir()
  copyDir(path.join(tmpdir(), 'nao-existe'), dest)
  assert.deepEqual(fs.readdirSync(dest), [])
})

test('renderTemplateFile: renderiza no destino', () => {
  const src = tmpdir()
  const dest = tmpdir()
  write(src, 't.txt', 'ok {{NAME}}')
  renderTemplateFile(path.join(src, 't.txt'), path.join(dest, 'out.txt'), { NAME: 'z' })
  assert.equal(fs.readFileSync(path.join(dest, 'out.txt'), 'utf8'), 'ok z')
})