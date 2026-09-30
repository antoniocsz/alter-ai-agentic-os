import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

export const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'harness-'))

export function write(root, rel, content) {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
  return p
}

export function gitInit(root) {
  const sh = (args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' })
  sh(['init', '-q'])
  sh(['config', 'user.email', 'harness@test'])
  sh(['config', 'user.name', 'harness'])
  sh(['add', '-A'])
  sh(['commit', '-qm', 'base'])
}

// Silencia o output do produto durante a execução de fn (async, cobrindo gaps
// async como o callback de listen do serveBoard) e restaura no finally.
// Usado para evitar bursts de stdout (ex: banners com emoji) que quebram o
// framing do canal IPC v8-serializado do `node --test` (nodejs/node#56802).
//
// Importante: o runner do node:test reporta os resultados dos testes no stdout
// do subprocesso como Buffers v8-serializados, então um no-op cego engoliria o
// reporte e os testes "sumiriam" do resultado. Por isso só strings (banners do
// produto) são engolidas; os Buffers do protocolo do runner são repassados.
export async function withSilentStdout(fn) {
  const originalWrite = process.stdout.write
  process.stdout.write = (chunk, ...rest) => {
    if (typeof chunk === 'string') return true
    return originalWrite.call(process.stdout, chunk, ...rest)
  }
  try {
    return await fn()
  } finally {
    process.stdout.write = originalWrite
  }
}