import { startWorktree, finishWorktree, listWorktrees, pruneWorktrees } from './lib/worktree.js'

export async function worktreeCmd(args = []) {
  const [sub, ...rest] = args
  const root = process.cwd()

  switch (sub) {
    case 'start': {
      const res = startWorktree(root, rest[0])
      process.stdout.write(
        `🌳 worktree criada: ${res.entry.path}\n` +
          `   branch: ${res.entry.branch} (base: ${res.base})\n` +
          `   task:   ${res.entry.task}\n`
      )
      return
    }
    case 'finish': {
      const keep = rest.includes('--keep')
      const skipGates = rest.includes('--skip-gates')
      const handoffIdx = rest.indexOf('--handoff')
      const handoff = handoffIdx !== -1 ? rest.slice(handoffIdx + 1).join(' ').trim() : null
      const positional = rest.filter((a) => !a.startsWith('--'))

      const res = finishWorktree(root, positional[0], { keep, skipGates, handoff })
      for (const g of res.gates) {
        const label = g.status === 'passed' ? '✅' : g.status === 'failed' ? '❌' : '⏭️'
        process.stdout.write(`   ${label} gate ${g.gate}${g.reason ? ` (${g.reason})` : ''}\n`)
      }
      process.stdout.write(`✅ worktree finalizada e mergeada: ${res.entry.branch}\n`)
      return
    }
    case 'list': {
      const list = listWorktrees(root)
      if (list.length === 0) {
        process.stdout.write('nenhuma worktree registrada.\n')
        return
      }
      for (const w of list) {
        const state = w.exists ? 'ok' : 'ausente'
        process.stdout.write(`${w.task}  ${w.branch}  ${w.path}  [${state}]\n`)
      }
      return
    }
    case 'prune': {
      const removed = pruneWorktrees(root)
      if (removed.length === 0) {
        process.stdout.write('nada para limpar.\n')
      } else {
        process.stdout.write(`🧹 removidas do registro: ${removed.map((w) => w.task).join(', ')}\n`)
      }
      return
    }
    default:
      throw new Error(
        'uso: harness worktree <start|finish|list|prune> ...\n' +
          '  start <task>            cria .worktrees/task-<n>-<slug>\n' +
          '  finish <task> [--keep] [--skip-gates] [--handoff "texto"]\n' +
          '  list | prune'
      )
  }
}
