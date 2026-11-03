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

// Chaves de ambiente em MAIÚSCULAS (DB_PASSWORD, AWS_SECRET_ACCESS_KEY,
// DATABASE_URL, OPENAI_API_KEY...). Evita confundir código (`const password = ...`).
const ENV_ASSIGN_RE =
  /(^|[\s,{(])((?:[A-Z][A-Z0-9]*_)*(?:PASSWORD|SENHA|SECRET|TOKEN|API_KEY|ACCESS_KEY|PRIVATE_KEY|DATABASE_URL)\s*[:=]\s*)(["']?)([^\s"',;]{8,})\3/gm

const BEARER_RE = /\b(Bearer\s+)([A-Za-z0-9._~+/=-]{16,})/gi

const ALLOWLIST = new Set([
  'postgres', 'password', 'changeme', 'change-me', 'secret', 'admin', 'root',
  'example', 'test', 'dev', 'development', 'replace-me', 'your-secret'
])

function isAllowedValue(value) {
  const v = String(value).toLowerCase()
  if (ALLOWLIST.has(v)) return true
  // URLs de desenvolvimento local: usuário:postgres@localhost / 127.0.0.1
  const m = v.match(/^[a-z+]+:\/\/[^:/\s]+:([^@/\s]+)@(localhost|127\.0\.0\.1)([:/]|$)/)
  if (m && ALLOWLIST.has(m[1])) return true
  if (/^redis:\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(v)) return true
  return false
}


export function redact(text) {
  if (text === null || text === undefined) return text
  let out = String(text)
  for (const re of TOKEN_RES) out = out.replace(re, '[REDACTED]')
  out = out.replace(ENV_ASSIGN_RE, (match, boundary, prefix, quote, value) =>
    isAllowedValue(value) ? match : `${boundary}${prefix}${quote}[REDACTED]${quote}`
  )
  out = out.replace(BEARER_RE, (_match, prefix) => `${prefix}[REDACTED]`)
  return out
}

export function lineHasSecret(line) {
  for (const re of TOKEN_RES) {
    re.lastIndex = 0
    if (re.test(line)) return true
  }
  ENV_ASSIGN_RE.lastIndex = 0
  let match
  while ((match = ENV_ASSIGN_RE.exec(line))) {
    if (!isAllowedValue(match[4])) return true
  }
  BEARER_RE.lastIndex = 0
  if (BEARER_RE.test(line)) return true
  return false
}

const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.md', '.yml', '.yaml',
  '.toml', '.ini', '.py', '.sh', '.bash', '.ps1', '.txt', '.html', '.css', '.sql', '.xml'
])

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.harness', '.worktrees', 'dist', 'coverage', '.turbo',
  '.tmp', 'build', '.next', 'vendor'
])

const LOCKFILES = new Set([
  'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'npm-shrinkwrap.json', 'bun.lockb'
])

const isEnvFile = (name) => /^\.env(\..+)?$/.test(name)
const isTextFile = (name) => TEXT_EXT.has(path.extname(name)) || isEnvFile(name)

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
      if (!isTextFile(entry.name)) continue
      if (LOCKFILES.has(entry.name) || /\.(lock|map)$/i.test(entry.name)) continue

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
