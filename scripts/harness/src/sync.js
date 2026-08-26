import { openDb, syncFromMarkdown } from './lib/db.js'

export async function sync() {
  const root = process.cwd()
  const db = openDb(root)
  const changed = syncFromMarkdown(db, root)
  if (changed.length === 0) {
    process.stdout.write('✅ banco em dia — nenhuma mudança.\n')
  } else {
    process.stdout.write(`✅ ${changed.length} task(s) sincronizada(s) do markdown:\n`)
    for (const c of changed) process.stdout.write(`  - ${c.id} → ${c.to}\n`)
  }
}