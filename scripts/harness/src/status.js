import fs from 'node:fs'
import path from 'node:path'
import { statusReport } from './lib/memory.js'

export async function statusCmd() {
  const root = process.cwd()
  const registryFile = path.join(root, '.harness-workspace.json')

  if (fs.existsSync(registryFile)) {
    let reg
    try {
      reg = JSON.parse(fs.readFileSync(registryFile, 'utf8'))
    } catch {
      reg = { projects: [] }
    }
    process.stdout.write(`📊 workspace: ${path.basename(root)}\n`)
    if (!reg.projects?.length) {
      process.stdout.write('   nenhum projeto registrado.\n')
      return
    }
    for (const project of reg.projects) {
      const s = statusReport(project.path)
      const wt = s.worktrees.length ? ` · worktrees: ${s.worktrees.length}` : ''
      process.stdout.write(
        `   ${project.name.padEnd(20)} ${s.counts.queue} queue / ${s.counts.active} active / ${s.counts.done} done${wt}\n`
      )
      if (s.activeTasks.length) {
        process.stdout.write(`     ativas: ${s.activeTasks.join(', ')}\n`)
      }
    }
    return
  }

  const s = statusReport(root)
  process.stdout.write(`📊 projeto: ${s.name}\n`)
  process.stdout.write(`   tasks:  ${s.counts.queue} queue / ${s.counts.active} active / ${s.counts.done} done\n`)
  if (s.activeTasks.length) {
    process.stdout.write(`   agora:  ${s.activeTasks.join(', ')}\n`)
  }
  if (s.worktrees.length) {
    for (const w of s.worktrees) {
      process.stdout.write(`   🌳 ${w.branch} → ${w.path}${w.exists ? '' : ' (ausente)'}\n`)
    }
  }
  if (s.next.length) {
    process.stdout.write(`   próximas: ${s.next.join(', ')}\n`)
  }
  if (s.sessions.length) {
    process.stdout.write('   últimas sessões:\n')
    for (const session of s.sessions) {
      process.stdout.write(`     - ${session.date}: ${session.summary.slice(0, 120)}\n`)
    }
  }
  if (s.handoff) {
    process.stdout.write(`   último handoff (${s.handoff.task_id}): ${s.handoff.content.replace(/^handoff:\s*/, '').slice(0, 140)}\n`)
  }
}
