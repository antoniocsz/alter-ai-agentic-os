import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { init } from '../src/init.js'
import {
  startTask,
  finishTask,
  commitTaskId,
  filesAttributedToOtherTasks
} from '../src/lib/pipeline.js'
import { parseTask, doneDir } from '../src/lib/tasks.js'
import { startWorktree, finishWorktree } from '../src/lib/worktree.js'
import { tmpdir, write, gitInit } from './helpers.js'

const commit = (root, args) =>
  execFileSync('git', args, { cwd: root, stdio: 'ignore' })

const revParse = (root) =>
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()

// Task com DoR completa (passa no `harness start` e no `worktree start`).
const taskMd = (slug, scopeFile) => `# Task: ${slug}
## Agente: \`backend\`
## Módulo: —
## Feature: —
## Escopo (arquivos que esta task vai tocar):
- \`${scopeFile}\`
## Depende de: [ ] —
## Contexto para ler: —
## Skills a carregar: —
## O que já existe: —
## O que criar: —
## Especificação: —
## Critério de conclusão:
- [ ] ok
## Complexidade: baixa
`

const queueTask = (root, name, scopeFile) =>
  write(root, `tasks/queue/${name}.md`, taskMd(name, scopeFile))

test('parseTask: bullet anotado "`path` (NOVO)" parseia o path; legado sem crases igual', () => {
  const root = tmpdir()
  const f = write(
    root,
    'q/01-anotado.md',
    [
      '# Task: Anotado',
      '## Escopo:',
      '- `src/anotado.ts` (NOVO)',
      '- `src/plano.ts`',
      '- src/legado.ts',
      '- [ ] `src/checkbox.ts`',
      '- "src/presente.ts"',
      '- [PRIMEIRO] `src/prefixo.ts`',
      '- `src/multi.ts` e `src/outro.ts`',
      '-   `src/espacos.ts`   (NOVO)'
    ].join('\n') + '\n'
  )
  const t = parseTask(f)
  // O path vence entre crases; anotações depois (ou antes) do path são ignoradas.
  // Sem crases, o bloco inteiro do bullet é o path — comportamento legado igual.
  assert.deepEqual(t.scope, [
    'src/anotado.ts',
    'src/plano.ts',
    'src/legado.ts',
    'src/checkbox.ts',
    'src/presente.ts',
    'src/prefixo.ts',
    'src/multi.ts',
    'src/espacos.ts'
  ])
})

test('commitTaskId: extrai o id do squash de task (qualquer tipo, com ou sem !)', () => {
  assert.equal(commitTaskId('feat(task-86): ajustar serve'), '86')
  assert.equal(commitTaskId('fix!(task-3): urgente'), '3')
  assert.equal(commitTaskId('feat(task-86)!: quebra'), '86')
  assert.equal(commitTaskId('chore(task/86-arquivos): trabalho da task'), null)
  assert.equal(commitTaskId('docs(planning): task 91'), null)
  assert.equal(commitTaskId('merge branch task/86'), null)
  assert.equal(commitTaskId(null), null)
})

test('filesAttributedToOtherTasks: último commit que tocou decide; fail-closed', () => {
  const root = tmpdir()
  write(root, '.gitignore', '.harness/\n')
  gitInit(root)
  const base = revParse(root)

  write(root, 'src/a.js', 'a\n')
  commit(root, ['add', '-A'])
  commit(root, ['commit', '-qm', 'feat(task-7): toca a'])
  write(root, 'src/w.js', 'w\n')
  commit(root, ['add', '-A'])
  commit(root, ['commit', '-qm', 'docs(planning): sem task'])
  write(root, 'src/c.js', 'c\n')
  commit(root, ['add', '-A'])
  commit(root, ['commit', '-qm', 'fix(task-8): toca c'])

  const afterThree = revParse(root)
  // Range não informa quem é "eu" (ownId ausente) → nada liberado.
  assert.deepEqual(filesAttributedToOtherTasks(root, base, afterThree, null), new Set())
  // Para a task 7: só o que foi tocado por ÚLTIMO por outra task (8) é liberado.
  assert.deepEqual(
    [...filesAttributedToOtherTasks(root, base, afterThree, '7')],
    ['src/c.js']
  )
  // Para a task 8: a.js (task-7) é alheio; c.js é seu; w.js não é de task nenhuma.
  assert.deepEqual(
    [...filesAttributedToOtherTasks(root, base, afterThree, '8')].sort(),
    ['src/a.js']
  )

  // A task 7 volta a tocar c.js: o último toque passa a ser dela para todo mundo.
  write(root, 'src/c.js', 'c2\n')
  commit(root, ['add', '-A'])
  commit(root, ['commit', '-qm', 'docs(task-7): c de novo'])
  const head = revParse(root)
  assert.deepEqual(filesAttributedToOtherTasks(root, base, head, '7'), new Set())
  assert.deepEqual(
    [...filesAttributedToOtherTasks(root, base, head, '8')].sort(),
    ['src/a.js', 'src/c.js']
  )

  // Fail-closed: range vazio (nada no intervalo) → sem liberação.
  assert.deepEqual(filesAttributedToOtherTasks(root, base, base, '7'), new Set())
  // Fail-closed: git reclama do range inválido → sem liberação.
  assert.deepEqual(filesAttributedToOtherTasks(root, 'sem-esse-ref', head, '7'), new Set())
})

test('finish: merge intercalado (squash "`feat(task-<id>)` de outra task) não reprova no escopo', () => {
  const root = tmpdir()
  write(root, '.gitignore', '.harness/\n')
  write(root, 'README.md', '# ok\n')
  gitInit(root)
  queueTask(root, '01-altera-a', 'src/a.js')
  queueTask(root, '02-altera-b', 'src/b.js')
  assert.equal(startTask(root, '01').ok, true)
  assert.equal(startTask(root, '02').ok, true)

  // Task A integra (squash da worktree dela) e conclui.
  write(root, 'src/a.js', '// task a\n')
  commit(root, ['add', '-A'])
  commit(root, ['commit', '-qm', 'feat(task-01): altera a'])
  assert.ok(finishTask(root, '01').ok)

  // Task B integra depois — o range dela (startHead → HEAD) contém src/a.js,
  // que só entrou via squash da task A (A já está em done/: o escopo dela não
  // alarga o finish de B). Sem atribuição por commit, B reprovaria src/a.js.
  write(root, 'src/b.js', '// task b\n')
  commit(root, ['add', '-A'])
  commit(root, ['commit', '-qm', 'feat(task-02): altera b'])
  const r = finishTask(root, '02')
  assert.equal(r.ok, true)
  assert.ok(fs.existsSync(path.join(doneDir(root), '02-altera-b.md')))
})

test('finish: arquivo realmente fora do escopo continua bloqueando (dirty não é atribuído)', () => {
  const root = tmpdir()
  write(root, '.gitignore', '.harness/\n')
  write(root, 'README.md', '# ok\n')
  gitInit(root)
  queueTask(root, '03-altera-a', 'src/a.js')
  queueTask(root, '04-altera-b', 'src/b.js')
  assert.equal(startTask(root, '03').ok, true)
  assert.equal(startTask(root, '04').ok, true)

  write(root, 'src/a.js', '// task a\n')
  commit(root, ['add', '-A'])
  commit(root, ['commit', '-qm', 'fix(task-03): altera a'])
  assert.ok(finishTask(root, '03').ok)

  // B toca um arquivo que não declarou (nem é de qualquer outra task).
  write(root, 'src/c.js', '// fora\n')
  let r = finishTask(root, '04')
  assert.equal(r.ok, false)
  assert.match(r.error, /fora do escopo declarado/)
  assert.ok(r.out.includes('src/c.js'))

  // B toca o arquivo DE outra task (dirty, sem commit): a atribuição cobre o
  // que outra task COMMITOU — o estado sujo é o delta de B e segue bloqueando.
  write(root, 'src/a.js', '// invasão do b\n')
  r = finishTask(root, '04')
  assert.equal(r.ok, false)
  assert.match(r.error, /fora do escopo/)
  assert.ok(r.out.includes('src/a.js'))
  assert.ok(!fs.existsSync(path.join(doneDir(root), '04-altera-b.md')))
})

test('worktree: merge intercalado de outra task não reprova o escopo da atual', async () => {
  const root = path.join(tmpdir(), 'wt-intercalado')
  await init([root, '--profile', 'script', '--git'])
  fs.mkdirSync(path.join(root, 'tasks', 'queue'), { recursive: true })
  fs.writeFileSync(path.join(root, 'tasks', 'queue', '01-altera-a.md'), taskMd('altera-a', 'src/a.js'))
  fs.writeFileSync(path.join(root, 'tasks', 'queue', '02-altera-b.md'), taskMd('altera-b', 'src/b.js'))
  assert.equal(startTask(root, '01').ok, true)
  assert.equal(startTask(root, '02').ok, true)

  const wa = startWorktree(root, '01')
  const wb = startWorktree(root, '02')

  // A integra primeiro: squash dela entra na base.
  fs.mkdirSync(path.join(wa.dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(wa.dir, 'src', 'a.js'), '// a\n')
  const ra = finishWorktree(root, '01', { handoff: 'a ok' })
  assert.equal(ra.finished.ok, true)

  // B integra depois — o rebase põe a branch de B por cima do merge de A; o
  // delta visível (base..HEAD pós-rebase) é exatamente o de B. Antes do fix,
  // o diff pré-rebase dava o drift de A como "fora do escopo".
  fs.mkdirSync(path.join(wb.dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(wb.dir, 'src', 'b.js'), '// b\n')
  const rb = finishWorktree(root, '02', { handoff: 'b ok' })
  assert.equal(rb.finished.ok, true)

  assert.ok(fs.existsSync(path.join(root, 'tasks', 'done', '01-altera-a.md')))
  assert.ok(fs.existsSync(path.join(root, 'tasks', 'done', '02-altera-b.md')))
  assert.match(fs.readFileSync(path.join(root, 'src', 'a.js'), 'utf8'), /\/\/ a\b/)
  assert.match(fs.readFileSync(path.join(root, 'src', 'b.js'), 'utf8'), /\/\/ b\b/)
})
