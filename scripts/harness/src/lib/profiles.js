import fs from 'node:fs'
import path from 'node:path'
import { templatesDir } from './paths.js'

export const PROFILES = ['web', 'api', 'cli', 'script', 'game', 'docs', 'design', 'bare']

export const PROFILE_INFO = {
  web: 'App web + API (monorepo pnpm/Turbo: Fastify, Next.js, contracts)',
  api: 'API/backend (Fastify + contracts, monorepo)',
  cli: 'Ferramenta CLI em Node.js',
  script: 'Script/automação em Node.js',
  game: 'Jogo (estrutura de cenas, sistemas e assets)',
  docs: 'Documentação/pesquisa (markdown)',
  design: 'Design (assets + briefing .pen)',
  bare: 'Mínimo: só contexto + pipeline'
}

export const baseTemplateDir = () => path.join(templatesDir(), 'project', '_base')
export const profileTemplateDir = (profile) => path.join(templatesDir(), 'project', profile)

export const isValidProfile = (profile) => PROFILES.includes(profile)

export function resolveProfile(args = []) {
  const idx = args.indexOf('--profile')
  const explicit = idx !== -1 ? args[idx + 1] : null

  if (idx !== -1 && (!explicit || explicit.startsWith('-'))) {
    throw new Error(`uso: --profile <${PROFILES.join('|')}>`)
  }
  if (args.includes('--bare')) return 'bare'

  const profile = explicit ?? 'web'
  if (!isValidProfile(profile)) {
    throw new Error(`perfil inválido: ${profile} (use: ${PROFILES.join(' | ')})`)
  }
  return profile
}

export function profileExists(profile) {
  return fs.existsSync(profileTemplateDir(profile))
}
