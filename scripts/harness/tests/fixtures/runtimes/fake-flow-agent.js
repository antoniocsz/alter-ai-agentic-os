#!/usr/bin/env node
// Agente falso para os testes da orquestração encadeada (task 121). Fala o stream-json do Claude.
// Papel deduzido do prompt (stdin): revisor ("Você é o REVISOR"), correção ("CORREÇÃO") ou
// implementação. Implementar/corrigir escrevem em src/a.js na worktree (cwd).
// FAKE_FLOW_DIR: pasta de controle — `verdicts` (lista separada por vírgula, consumida em ordem:
// approved | changes | none), `prompts/<n>.txt` (cada prompt recebido), `count`.
// FAKE_REVIEW_WRITE=1: o revisor altera a worktree (deve reprovar). FAKE_EXIT_ROLE=<papel>: sai com 1.
import fs from 'node:fs'
import path from 'node:path'

if (process.argv.includes('--version')) {
  process.stdout.write('fake-flow 1.0\n')
  process.exit(0)
}

let stdin = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => (stdin += c))
process.stdin.on('end', () => {
  const dir = process.env.FAKE_FLOW_DIR
  const role = /Você é o JUIZ/.test(stdin) ? 'judge' : /Você é o REVISOR/.test(stdin) ? 'review' : /CORREÇÃO/.test(stdin) ? 'fix' : 'implement'
  const argv = process.argv.slice(2).join(' ')
  let n = 1
  if (dir) {
    const countFile = path.join(dir, 'count')
    n = (fs.existsSync(countFile) ? Number(fs.readFileSync(countFile, 'utf8')) : 0) + 1
    fs.writeFileSync(countFile, String(n))
    fs.mkdirSync(path.join(dir, 'prompts'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'prompts', `${n}-${role}.txt`), stdin)
  }
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\n')
  out({ type: 'system', subtype: 'init', session_id: `sess-flow-${n}`, model: 'fake' })
  if (process.env.FAKE_EXIT_ROLE === role) {
    process.stderr.write(`falha simulada em ${role}`)
    process.exitCode = 1
    return
  }
  // Execução competitiva (task 124): comportamento por modelo (--model no argv).
  if (process.env.FAKE_FAIL_MODEL && argv.includes(process.env.FAKE_FAIL_MODEL)) {
    process.stderr.write('modelo falhou')
    process.exitCode = 1
    return
  }
  let text
  if (role === 'judge') {
    if (process.env.FAKE_JUDGE_WRITE) fs.writeFileSync(path.join(process.cwd(), 'juiz.txt'), 'não devia')
    const pick = process.env.FAKE_JUDGE_PICK ?? 'claude'
    text = `Comparei as candidatas. A melhor cobre os critérios.\n\nVENCEDOR: ${pick}`
    out({ type: 'assistant', message: { id: `m${n}`, role: 'assistant', content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 5 } } })
    out({ type: 'result', subtype: 'success', is_error: false, result: text, session_id: `sess-flow-${n}`, usage: { input_tokens: 10, output_tokens: 5 } })
    return
  }
  if (role === 'review') {
    if (process.env.FAKE_REVIEW_WRITE) fs.writeFileSync(path.join(process.cwd(), 'revisor.txt'), 'não devia')
    const list = dir && fs.existsSync(path.join(dir, 'verdicts')) ? fs.readFileSync(path.join(dir, 'verdicts'), 'utf8').trim().split(',') : ['approved']
    const verdict = list.shift() ?? 'approved'
    if (dir) fs.writeFileSync(path.join(dir, 'verdicts'), list.join(','))
    text =
      verdict === 'approved'
        ? 'Revisei o diff. Tudo certo.\n\n**VEREDITO: APROVADO**'
        : verdict === 'none'
          ? 'Revisei mas esqueci o veredito.'
          : 'Encontrei problemas.\n\nVEREDITO: MUDANÇAS\n1. src/a.js: falta tratar entrada vazia\n2. src/a.js: sem teste'
  } else {
    fs.mkdirSync(path.join(process.cwd(), 'src'), { recursive: true })
    const file = path.join(process.cwd(), 'src', 'a.js')
    const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
    fs.writeFileSync(file, prev + `// ${role} ${n}\n`)
    const model = (argv.match(/--model (\S+)/) ?? [])[1]
    if (model) fs.appendFileSync(file, `// modelo ${model}\n`)
    if (process.env.FAKE_OUTSCOPE_MODEL && argv.includes(process.env.FAKE_OUTSCOPE_MODEL)) fs.writeFileSync(path.join(process.cwd(), 'fora.js'), 'x\n')
    text = `${role === 'fix' ? 'Corrigi' : 'Implementei'} src/a.js.`
  }
  out({ type: 'assistant', message: { id: `m${n}`, role: 'assistant', content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 5 } } })
  out({ type: 'result', subtype: 'success', is_error: false, result: text, session_id: `sess-flow-${n}`, total_cost_usd: 0.001, usage: { input_tokens: 10, output_tokens: 5 } })
})
