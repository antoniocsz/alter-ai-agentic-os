import fs from 'node:fs'
import path from 'node:path'

export function render(content, vars = {}) {
  return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => (key in vars ? String(vars[key]) : ''))
}

export function copyDir(src, dest, { vars = {}, renderAll = false } = {}) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(from, to, { vars, renderAll })
      continue
    }
    if (renderAll) {
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.writeFileSync(to, render(fs.readFileSync(from, 'utf8'), vars))
    } else {
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.copyFileSync(from, to)
    }
  }
}

export function copyPath(src, dest) {
  if (!fs.existsSync(src)) return
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    copyDir(src, dest)
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
  }
}

export function renderTemplateFile(src, dest, vars) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, render(fs.readFileSync(src, 'utf8'), vars))
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}