import fs from 'node:fs'
import path from 'node:path'
import { openDb } from './lib/db.js'

const PKG = ['scripts', 'harness', 'package.json']

export function versionCmd(args, root = process.cwd()) {
  const pkgPath = path.join(root, ...PKG)
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`não encontrei a camada do harness (${path.join(...PKG)}): ${root}`)
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const bumpIdx = args.indexOf('--bump')
  if (bumpIdx === -1) {
    process.stdout.write(`${pkg.version}\n`)
    return
  }
  const type = args[bumpIdx + 1]
  if (!['patch', 'minor', 'major'].includes(type)) {
    throw new Error('uso: harness version [--bump patch|minor|major]')
  }
  const current = pkg.version
  const next = bump(current, type)
  pkg.version = next
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

  const db = openDb(root)
  try {
    db.prepare(
      'INSERT INTO interactions (task_id, kind, content, source, at) VALUES (?,?,?,?,?)'
    ).run(null, 'system', `harness version: ${current} → ${next}`, 'cli', new Date().toISOString())
  } finally {
    db.close()
  }
  process.stdout.write(`✅ versão do harness: ${current} → ${next}\n`)
}

export function changelogCmd(args, root = process.cwd()) {
  const outIdx = args.indexOf('--out')
  const outFile = outIdx !== -1 ? args[outIdx + 1] : 'CHANGELOG.md'
  const dest = path.isAbsolute(outFile) ? outFile : path.join(root, outFile)

  const db = openDb(root)
  let rows
  try {
    rows = db
      .prepare(
        `SELECT task_id, content, at FROM interactions
         WHERE kind = 'note' AND content LIKE 'handoff:%'
         ORDER BY at, id`
      )
      .all()
  } finally {
    db.close()
  }

  const lines = ['# Changelog', '']
  for (const r of rows.reverse()) {
    const date = new Date(r.at).toISOString().slice(0, 10)
    const title = r.task_id ?? 'geral'
    lines.push(`## ${date} — ${title}`, '', `- ${r.content.replace(/^handoff:\s*/, '')}`, '')
  }
  if (rows.length === 0) lines.push('_(nenhum handoff registrado ainda — use `harness finish <task> --handoff "...")`)_', '')
  fs.writeFileSync(dest, lines.join('\n'))
  process.stdout.write(`✅ changelog gerado em ${dest} (${rows.length} handoff(s))\n`)
}

function bump(version, type) {
  const [maj, min, pat] = version.split('.').map(Number)
  if (type === 'major') return `${maj + 1}.0.0`
  if (type === 'minor') return `${maj}.${min + 1}.0`
  return `${maj}.${min}.${pat + 1}`
}