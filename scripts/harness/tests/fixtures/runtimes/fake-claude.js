#!/usr/bin/env node
// Executável falso do Claude Code para os testes do runner (task 94).
// Lê o prompt do stdin, registra argv/stdin/cwd em FAKE_LOG (se definido) e
// reproduz a transcrição JSONL em FAKE_TRANSCRIPT (padrão: claude-success.jsonl).
// FAKE_HANG=1 → emite a 1ª linha e fica vivo até ser morto (teste de interrupção).
// FAKE_EXIT / FAKE_STDERR → código de saída e stderr.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const transcript = process.env.FAKE_TRANSCRIPT ?? path.join(here, 'claude-success.jsonl')

let stdin = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => (stdin += c))
process.stdin.on('end', () => {
  if (process.env.FAKE_LOG) {
    fs.writeFileSync(process.env.FAKE_LOG, JSON.stringify({ argv: process.argv.slice(2), stdin, cwd: process.cwd(), pid: process.pid, pwd: process.env.PWD ?? null }))
  }
  const lines = fs.readFileSync(transcript, 'utf8').split(/\r?\n/).filter(Boolean)
  if (process.env.FAKE_HANG) {
    process.stdout.write(lines[0] + '\n')
    setInterval(() => {}, 1000)
    return
  }
  for (const l of lines) process.stdout.write(l + '\n')
  if (process.env.FAKE_STDERR) process.stderr.write(process.env.FAKE_STDERR)
  process.exitCode = Number(process.env.FAKE_EXIT ?? 0)
})
