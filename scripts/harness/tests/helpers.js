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