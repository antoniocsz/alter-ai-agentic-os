import fs from 'node:fs'
import path from 'node:path'
import { validateBudget } from './budget.js'

export const PROFILES = ['web', 'api', 'cli', 'script', 'game', 'docs', 'design', 'bare']
export const GIT_MODELS = ['trunk', 'gitflow']

export const DEFAULT_CONFIG = {
  profile: 'web',
  gates: {
    finish: ['scope', 'secrets'],
    merge: [],
    strict: false
  },
  git: {
    model: 'trunk',
    featureBranch: false
  },
  wip: {
    active: 3,
    queue: 8
  },
  // Pacote de contexto anexado ao prompt do `harness run` (tokens estimados; 0 desliga).
  context: {
    budget: 8000
  }
}

const clone = (value) => JSON.parse(JSON.stringify(value))

export function readConfig(root) {
  const file = path.join(root, 'harness.json')
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    throw new Error(`harness.json inválido (JSON): ${err.message}`)
  }
}

export function resolveConfig(root) {
  const cfg = readConfig(root)
  const base = clone(DEFAULT_CONFIG)
  if (!cfg) return base
  return {
    ...base,
    ...cfg,
    gates: { ...base.gates, ...(cfg.gates ?? {}) },
    git: { ...base.git, ...(cfg.git ?? {}) },
    wip: { ...base.wip, ...(cfg.wip ?? {}) },
    context: { ...base.context, ...(cfg.context ?? {}) }
  }
}

export function validateConfig(cfg) {
  const errors = []
  if (!cfg || typeof cfg !== 'object') return ['configuração deve ser um objeto']

  if (!PROFILES.includes(cfg.profile)) {
    errors.push(`profile inválido: ${JSON.stringify(cfg.profile)} (esperado: ${PROFILES.join(' | ')})`)
  }

  for (const key of ['finish', 'merge']) {
    const list = cfg.gates?.[key]
    if (list !== undefined && (!Array.isArray(list) || list.some((g) => typeof g !== 'string'))) {
      errors.push(`gates.${key} deve ser uma lista de strings`)
    }
  }

  if (cfg.git?.model !== undefined && !GIT_MODELS.includes(cfg.git.model)) {
    errors.push(`git.model inválido: ${JSON.stringify(cfg.git.model)} (esperado: ${GIT_MODELS.join(' | ')})`)
  }
  if (cfg.git?.featureBranch !== undefined && typeof cfg.git.featureBranch !== 'boolean') {
    errors.push('git.featureBranch deve ser boolean')
  }

  if (cfg.gates?.strict !== undefined && typeof cfg.gates.strict !== 'boolean') {
    errors.push('gates.strict deve ser boolean')
  }

  for (const key of ['active', 'queue']) {
    const v = cfg.wip?.[key]
    if (v !== undefined && (!Number.isInteger(v) || v < 0)) {
      errors.push(`wip.${key} deve ser inteiro >= 0`)
    }
  }

  errors.push(...validateBudget(cfg.budget))

  const budget = cfg.context?.budget
  if (budget !== undefined && (!Number.isInteger(budget) || budget < 0)) {
    errors.push('context.budget deve ser inteiro >= 0 (0 desliga o pacote no harness run)')
  }

  // Memória em níveis (task 118): `memory.global` libera a leitura da memória global no projeto;
  // `memory.budget` = tokens da seção de memória no pacote de contexto (0 desliga).
  const mem = cfg.memory
  if (mem !== undefined) {
    if (mem === null || typeof mem !== 'object' || Array.isArray(mem)) errors.push('memory deve ser um objeto')
    else {
      if (mem.global !== undefined && typeof mem.global !== 'boolean') errors.push('memory.global deve ser true/false')
      if (mem.budget !== undefined && (!Number.isInteger(mem.budget) || mem.budget < 0)) errors.push('memory.budget deve ser inteiro >= 0 (0 desliga a seção de memória)')
      for (const k of Object.keys(mem)) if (!['global', 'budget'].includes(k)) errors.push(`memory.${k} desconhecido (use global, budget)`)
    }
  }

  return errors
}
