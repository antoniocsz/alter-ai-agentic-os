// Coordenador de tarefas (feature coordenador-de-tarefas, task 137): um agente coordenador lê a
// spec/plan da feature e propõe a decomposição em tasks (escopo, dependências, ACs, agente); o
// harness valida (escopos sobrepostos só com dependência, ciclos, ACs da spec), o humano aprova e
// o harness cria as tasks na queue e executa em ondas (as que têm dependências concluídas).
// Estado em `plans`. O coordenador só lê — quem escreve arquivos é o harness.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { runTool } from './runner.js'
import { worktreeSignature } from './flows.js'
import { queueDir, activeDir, doneDir, listTasks, norm } from './tasks.js'
import { createTaskFile } from '../task.js'
export { ensurePlanSchema } from './plans-schema.js'

export const PLAN_STATUSES = ['proposed', 'approved', 'rejected']
export const MAX_TASKS = 12
const BLOCK_RE = /---\s*PLANO\s*---\s*\n([\s\S]*?)\n\s*---\s*FIM\s*---/i
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

export class PlanError extends Error {}

const nowIso = () => new Date().toISOString()

function stamp(d = new Date()) {
  return d.toISOString().replace(/[-:TZ.]/g, '').slice(0, 17)
}

const parseJson = (s, dflt) => {
  try {
    return s ? JSON.parse(s) : dflt
  } catch {
    return dflt
  }
}

function planOut(row) {
  if (!row) return null
  const { plan_json, tasks_json, warnings_json, ...rest } = row
  return { ...rest, plan: parseJson(plan_json, { tasks: [] }), tasks: parseJson(tasks_json, {}), warnings: parseJson(warnings_json, []) }
}

export function getPlan(db, id) {
  return planOut(db.prepare('SELECT * FROM plans WHERE id = ?').get(id))
}

export function listPlans(db, { feature = null, limit = 30 } = {}) {
  const rows = feature
    ? db.prepare('SELECT * FROM plans WHERE feature = ? ORDER BY created_at DESC LIMIT ?').all(feature, limit)
    : db.prepare('SELECT * FROM plans ORDER BY created_at DESC LIMIT ?').all(limit)
  return rows.map(planOut)
}

// ---------- contexto para o coordenador ----------

function readIf(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

/** ACs declarados na spec (`AC-1`, `AC-2`…). */
export function specAcs(specText) {
  return [...new Set([...String(specText ?? '').matchAll(/\bAC-(\d+)\b/g)].map((m) => `AC-${m[1]}`))]
}

function repoFiles(root, max = 400) {
  try {
    const out = execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 })
    const files = out.split('\n').filter((f) => f && !/^(tasks|context\/sessions)\//.test(f))
    return files.length > max ? [...files.slice(0, max), `… (+${files.length - max} arquivos)`] : files
  } catch {
    return []
  }
}

function existingTasks(root, feature) {
  const out = []
  for (const [state, dir] of [['queue', queueDir(root)], ['active', activeDir(root)], ['done', doneDir(root)]]) {
    for (const name of listTasks(dir)) {
      const text = readIf(path.join(dir, name)) ?? ''
      if (new RegExp(`##\\s*Feature:\\s*${feature}\\b`).test(text)) out.push(`- ${name} (${state})`)
    }
  }
  return out
}

export function featureFiles(root, feature) {
  if (!SLUG_RE.test(String(feature ?? ''))) throw new PlanError(`feature inválida: ${feature}`)
  const dir = path.join(root, 'context', 'features', feature)
  const spec = readIf(path.join(dir, 'spec.md'))
  if (!spec) throw new PlanError(`feature sem spec: context/features/${feature}/spec.md — rode: harness feature ${feature}`)
  return { spec, plan: readIf(path.join(dir, 'plan.md')) }
}

export function buildPlanPrompt(root, feature, { maxTasks = 8 } = {}) {
  const { spec, plan } = featureFiles(root, feature)
  const modulesDir = path.join(root, 'context', 'modules')
  const modules = fs.existsSync(modulesDir) ? fs.readdirSync(modulesDir).filter((m) => SLUG_RE.test(m)) : []
  const agents = fs.existsSync(path.join(root, '.agents')) ? fs.readdirSync(path.join(root, '.agents')).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')) : []
  const example = {
    tasks: [
      {
        id: 'T1',
        title: 'título curto e imperativo',
        agent: 'backend',
        module: modules[0] ?? null,
        scope: ['caminho/arquivo.js', 'caminho/arquivo.test.js'],
        depends_on: [],
        acs: ['AC-1'],
        priority: 'P2',
        type: 'feat',
        complexity: 'baixa',
        exists: 'o que já existe e importa para esta task',
        create: [{ path: 'caminho/arquivo.js', what: 'o que fazer nele' }],
        spec: 'regras, assinaturas e comportamento esperado',
        criteria: ['verificação objetiva 1', 'verificação objetiva 2']
      }
    ],
    notes: 'riscos ou decisões que o humano deve saber (opcional)'
  }
  return [
    `Você é o COORDENADOR do harness (AlterAI - Agentic OS). Decomponha a feature "${feature}" em tasks executáveis por agentes.`,
    'Regras desta execução:',
    '- NÃO altere, crie nem apague arquivos — só leia o repositório (o harness descarta a resposta se algo mudar).',
    `- No máximo ${maxTasks} tasks, cada uma pequena o bastante para um agente concluir numa execução.`,
    '- `scope` = lista EXATA dos arquivos que a task vai tocar (caminhos relativos à raiz). Duas tasks só podem',
    '  ter arquivos em comum se uma depender da outra (direta ou indiretamente) — o harness recusa o plano senão.',
    '- `depends_on` = ids de tasks deste plano que precisam estar concluídas antes. Sem ciclos. Prefira tasks',
    '  independentes (rodam em paralelo); encadeie só quando uma usa o resultado da outra.',
    '- `acs` = critérios de aceitação da spec que a task cobre; juntas, as tasks devem cobrir todos os ACs.',
    '- Inclua testes no escopo das tasks de código. Docs numa task própria no fim, se a spec pedir.',
    '- `agent` ∈ ' + (agents.length ? agents.join(', ') : 'backend, frontend, docs') + '; `type` ∈ feat, fix, docs, refactor, test, chore;',
    '  `priority` ∈ P0..P3; `complexity` ∈ baixa, media, alta' + (modules.length ? `; \`module\` ∈ ${modules.join(', ')}` : '') + '.',
    '- Responda com o JSON do plano ENTRE as linhas exatas `--- PLANO ---` e `--- FIM ---`, e nada mais. Formato:',
    JSON.stringify(example, null, 2),
    '',
    `--- SPEC (context/features/${feature}/spec.md) ---`,
    spec,
    plan ? `\n--- PLANO TÉCNICO (context/features/${feature}/plan.md) ---\n${plan}` : '',
    '',
    '--- TASKS JÁ EXISTENTES DESTA FEATURE ---',
    existingTasks(root, feature).join('\n') || '(nenhuma)',
    '',
    '--- ARQUIVOS DO REPOSITÓRIO (git ls-files) ---',
    repoFiles(root).join('\n') || '(sem git)'
  ].join('\n')
}

// ---------- parse e validação ----------

export function parsePlanBlock(text) {
  const m = String(text ?? '').match(BLOCK_RE)
  if (!m) return null
  const raw = m[1].trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const TYPES = ['feat', 'fix', 'docs', 'refactor', 'test', 'chore', 'perf', 'style', 'build', 'ci']
const COMPLEXITIES = ['baixa', 'media', 'média', 'alta']

function badPath(p) {
  return typeof p !== 'string' || !p.trim() || path.isAbsolute(p) || /^[a-zA-Z]:/.test(p) || p.split(/[\\/]/).includes('..') || /^\.git(\/|$)/.test(p)
}

/** Ordem topológica em ondas (ids que podem rodar juntos). Lança em ciclo. */
export function waves(tasks) {
  const ids = tasks.map((t) => t.id)
  const pending = new Map(tasks.map((t) => [t.id, new Set((t.depends_on ?? []).filter((d) => ids.includes(d)))]))
  const out = []
  while (pending.size) {
    const ready = [...pending].filter(([, deps]) => deps.size === 0).map(([id]) => id)
    if (!ready.length) throw new PlanError(`dependências em ciclo entre: ${[...pending.keys()].join(', ')}`)
    out.push(ready)
    for (const id of ready) pending.delete(id)
    for (const deps of pending.values()) for (const id of ready) deps.delete(id)
  }
  return out
}

function ancestors(byId, id, seen = new Set()) {
  for (const d of byId.get(id)?.depends_on ?? []) {
    if (!seen.has(d)) {
      seen.add(d)
      ancestors(byId, d, seen)
    }
  }
  return seen
}

/**
 * Valida e normaliza o plano. Retorna `{ plan, errors, warnings }` — com `errors` o plano não
 * pode ser aprovado. `specAcList` = ACs da spec (cobertura).
 */
export function validatePlan(input, { specAcList = [], maxTasks = MAX_TASKS } = {}) {
  const errors = []
  const warnings = []
  if (!input || typeof input !== 'object' || !Array.isArray(input.tasks)) return { plan: null, errors: ['plano sem lista `tasks`'], warnings }
  if (!input.tasks.length) errors.push('plano vazio')
  if (input.tasks.length > maxTasks) errors.push(`plano com ${input.tasks.length} tasks (máximo ${maxTasks})`)
  const tasks = input.tasks.map((t, i) => {
    const id = String(t?.id ?? `T${i + 1}`).trim()
    const where = `task ${id}`
    if (!/^[A-Za-z0-9_-]{1,12}$/.test(id)) errors.push(`${where}: id inválido`)
    const title = String(t?.title ?? '').trim()
    if (!title) errors.push(`${where}: sem título`)
    const scope = Array.isArray(t?.scope) ? [...new Set(t.scope.map((p) => norm(String(p).trim()).replace(/^\.\//, '')))] : []
    if (!scope.length) errors.push(`${where}: sem escopo (lista de arquivos)`)
    for (const p of scope) if (badPath(p)) errors.push(`${where}: caminho inválido no escopo: ${p}`)
    const type = String(t?.type ?? 'feat').toLowerCase()
    if (!TYPES.includes(type)) errors.push(`${where}: type inválido: ${type}`)
    const priority = String(t?.priority ?? 'P2').toUpperCase()
    if (!/^P[0-3]$/.test(priority)) errors.push(`${where}: priority inválida: ${priority}`)
    const complexity = String(t?.complexity ?? 'baixa').toLowerCase()
    if (!COMPLEXITIES.includes(complexity)) errors.push(`${where}: complexity inválida: ${complexity}`)
    const agent = String(t?.agent ?? 'backend').toLowerCase()
    if (!SLUG_RE.test(agent)) errors.push(`${where}: agent inválido: ${agent}`)
    const acs = Array.isArray(t?.acs) ? t.acs.map((a) => String(a).trim().toUpperCase()).filter(Boolean) : []
    for (const a of acs) {
      if (!/^AC-\d+$/.test(a)) errors.push(`${where}: AC inválido: ${a}`)
      else if (specAcList.length && !specAcList.includes(a)) warnings.push(`${where}: ${a} não existe na spec`)
    }
    const criteria = Array.isArray(t?.criteria) ? t.criteria.map((c) => String(c).trim()).filter(Boolean) : []
    if (!criteria.length) errors.push(`${where}: sem critério de conclusão`)
    const create = Array.isArray(t?.create)
      ? t.create.filter((c) => c && typeof c === 'object').map((c) => ({ path: String(c.path ?? '').trim(), what: String(c.what ?? '').trim() })).filter((c) => c.path)
      : []
    const module = t?.module ? String(t.module).trim() : null
    if (module && !SLUG_RE.test(module)) errors.push(`${where}: module inválido: ${module}`)
    return {
      id,
      title,
      agent,
      module,
      scope,
      depends_on: Array.isArray(t?.depends_on) ? t.depends_on.map((d) => String(d).trim()).filter(Boolean) : [],
      acs,
      priority,
      type,
      complexity: complexity === 'média' ? 'media' : complexity,
      exists: String(t?.exists ?? '').trim(),
      create,
      spec: String(t?.spec ?? '').trim(),
      criteria
    }
  })
  const ids = tasks.map((t) => t.id)
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (dupIds.length) errors.push(`ids repetidos: ${[...new Set(dupIds)].join(', ')}`)
  for (const t of tasks) {
    for (const d of t.depends_on) {
      if (d === t.id) errors.push(`task ${t.id}: depende de si mesma`)
      else if (!ids.includes(d)) errors.push(`task ${t.id}: depende de ${d}, que não está no plano`)
    }
  }
  let order = []
  if (!errors.length) {
    try {
      order = waves(tasks)
    } catch (err) {
      errors.push(err.message)
    }
  }
  // Escopos sobrepostos só entre tasks encadeadas (senão o paralelismo quebra o escopo).
  if (!errors.length) {
    const byId = new Map(tasks.map((t) => [t.id, t]))
    for (let i = 0; i < tasks.length; i++) {
      for (let j = i + 1; j < tasks.length; j++) {
        const a = tasks[i]
        const b = tasks[j]
        const shared = a.scope.filter((p) => b.scope.includes(p))
        if (!shared.length) continue
        const chained = ancestors(byId, a.id).has(b.id) || ancestors(byId, b.id).has(a.id)
        if (!chained) errors.push(`tasks ${a.id} e ${b.id} tocam ${shared.join(', ')} sem dependência entre elas`)
      }
    }
  }
  const covered = new Set(tasks.flatMap((t) => t.acs))
  const missing = specAcList.filter((a) => !covered.has(a))
  if (missing.length) warnings.push(`ACs da spec sem task: ${missing.join(', ')}`)
  return { plan: { tasks, notes: input.notes ? String(input.notes).slice(0, 2000) : null, waves: order }, errors, warnings }
}

// ---------- gerar, editar, aprovar ----------

function lastTexts(db, runId) {
  return db
    .prepare("SELECT payload_json FROM run_events WHERE run_id = ? AND type = 'agent.message' ORDER BY seq DESC")
    .all(runId)
    .map((r) => parseJson(r.payload_json, {})?.text ?? '')
    .filter(Boolean)
}

export function savePlan(db, { feature, plan, warnings = [], tool = null, runId = null }) {
  const id = `plan-${feature}-${stamp()}`.slice(0, 80)
  const at = nowIso()
  db.prepare('INSERT INTO plans (id, feature, status, tool, run_id, plan_json, warnings_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(
    id, feature, 'proposed', tool, runId, JSON.stringify(plan), JSON.stringify(warnings), at, at
  )
  return getPlan(db, id)
}

/**
 * Pede o plano ao coordenador (agente só leitura) e salva como `proposed`. Plano inválido também
 * é salvo? Não: lança com os erros (o texto fica no run para inspeção).
 */
export async function generatePlan({ root, db, feature, driver, opts, unsafe = false, env = process.env, signal = null, limit = null, maxTasks = 8, onEvent = () => {} }) {
  const prompt = buildPlanPrompt(root, feature, { maxTasks })
  const before = worktreeSignature(root)
  const res = await runTool({ db, taskId: `feature:${feature}`, cwd: root, driver, prompt, opts, unsafe, env, signal, limit, onEvent })
  if (res.status !== 'completed') throw new PlanError(`o coordenador falhou (${res.runId}): ${res.error ?? 'run falhou'}`)
  if (worktreeSignature(root) !== before) throw new PlanError(`o coordenador alterou arquivos (${res.runId}) — plano descartado; confira com git status`)
  const raw = lastTexts(db, res.runId).map(parsePlanBlock).find(Boolean)
  if (!raw) throw new PlanError(`resposta sem o bloco --- PLANO --- … --- FIM --- com JSON válido (${res.runId}); veja: harness events ${res.runId}`)
  const { spec } = featureFiles(root, feature)
  const v = validatePlan(raw, { specAcList: specAcs(spec), maxTasks: Math.max(maxTasks, 1) })
  if (v.errors.length) {
    const err = new PlanError(`plano do coordenador inválido (${res.runId}):\n  - ${v.errors.join('\n  - ')}`)
    err.runId = res.runId
    throw err
  }
  return savePlan(db, { feature, plan: v.plan, warnings: v.warnings, tool: driver.id, runId: res.runId })
}

/** Substitui o plano proposto por uma versão editada pelo humano (JSON), revalidando. */
export function editPlan(root, db, id, input) {
  const p = getPlan(db, id)
  if (!p) throw new PlanError(`plano não encontrado: ${id}`)
  if (p.status !== 'proposed') throw new PlanError(`plano ${id} está ${p.status} — só se edita proposto`)
  const { spec } = featureFiles(root, p.feature)
  const v = validatePlan(input?.plan ?? input, { specAcList: specAcs(spec) })
  if (v.errors.length) throw new PlanError(`plano inválido:\n  - ${v.errors.join('\n  - ')}`)
  db.prepare('UPDATE plans SET plan_json = ?, warnings_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(v.plan), JSON.stringify(v.warnings), nowIso(), id)
  return getPlan(db, id)
}

export function rejectPlan(db, id) {
  const p = getPlan(db, id)
  if (!p) throw new PlanError(`plano não encontrado: ${id}`)
  if (p.status !== 'proposed') throw new PlanError(`plano ${id} está ${p.status}`)
  db.prepare("UPDATE plans SET status = 'rejected', updated_at = ? WHERE id = ?").run(nowIso(), id)
  return getPlan(db, id)
}

function fillSections(file, item, feature) {
  let s = fs.readFileSync(file, 'utf8')
  const rep = (a, b) => {
    if (s.includes(a)) s = s.replace(a, b)
  }
  rep('## O que já existe: [estado atual do código]', `## O que já existe: ${item.exists || '—'}`)
  rep('- `path/arquivo.ts` → [o que faz]', item.create.length ? item.create.map((c) => `- \`${c.path}\` → ${c.what || '—'}`).join('\n') : item.scope.map((p) => `- \`${p}\``).join('\n'))
  rep('## Especificação: [assinaturas, regras, comportamento esperado]', `## Especificação: ${item.spec || `ver context/features/${feature}/spec.md`}`)
  s = s.replace(/- \[ \] \[verificação objetiva\]\n- \[ \] Typecheck passando\n- \[ \] Lint passando/, item.criteria.map((c) => `- [ ] ${c}`).join('\n'))
  rep(/## Contexto para ler: .*/.exec(s)?.[0] ?? '\u0000', `## Contexto para ler: context/features/${feature}/spec.md${item.module ? ` · context/modules/${item.module}/context.md` : ''}`)
  fs.writeFileSync(file, s)
}

/**
 * Aprova: cria as tasks na queue em ordem topológica, ligando `Depende de` aos números criados.
 * `only` = ids a criar (os demais ficam de fora; dependências de fora precisam já existir).
 */
export function approvePlan(root, db, id, { only = null } = {}) {
  const p = getPlan(db, id)
  if (!p) throw new PlanError(`plano não encontrado: ${id}`)
  if (p.status !== 'proposed') throw new PlanError(`plano ${id} está ${p.status}`)
  const pick = only ? new Set(only) : null
  if (pick) for (const x of pick) if (!p.plan.tasks.some((t) => t.id === x)) throw new PlanError(`--only: ${x} não está no plano`)
  const byId = new Map(p.plan.tasks.map((t) => [t.id, t]))
  if (pick) {
    for (const x of pick) for (const d of byId.get(x).depends_on) if (!pick.has(d)) throw new PlanError(`--only: ${x} depende de ${d}, que ficaria de fora`)
  }
  const created = {}
  for (const wave of waves(p.plan.tasks)) {
    for (const tid of wave) {
      if (pick && !pick.has(tid)) continue
      const t = byId.get(tid)
      const deps = t.depends_on.map((d) => created[d]?.num).filter((n) => n !== undefined).map((n) => String(n).padStart(2, '0'))
      const res = createTaskFile(root, {
        description: t.title,
        module: t.module ?? '',
        agent: t.agent,
        dep: deps.length ? deps.join(', ') : '-',
        complexity: t.complexity,
        scope: t.scope,
        priority: t.priority,
        type: t.type,
        acs: t.acs,
        feature: p.feature
      })
      fillSections(res.dest, t, p.feature)
      created[tid] = { name: res.name, num: res.num }
    }
  }
  db.prepare("UPDATE plans SET status = 'approved', tasks_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(created), nowIso(), id)
  return getPlan(db, id)
}

// ---------- andamento e próxima onda ----------

function locate(root, name) {
  for (const [state, dir] of [['done', doneDir(root)], ['active', activeDir(root)], ['queue', queueDir(root)]]) {
    if (fs.existsSync(path.join(dir, name))) return state
  }
  return 'missing'
}

/** Estado de cada task do plano aprovado: onde está, último run/fluxo, se está pronta para rodar. */
export function planProgress(root, db, id) {
  const p = getPlan(db, id)
  if (!p) throw new PlanError(`plano não encontrado: ${id}`)
  const items = p.plan.tasks.map((t) => {
    const made = p.tasks?.[t.id] ?? null
    const state = made ? locate(root, made.name) : 'not-created'
    let run = null
    let flow = null
    if (made) {
      try {
        run = db.prepare('SELECT id, status, quality FROM runs WHERE task_id = ? ORDER BY started_at DESC LIMIT 1').get(made.name) ?? null
        flow = db.prepare('SELECT id, status FROM flows WHERE task_id = ? ORDER BY created_at DESC LIMIT 1').get(made.name) ?? null
      } catch {}
    }
    return { id: t.id, title: t.title, task: made?.name ?? null, state, depends_on: t.depends_on, run, flow }
  })
  const stateOf = new Map(items.map((i) => [i.id, i.state]))
  for (const it of items) it.ready = it.state === 'queue' && it.depends_on.every((d) => stateOf.get(d) === 'done')
  return { plan: p, items, done: items.every((i) => i.state === 'done') }
}
