import fs from 'node:fs'
import path from 'node:path'

const TOKEN_RES = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bghp_[A-Za-z0-9]{20,}\b/g,
  /\bgho_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g
]

// token fica de fora de propósito: `token = tokenStorage...` é código, não segredo.
const ASSIGN_RE =
  /\b((?:password|senha|secret|api[_-]?key|access[_-]?key)\s*[:=]\s*)(["']?)([^\s"',;(){}[\]$]{8,})\2/gi

const ALLOWLIST = new Set([
  'postgres', 'password', 'changeme', 'change-me', 'secret', 'admin', 'root',
  'example', 'test', 'dev', 'development', 'replace-me', 'your-secret'
])

export function redact(text) {
  if (text === null || text === undefined) return text
  let out = String(text)
  for (const re of TOKEN_RES) out = out.replace(re, '[REDACTED]')
  out = out.replace(ASSIGN_RE, (match, prefix, quote, value) =>
    ALLOWLIST.has(value.toLowerCase()) ? match : `${prefix}${quote}[REDACTED]${quote}`
  )
  return out
}

export function lineHasSecret(line) {
  for (const re of TOKEN_RES) {
    re.lastIndex = 0
    if (re.test(line)) return true
  }
  ASSIGN_RE.lastIndex = 0
  let match
  while ((match = ASSIGN_RE.exec(line))) {
    if (!ALLOWLIST.has(match[3].toLowerCase())) return true
  }
  return false
}

const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.md', '.yml', '.yaml',
  '.env', '.toml', '.ini', '.py', '.sh', '.bash', '.ps1', '.txt', '.html', '.css', '.sql', '.xml'
])

const SKIP_DIRS = new Set(['node_modules', '.git', '.harness', '.worktrees', 'dist', 'coverage', '.turbo', '.tmp'])

const isTestFile = (rel) =>
  /(^|\/)(tests?|__tests__)\//.test(rel) || /\.(test|spec)\.[a-z0-9]+$/i.test(rel)

const isLockfile = (name) => /lock|\.map$/i.test(name)

export function scanSecrets(root) {
  const findings = []

  const walk = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      const rel = path.relative(root, full).replace(/\\/g, '/')

      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (isTestFile(rel)) continue
      const ext = path.extname(entry.name)
      if (!TEXT_EXT.has(ext)) continue
      if (isLockfile(entry.name)) continue

      let content
      try {
        const stat = fs.statSync(full)
        if (stat.size > 256 * 1024) continue
        content = fs.readFileSync(full, 'utf8')
      } catch {
        continue
      }
      if (content.includes('\u0000')) continue

      content.split(/\r?\n/).forEach((line, idx) => {
        if (line.length > 2000) return
        if (lineHasSecret(line)) findings.push(`${rel}:${idx + 1}`)
      })
    }
  }

  walk(root)
  return [...new Set(findings)]
}
