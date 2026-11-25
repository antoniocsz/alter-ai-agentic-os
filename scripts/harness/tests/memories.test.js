// Memória em níveis (feature memoria-em-niveis, task 118): esquema, níveis, dedupe, TTL,
// aprovação, versões, busca com ranking e banco global isolado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { openDb } from '../src/lib/db.js'
import { validateConfig } from '../src/lib/config.js'
import {
  addMemory,
  getMemory,
  listMemories,
  memoryChain,
  normalizeText,
  openGlobalDb,
  globalDbFile,
  parseTtl,
  rankForTask,
  searchMemories,
  selectWithinBudget,
  setMemoryStatus,
  updateMemory,
  touchMemories
} from '../src/lib/memories.js'
import { tmpdir } from './helpers.js'

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/harness.js')

test('memories: níveis, escopo e tipos validados; humano entra active, agente proposed; agente não escreve no global', () => {
  const db = openDb(tmpdir())
  try {
    const h = addMemory(db, { content: 'O banco é SQLite via node:sqlite', level: 'project', kind: 'fact', tags: 'db,sqlite' })
    assert.equal(h.created, true)
    assert.deepEqual([h.memory.status, h.memory.source, h.memory.tags], ['active', 'human', ['db', 'sqlite']])

    const a = addMemory(db, { content: 'Testes do runner precisam de fake no PATH', level: 'task', scope: '07-x.md', kind: 'discovery', source: 'agent', runId: 'run-07-1' })
    assert.deepEqual([a.memory.status, a.memory.source, a.memory.run_id], ['proposed', 'agent', 'run-07-1'])

    assert.throws(() => addMemory(db, { content: 'x', level: 'nivel' }), /nível inválido/)
    assert.throws(() => addMemory(db, { content: 'x', level: 'agent' }), /exige --scope/)
    assert.throws(() => addMemory(db, { content: 'x', level: 'project', scope: 'a' }), /não tem escopo/)
    assert.throws(() => addMemory(db, { content: 'x', level: 'project', kind: 'palpite' }), /tipo inválido/)
    assert.throws(() => addMemory(db, { content: 'x', level: 'project', confidence: 2 }), /confiança/)
    assert.throws(() => addMemory(db, { content: 'x', level: 'project', tags: 'a b' }), /tag inválida/)
    assert.throws(() => addMemory(db, { content: 'x', level: 'global', source: 'agent' }), /agentes não escrevem na memória global/)
    assert.throws(() => addMemory(db, { content: '   ', level: 'project' }), /uso: harness memory add/)
  } finally {
    db.close()
  }
})

test('memories: dedupe por texto normalizado, humano promove proposta, TTL padrão e explícito, segredos redigidos', () => {
  const db = openDb(tmpdir())
  const now = new Date('2026-11-24T12:00:00Z')
  try {
    const first = addMemory(db, { content: 'Usar pnpm no CI', level: 'project', source: 'agent' }, { now })
    const again = addMemory(db, { content: '  usar PNPM no ci!! ', level: 'project' }, { now })
    assert.equal(again.created, false)
    assert.equal(again.memory.id, first.memory.id)
    assert.equal(again.memory.status, 'active', 'duplicata do humano aprova a proposta')
    assert.equal(addMemory(db, { content: 'Usar pnpm no CI', level: 'knowledge' }).created, true, 'outro nível não é duplicata')

    const s = addMemory(db, { content: 'sessão: build quebrado', level: 'session', scope: 'run-1' }, { now })
    assert.equal(s.memory.expires_at, '2026-12-08T12:00:00.000Z', 'sessão expira em 14 dias')
    const o = addMemory(db, { content: 'CI lento hoje', level: 'project', kind: 'observation' }, { now })
    assert.equal(o.memory.expires_at, '2026-12-24T12:00:00.000Z', 'observação expira em 30 dias')
    const t = addMemory(db, { content: 'janela de deploy aberta', level: 'project', ttl: '12h' }, { now })
    assert.equal(t.memory.expires_at, '2026-11-25T00:00:00.000Z')
    assert.throws(() => parseTtl('0d'), /ttl inválido/)
    assert.equal(parseTtl('2d'), 2 * 86_400_000)

    const fake = ['ghp', 'abcdefghijklmnopqrstuvwxyz0123456789'].join('_') // montado em runtime: o gate secrets lê o fonte
    const secret = addMemory(db, { content: `token do staging: ${fake}`, level: 'project' })
    assert.ok(!secret.memory.content.includes(fake), 'segredo redigido')
    assert.equal(normalizeText('Decisão: Autenticação JWT!'), 'decisao autenticacao jwt')
  } finally {
    db.close()
  }
})

test('memories: list/search com filtros e ranking; expiradas fora por padrão; aviso de parecidas', () => {
  const db = openDb(tmpdir())
  try {
    const old = new Date(Date.now() - 40 * 86_400_000)
    addMemory(db, { content: 'Autenticação usa JWT com refresh token rotativo', level: 'knowledge', kind: 'decision', tags: 'auth' })
    addMemory(db, { content: 'O endpoint de login responde em 200ms', level: 'project' })
    addMemory(db, { content: 'Autenticacao provisória no ambiente de testes', level: 'project', kind: 'observation' }, { now: old })
    const similar = addMemory(db, { content: 'Autenticação do painel usa sessão em cookie', level: 'knowledge', kind: 'decision' })
    assert.ok(similar.similar.some((m) => /JWT/.test(m.content)), 'aponta decisão ativa parecida no mesmo nível')

    const found = searchMemories(db, 'autenticacao')
    assert.ok(found.length >= 2)
    assert.ok(found.every((m) => /utentica/i.test(m.content)))
    assert.ok(!found.some((m) => /provisória/.test(m.content)), 'observação expirada fica fora')
    assert.ok(searchMemories(db, 'autenticacao', { all: true }).some((m) => /provisória/.test(m.content)), '--all inclui expiradas')
    assert.deepEqual(searchMemories(db, 'autenticacao', { level: 'project' }), [])
    assert.ok(found[0].score >= found.at(-1).score)

    assert.equal(listMemories(db).length, 3)
    assert.equal(listMemories(db, { all: true }).length, 4)
    assert.equal(listMemories(db, { level: 'knowledge' }).length, 2)
    assert.equal(listMemories(db, { all: true }).find((m) => /provisória/.test(m.content)).expired, true)
  } finally {
    db.close()
  }
})

test('memories: approve/reject/outdate e update versionado com cadeia', () => {
  const db = openDb(tmpdir())
  try {
    const p = addMemory(db, { content: 'Proposta do agente', level: 'project', source: 'agent' }).memory
    assert.equal(setMemoryStatus(db, p.id, 'active').status, 'active')
    assert.throws(() => setMemoryStatus(db, p.id, 'rejected'), /só memórias propostas podem ser rejeitadas/)
    const q = addMemory(db, { content: 'Outra proposta', level: 'project', source: 'agent' }).memory
    assert.equal(setMemoryStatus(db, q.id, 'rejected').status, 'rejected')
    assert.throws(() => setMemoryStatus(db, q.id, 'active'), /só memórias propostas podem ser aprovadas/)
    assert.throws(() => setMemoryStatus(db, 999, 'active'), /não encontrada/)

    const v1 = addMemory(db, { content: 'Porta padrão do serve é 4310', level: 'project', tags: 'serve' }).memory
    const v2 = updateMemory(db, v1.id, 'Porta padrão do serve é 4310 (0 = efêmera)')
    assert.deepEqual([v2.version, v2.supersedes, v2.tags, v2.status], [2, v1.id, ['serve'], 'active'])
    assert.deepEqual([getMemory(db, v1.id).status, getMemory(db, v1.id).superseded_by], ['outdated', v2.id])
    const v3 = updateMemory(db, v2.id, 'Porta padrão 4310; --port 0 escolhe uma livre')
    assert.deepEqual(memoryChain(db, v1.id).map((m) => [m.id, m.version, m.status]), [[v1.id, 1, 'outdated'], [v2.id, 2, 'outdated'], [v3.id, 3, 'active']])
    assert.throws(() => updateMemory(db, v1.id, 'x'), /outdated — a versão atual é/)
    assert.throws(() => updateMemory(db, v3.id, 'Porta padrão 4310; --port 0 escolhe uma livre'), /igual/)
    assert.deepEqual(searchMemories(db, 'porta serve').map((m) => m.id), [v3.id], 'só a versão atual aparece')

    assert.equal(setMemoryStatus(db, v3.id, 'outdated').status, 'outdated')
    assert.deepEqual(searchMemories(db, 'porta serve'), [])
  } finally {
    db.close()
  }
})

test('memories: ranking para a task (níveis, agente, global autorizado) e seleção por orçamento', () => {
  const home = tmpdir()
  const env = { HARNESS_HOME: home }
  const db = openDb(tmpdir())
  const gdb = openGlobalDb(env)
  try {
    assert.equal(globalDbFile(env), path.join(home, 'memory.db'))
    const own = addMemory(db, { content: 'Escopo da 07 inclui só src/a.js', level: 'task', scope: '07-x.md' }).memory
    addMemory(db, { content: 'Memória de outra task sobre runner', level: 'task', scope: '08-y.md' })
    const ag = addMemory(db, { content: 'Backend sempre roda pnpm test antes do finish', level: 'agent', scope: 'backend' }).memory
    addMemory(db, { content: 'Frontend usa tema escuro', level: 'agent', scope: 'frontend' })
    const kn = addMemory(db, { content: 'Runner lê stdout por linha (stream-json)', level: 'knowledge', kind: 'decision' }).memory
    addMemory(db, { content: 'Nada a ver com a consulta', level: 'project' })
    addMemory(db, { content: 'Runner proposto pelo agente', level: 'project', source: 'agent' })
    const g = addMemory(gdb, { content: 'Prefiro commits pequenos no runner', level: 'global' }).memory

    const ranked = rankForTask(db, { taskId: '07-x.md', agent: 'backend', query: 'runner stdout' })
    const ids = ranked.map((m) => m.id)
    assert.ok(ids.includes(own.id) && ids.includes(ag.id) && ids.includes(kn.id))
    assert.ok(!ranked.some((m) => /outra task|tema escuro|Nada a ver|proposto/.test(m.content)), 'só a própria task/agente, relevantes e ativas')
    assert.ok(!ranked.some((m) => m.origin === 'global'), 'global só quando autorizado')

    const withGlobal = rankForTask(db, { taskId: '07-x.md', agent: 'backend', query: 'runner stdout', globalDb: gdb })
    assert.equal(withGlobal.find((m) => m.origin === 'global')?.id, g.id)

    const picked = selectWithinBudget(withGlobal, 20)
    assert.ok(picked.items.length < withGlobal.length && picked.omitted > 0, 'orçamento corta')
    assert.ok(picked.tokens <= 20)

    touchMemories(db, [kn.id])
    assert.equal(getMemory(db, kn.id).access_count, 1)
    assert.ok(getMemory(db, kn.id).last_access_at)
  } finally {
    db.close()
    gdb.close()
  }
})

test('memories: config memory.global/budget validados', () => {
  assert.deepEqual(validateConfig({ memory: { global: true, budget: 1200 } }).filter((e) => e.startsWith('memory')), [])
  const errs = validateConfig({ memory: { global: 'sim', budget: -1, outro: 1 } }).filter((e) => e.startsWith('memory'))
  assert.equal(errs.length, 3)
})

test('harness memory (CLI): add, list, search, show, approve, update, outdate e global isolado', () => {
  const root = tmpdir()
  const home = tmpdir()
  const env = { ...process.env, HARNESS_HOME: home }
  const cli = (...args) => spawnSync(process.execPath, [BIN, 'memory', ...args], { cwd: root, encoding: 'utf8', env })

  const add = cli('add', 'Deploy só via pipeline de CI', '--level', 'knowledge', '--kind', 'decision', '--tags', 'deploy,ci')
  assert.equal(add.status, 0, add.stderr)
  assert.match(add.stdout, /memória #1 gravada · conhecimento · decisão/)
  assert.match(cli('add', 'deploy só via pipeline de ci', '--level', 'knowledge').stdout, /já existia: #1/)

  const listed = JSON.parse(cli('list', '--json').stdout)
  assert.deepEqual(listed.map((m) => [m.id, m.level, m.kind, m.tags]), [[1, 'knowledge', 'decision', ['deploy', 'ci']]])
  assert.match(cli('search', 'pipeline').stdout, /#1 \[conhecimento · decisão\] Deploy só via pipeline de CI #deploy #ci/)

  const upd = cli('update', '1', 'Deploy só via pipeline de CI, com aprovação manual em produção')
  assert.equal(upd.status, 0, upd.stderr)
  assert.match(upd.stdout, /nova versão #2 \(v2\)/)
  assert.match(cli('show', '2').stdout, /versões:[\s\S]*v1 #1 \[outdated\][\s\S]*v2 #2 \[active\]/)
  assert.equal(cli('outdate', '2').status, 0)
  assert.match(cli('list').stdout, /nenhuma memória/)

  const bad = cli('add', 'x', '--level', 'agent')
  assert.notEqual(bad.status, 0)
  assert.match(bad.stderr, /exige --scope/)
  assert.notEqual(cli('approve', 'abc').status, 0)

  const g = cli('add', 'Prefiro respostas em português', '--level', 'global')
  assert.equal(g.status, 0, g.stderr)
  assert.ok(fs.existsSync(path.join(home, 'memory.db')), 'global fica no HARNESS_HOME')
  assert.match(cli('list', '--global').stdout, /#1 \[global · fato\] Prefiro respostas em português/)
  assert.doesNotMatch(cli('list', '--all').stdout, /português/, 'global não aparece no banco do projeto')
})
