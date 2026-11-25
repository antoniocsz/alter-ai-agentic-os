#!/usr/bin/env node
// Agente falso da conversa contínua (task 139). Fala o stream-json do Claude.
// Sessão: a de `--resume <id>` quando presente, senão `sess-chat-<n>`. Grava argv/stdin em
// FAKE_CHAT_DIR/<n>.json e acrescenta a última linha do prompt em chat.txt na worktree (cwd).
import fs from 'node:fs'
import path from 'node:path'

if (process.argv.includes('--version')) {
  process.stdout.write('fake-chat 1.0\n')
  process.exit(0)
}

let stdin = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => (stdin += c))
process.stdin.on('end', () => {
  const argv = process.argv.slice(2)
  const dir = process.env.FAKE_CHAT_DIR
  let n = 1
  if (dir) {
    const countFile = path.join(dir, 'count')
    n = (fs.existsSync(countFile) ? Number(fs.readFileSync(countFile, 'utf8')) : 0) + 1
    fs.writeFileSync(countFile, String(n))
    fs.writeFileSync(path.join(dir, `${n}.json`), JSON.stringify({ argv, stdin }))
  }
  const i = argv.indexOf('--resume')
  const session = i >= 0 ? argv[i + 1] : `sess-chat-${n}`
  const last = stdin.trim().split('\n').at(-1)
  fs.mkdirSync(path.join(process.cwd(), 'src'), { recursive: true })
  fs.appendFileSync(path.join(process.cwd(), 'src', 'a.js'), `// ${last}\n`)
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\n')
  const text = `eco: ${last}`
  out({ type: 'system', subtype: 'init', session_id: session, model: 'fake' })
  out({ type: 'assistant', message: { id: `m${n}`, role: 'assistant', content: [{ type: 'text', text }, { type: 'tool_use', id: `t${n}`, name: 'Edit', input: { file_path: 'src/a.js' } }], usage: { input_tokens: 10, output_tokens: 5 } } })
  out({ type: 'result', subtype: 'success', is_error: false, result: text, session_id: session, usage: { input_tokens: 10, output_tokens: 5 }, total_cost_usd: 0.01 })
})
