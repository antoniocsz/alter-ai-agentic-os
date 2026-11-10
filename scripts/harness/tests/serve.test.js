// Testes do `harness serve` (task 86): UM processo com kanban + scheduler das
// rotinas + webhook com token. Servidor sobe em porta efêmera (0) e encerra sem
// pendurar processo (stop gracioso, sem lock órfão do próprio pid).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { once } from 'node:events'
import {
  buildServe,
  readOrCreateWebhookToken,
  serve,
  tokensMatch,
  webhookTokenFile
} from '../src/serve.js'
import { serveBoard } from '../src/kanban.js'
import { openDb } from '../src/lib/db.js'
import { listTasks, queueDir } from '../src/lib/tasks.js'
import { tmpdir, write, withSilentStdout } from './helpers.js'

const ROUTINES = {
  routines: [
    { id: 'triagem', every: '1h', task: { title: 'Triagem de bugs recebidos' } },
    { id: 'retro-semanal', every: 'weekly@seg@09:00', task: { title: 'Retro da semana' }, dedupe: true }
  ]
}

const setupRoot = (data = ROUTINES) => {
  const root = tmpdir()
  write(root, path.join('.harness', 'routines.json'), JSON.stringify(data))
  return root
}

const tokenOf = (root) => fs.readFileSync(webhookTokenFile(root), 'utf8').trim()

function routineAudit(root) {
  const db = openDb(root)
  try {
    return {
      events: db
        .prepare("SELECT * FROM task_events WHERE event LIKE 'routine%' OR event LIKE 'webhook%' ORDER BY id")
        .all(),
      interactions: db.prepare("SELECT * FROM interactions WHERE source = 'routines' ORDER BY id").all()
    }
  } finally {
    db.close()
  }
}

/** buildServe + porta efêmera já escutando (banner do server engolido no test). */
async function liveServe(opts = {}) {
  const handles = buildServe({ port: 0, ...opts })
  await once(handles.server, 'listening')
  return handles
}

const baseOf = (handles) => `http://localhost:${handles.server.address().port}`

// Registra banners/print do produto devolvendo o texto sem quebrar o protocolo
// do runner (só strings são capturadas; Buffers do node --test passam direto).
async function withCapturedStdout(fn) {
  const lines = []
  const original = process.stdout.write
  process.stdout.write = (chunk, ...rest) => {
    if (typeof chunk === 'string') {
      lines.push(chunk)
      return true
    }
    return original.call(process.stdout, chunk, ...rest)
  }
  try {
    await fn()
    return { output: lines.join('') }
  } finally {
    process.stdout.write = original
  }
}

test('tokensMatch: igual → true; diferente/ausente → false (comparação via digest fixo)', () => {
  assert.equal(tokensMatch('abc', 'abc'), true)
  assert.equal(tokensMatch('abc', 'abd'), false)
  assert.equal(tokensMatch('abc', 'abcd'), false)
  assert.equal(tokensMatch(undefined, 'abc'), false)
  assert.equal(tokensMatch('x', ''), false)
})

test('token do webhook: crypto.randomUUID gerado na 1ª execução, persistido e reusado depois', () => {
  const root = tmpdir()
  const first = readOrCreateWebhookToken(root)
  assert.equal(first.created, true)
  assert.match(first.token, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  assert.equal(fs.readFileSync(first.file, 'utf8').trim(), first.token)
  assert.match(first.file.replace(/\\/g, '/'), /\.harness\/webhook-token$/)

  // 2ª execução (novo read) reusa o persistido — nada de token novo
  const again = readOrCreateWebhookToken(root)
  assert.equal(again.created, false)
  assert.equal(again.token, first.token)

  // arquivo vazio/corrompido é regenerado (nunca token vazio em produção)
  fs.writeFileSync(first.file, '')
  const regenerated = readOrCreateWebhookToken(root)
  assert.equal(regenerated.created, true)
  assert.notEqual(regenerated.token, first.token)
})

test('webhook happy path: POST válido dispara a rotina → 200 {criada} com task na queue', async () => {
  await withSilentStdout(async () => {
    const root = setupRoot()
    let handles
    try {
      handles = await liveServe({ root })
      const base = baseOf(handles)

      const res = await fetch(`${base}/webhook/routines/triagem?token=${tokenOf(root)}`, { method: 'POST' })
      const body = await res.json()
      assert.equal(res.status, 200, JSON.stringify(body))
      assert.equal(body.ok, true)
      assert.match(body.criada, /^\d+-triagem-de-bugs-recebidos\.md$/)
      assert.deepEqual(listTasks(queueDir(root)), [body.criada])

      // a task criada tem os mesmos defaults do `harness task`
      const file = fs.readFileSync(path.join(queueDir(root), body.criada), 'utf8')
      assert.match(file, /# Task: Triagem de bugs recebidos/)
      assert.match(file, /## Prioridade: P2/)
      assert.match(file, /## Tipo: feat/)

      // auditabilidade no banco: webhook recebido + rotina disparada + interação system
      const { events, interactions } = routineAudit(root)
      assert.ok(events.some((e) => e.task_id === 'routine:triagem' && e.event === 'webhook_received'))
      assert.ok(events.some((e) => e.task_id === body.criada && e.event === 'routine_fired'))
      assert.ok(interactions.some((i) => i.kind === 'system' && i.content.includes('webhook_received')))

      // estado do payload acompanha o disparo
      const payload = await (await fetch(`${base}/api/routines`)).json()
      const triagem = payload.routines.find((r) => r.id === 'triagem')
      assert.equal(triagem.fireCount, 1)
      assert.ok(triagem.lastRun)
      assert.ok(triagem.nextRun)
    } finally {
      await handles?.stop()
    }
  })
})

test('webhook: sem token ou token errado → 401, nada disparado, webhook_rejected no banco', async () => {
  await withSilentStdout(async () => {
    const root = setupRoot()
    let handles
    try {
      handles = await liveServe({ root })
      const base = baseOf(handles)

      const noToken = await fetch(`${base}/webhook/routines/triagem`, { method: 'POST' })
      assert.equal(noToken.status, 401)

      const badToken = await fetch(`${base}/webhook/routines/triagem?token=not-the-token`, { method: 'POST' })
      assert.equal(badToken.status, 401)
      const body = await badToken.json()
      assert.equal(body.ok, false)
      assert.match(body.error, /token/)

      // nada criado, nada contado
      assert.deepEqual(listTasks(queueDir(root)), [])
      const { events } = routineAudit(root)
      assert.ok(events.some((e) => e.task_id === 'routine:triagem' && e.event === 'webhook_rejected'))
      const payload = await (await fetch(`${base}/api/routines`)).json()
      assert.equal(payload.routines.find((r) => r.id === 'triagem').fireCount, 0)
    } finally {
      await handles?.stop()
    }
  })
})

test('webhook: rotina inexistente → 404 (rotina_error registrado); id fora do padrão → 404 sem tocar o banco', async () => {
  await withSilentStdout(async () => {
    const root = setupRoot()
    let handles
    try {
      handles = await liveServe({ root })
      const base = baseOf(handles)

      const res = await fetch(`${base}/webhook/routines/fantasma?token=${tokenOf(root)}`, { method: 'POST' })
      assert.equal(res.status, 404)
      const body = await res.json()
      assert.match(body.error, /rotina não encontrada/)

      const { events } = routineAudit(root)
      assert.ok(events.some((e) => e.task_id === 'routine:fantasma' && e.event === 'routine_error'))

      // maiúsculas/padrão estranho não casam com a rota nem gravam evento
      const weird = await fetch(`${base}/webhook/routines/BIG-UPPER?token=${tokenOf(root)}`, { method: 'POST' })
      assert.equal(weird.status, 404)
      const { interactions } = routineAudit(root)
      assert.ok(!interactions.some((i) => i.content.includes('BIG-UPPER')))
    } finally {
      await handles?.stop()
    }
  })
})

test('webhook com dedupe: 2º disparo do mesmo título → 200 {skip:dedupe}, sem arquivo novo (AC-3 via HTTP)', async () => {
  await withSilentStdout(async () => {
    const root = setupRoot()
    let handles
    try {
      handles = await liveServe({ root })
      const base = baseOf(handles)
      const url = `${base}/webhook/routines/retro-semanal?token=${tokenOf(root)}`
      const call = () => fetch(url, { method: 'POST' })

      const first = await call()
      assert.equal(first.status, 200)
      const created = await first.json()
      assert.ok(created.ok && created.criada)

      const second = await call()
      assert.equal(second.status, 200)
      const skipped = await second.json()
      assert.equal(skipped.ok, true)
      assert.equal(skipped.skip, 'dedupe')
      assert.equal(skipped.task, created.criada)
      assert.equal(listTasks(queueDir(root)).length, 1)

      // dois disparos VÁLIDOS contam (criada + skip), não dois arquivos
      const payload = await (await fetch(`${base}/api/routines`)).json()
      assert.equal(payload.routines.find((r) => r.id === 'retro-semanal').fireCount, 2)
    } finally {
      await handles?.stop()
    }
  })
})

test('GET /api/routines: payload do painel — id, title, every, nextRun, lastRun, fireCount', async () => {
  await withSilentStdout(async () => {
    const root = setupRoot()
    let handles
    try {
      handles = await liveServe({ root })
      const payload = await (await fetch(`${baseOf(handles)}/api/routines`)).json()
      assert.equal(payload.ok, true)
      assert.deepEqual(
        payload.routines.map((r) => r.id).sort(),
        ['retro-semanal', 'triagem']
      )
      for (const routine of payload.routines) {
        for (const field of ['id', 'title', 'every', 'nextRun', 'lastRun', 'fireCount']) {
          assert.ok(field in routine, `campo ${field} ausente`)
        }
      }
      const triagem = payload.routines.find((r) => r.id === 'triagem')
      assert.equal(triagem.title, 'Triagem de bugs recebidos')
      assert.equal(triagem.every, '1h')
      assert.equal(triagem.lastRun, null)
      assert.equal(triagem.fireCount, 0)
      assert.match(triagem.nextRun, /^\d{4}-\d{2}-\d{2}T/)
      const retro = payload.routines.find((r) => r.id === 'retro-semanal')
      assert.equal(retro.title, 'Retro da semana')
      assert.equal(retro.every, 'weekly@seg@09:00')
    } finally {
      await handles?.stop()
    }
  })
})

test('payload sobrevive ao restart do serve: fireCount/lastRun hidratam do banco', async () => {
  await withSilentStdout(async () => {
    const root = setupRoot()
    let second
    try {
      const first = await liveServe({ root })
      await fetch(`${baseOf(first)}/webhook/routines/triagem?token=${tokenOf(root)}`, { method: 'POST' })
      const before = await (await fetch(`${baseOf(first)}/api/routines`)).json()
      assert.equal(before.routines.find((r) => r.id === 'triagem').fireCount, 1)
      await first.stop()

      second = await liveServe({ root })
      const after = await (await fetch(`${baseOf(second)}/api/routines`)).json()
      const triagem = after.routines.find((r) => r.id === 'triagem')
      assert.equal(triagem.fireCount, 1)
      assert.ok(triagem.lastRun)
      assert.equal(after.routines.find((r) => r.id === 'retro-semanal').fireCount, 0)
    } finally {
      await second?.stop()
    }
  })
})

test('scheduler: dispara no horário com relógio injetável e re-planeja a próxima execução (AC-2)', async () => {
  await withSilentStdout(async () => {
    const root = setupRoot({
      routines: [{ id: 'tick-15m', every: '15m', task: { title: 'Checagem periódica' } }]
    })
    let now = new Date(2026, 10, 9, 12, 0, 0)
    const clock = () => now
    let handles
    try {
      handles = await liveServe({ root, tickMs: 25, clock })
      // tick de aquecimento apenas planejou: nada devido, queue vazia
      assert.deepEqual(listTasks(queueDir(root)), [])

      now = new Date(now.getTime() + 16 * 60_000) // atravessa a 1ª janela (12:15)
      handles.scheduler.tick()
      assert.equal(listTasks(queueDir(root)).length, 1)
      assert.match(listTasks(queueDir(root))[0], /^\d+-checagem-periodica\.md$/)

      const payload = await (await fetch(`${baseOf(handles)}/api/routines`)).json()
      const r = payload.routines.find((x) => x.id === 'tick-15m')
      assert.equal(r.fireCount, 1)
      assert.ok(r.lastRun)
      // re-planejado a partir do novo now: 12:16 + 15m = 12:31
      assert.equal(new Date(r.nextRun).getTime(), now.getTime() + 15 * 60_000)
    } finally {
      await handles?.stop()
    }
  })
})

test('AC-1 no serve: rotina quebrada não derruba o processo — válida segue no payload, quebrada vira 404 auditada', async () => {
  await withSilentStdout(async () => {
    const root = setupRoot({
      routines: [
        { id: 'ok', every: '15m', task: { title: 'Tarefa ok' } },
        { id: 'quebrada', every: '1x', task: { title: '' } }
      ]
    })
    let handles
    try {
      handles = await liveServe({ root })
      const base = baseOf(handles)

      assert.equal((await fetch(`${base}/api/board`)).status, 200)
      const payload = await (await fetch(`${base}/api/routines`)).json()
      assert.deepEqual(payload.routines.map((r) => r.id), ['ok'])

      // webhook da rotina quebrada: 404 com o erro de schema na mensagem
      const res = await fetch(`${base}/webhook/routines/quebrada?token=${tokenOf(root)}`, { method: 'POST' })
      assert.equal(res.status, 404)
      const body = await res.json()
      assert.match(body.error, /every "1x" inválido/)
    } finally {
      await handles?.stop()
    }
  })
})

test('serve preserva o kanban (board/canvas) e o modo kanban puro NÃO expõe as rotas de rotina', async () => {
  await withSilentStdout(async () => {
    const root = setupRoot()
    let plain
    let handles
    try {
      handles = await liveServe({ root })
      const base = baseOf(handles)
      assert.equal((await fetch(`${base}/`)).status, 200) // board
      assert.equal((await fetch(`${base}/canvas`)).status, 200) // vista Execução
      assert.equal((await fetch(`${base}/api/canvas`)).status, 200)

      plain = serveBoard({ projects: [{ name: 'A', root }], title: 't' }, 0)
      await once(plain, 'listening')
      const pbase = `http://localhost:${plain.address().port}`
      assert.equal((await fetch(`${pbase}/api/routines`)).status, 404)
      assert.equal(
        (await fetch(`${pbase}/webhook/routines/triagem?token=${tokenOf(root)}`, { method: 'POST' })).status,
        404
      )
    } finally {
      await handles?.stop()
      plain?.close()
    }
  })
})

test('shutdown gracioso: limpa timers, fecha o servidor e solta lock órfão do PRÓPRIO pid (não o alheio)', async () => {
  await withSilentStdout(async () => {
    const root = setupRoot()
    const handles = await liveServe({ root })
    const port = handles.server.address().port
    assert.equal(handles.scheduler.running, true)

    const board = await fetch(`http://localhost:${port}/api/board`)
    assert.equal(board.status, 200)

    const lockFile = path.join(root, '.harness', 'lock')
    fs.writeFileSync(
      lockFile,
      `${JSON.stringify({ pid: process.pid, token: 'self', at: new Date().toISOString() })}\n`
    )
    await handles.stop()

    assert.equal(handles.scheduler.running, false)
    assert.equal(fs.existsSync(lockFile), false) // lock do próprio processo solto
    await assert.rejects(fetch(`http://localhost:${port}/api/board`)) // servidor fechou

    // lock de OUTRO processo fica intocado; stop() é idempotente
    fs.writeFileSync(
      lockFile,
      `${JSON.stringify({ pid: 1, token: 'foreign', at: new Date().toISOString() })}\n`
    )
    await handles.stop()
    assert.equal(JSON.parse(fs.readFileSync(lockFile, 'utf8')).token, 'foreign')
  })
})

test('serve CLI: --host explícito imprime WARNING de exposição, padrão loopback fica quieto, porta inválida mostra uso — e o banner NUNCA imprime o token', async () => {
  const exposed = setupRoot()
  let exposedHandles
  try {
    const { output } = await withCapturedStdout(async () => {
      exposedHandles = serve(['--host', '0.0.0.0', '--port', '0'], { cwd: exposed, signals: false })
      await once(exposedHandles.server, 'listening')
    })
    assert.match(output, /⚠️/)
    assert.match(output, /0\.0\.0\.0/)
    assert.ok(!output.includes(readOrCreateWebhookToken(exposed).token))
    assert.match(output, /webhook-token/)
  } finally {
    await exposedHandles?.stop()
  }

  const quiet = setupRoot()
  let quietHandles
  try {
    const { output } = await withCapturedStdout(async () => {
      quietHandles = serve(['--port', '0'], { cwd: quiet, signals: false })
      await once(quietHandles.server, 'listening')
    })
    assert.doesNotMatch(output, /⚠️/)
    assert.match(output, /kanban/)
    assert.match(output, /agendada\(s\)/)
  } finally {
    await quietHandles?.stop()
  }

  assert.throws(() => serve(['--port', '70000'], { cwd: quiet, signals: false }), /porta inválida/)
  assert.throws(() => serve(['--port', 'abc'], { cwd: quiet, signals: false }), /porta inválida/)
})
