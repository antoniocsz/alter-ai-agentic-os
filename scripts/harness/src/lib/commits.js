export const COMMIT_TYPES = ['feat', 'fix', 'docs', 'refactor', 'test', 'chore', 'perf', 'build', 'ci']

export function normalizeCommitType(value) {
  const type = String(value ?? 'feat').trim().toLowerCase()
  if (!COMMIT_TYPES.includes(type)) {
    throw new Error(`tipo de commit inválido: ${value} (use: ${COMMIT_TYPES.join(' | ')})`)
  }
  return type
}

export function conventionalCommit({ type = 'feat', scope = null, subject }) {
  const normalized = normalizeCommitType(type)
  const clean = String(subject ?? '').trim().replace(/\s+/g, ' ')
  const scoped = scope ? `${normalized}(${scope}): ${clean}` : `${normalized}: ${clean}`
  return scoped.slice(0, 100)
}

export function taskScope(taskFile) {
  return `task-${String(taskFile).match(/^(\d+)-/)?.[1] ?? '0'}`
}

export function taskSubject(taskFile) {
  return String(taskFile)
    .replace(/^\d+-/, '')
    .replace(/\.md$/, '')
    .replace(/-/g, ' ')
}

export function commitForTask(taskFile, type = 'feat') {
  return conventionalCommit({ type, scope: taskScope(taskFile), subject: taskSubject(taskFile) })
}
