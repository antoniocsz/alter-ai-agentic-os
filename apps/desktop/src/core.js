// Núcleo do app desktop (feature app-desktop, task 135): tudo que não depende do Electron —
// localizar o CLI do harness, validar a pasta do projeto, subir/descobrir/encerrar o
// `harness serve`, configurações (projetos recentes, unsafe por projeto, janela) e a política de
// navegação. Testado com node:test em scripts/harness/tests/desktop-core.test.js.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'

export const MAX_RECENTS = 8

/**
 * Caminho do CLI do harness. Em desenvolvimento: `<repo>/scripts/harness/bin/harness.js` (o app
 * fica em `<repo>/apps/desktop`). Empacotado: `resources/harness/scripts/harness/bin/harness.js`
 * (extraResources do electron-builder). `HARNESS_BIN` sobrepõe.
 */
export function harnessEntry({ packaged = false, resourcesPath = '', appDir = '', env = process.env } = {}) {
  if (env.HARNESS_BIN) return path.resolve(env.HARNESS_BIN)
  return packaged
    ? path.join(resourcesPath, 'harness', 'scripts', 'harness', 'bin', 'harness.js')
    : path.resolve(appDir, '..', '..', 'scripts', 'harness', 'bin', 'harness.js')
}

/**
 * Como rodar o harness: com `HARNESS_NODE` (um Node do sistema, ≥ 22.5), ou com o próprio binário
 * do app em modo Node (`ELECTRON_RUN_AS_NODE=1`) — não exige Node instalado.
 */
export function nodeCommand({ execPath, env = process.env }) {
  if (env.HARNESS_NODE) return { cmd: env.HARNESS_NODE, env: { ...env } }
  return { cmd: execPath, env: { ...env, ELECTRON_RUN_AS_NODE: '1' } }
}

/** Pasta é um projeto do harness? (harness.json, banco ou AGENTS.md + tasks/). */
export function isHarnessProject(dir) {
  if (!dir) return false
  try {
    if (!fs.statSync(dir).isDirectory()) return false
  } catch {
    return false
  }
  const has = (p) => fs.existsSync(path.join(dir, p))
  return has('harness.json') || has('.harness') || (has('AGENTS.md') && has('tasks'))
}

export function serveArgs(entry, { allowUnsafe = false } = {}) {
  const args = [entry, 'serve', '--port', '0', '--host', '127.0.0.1']
  if (allowUnsafe) args.push('--allow-unsafe')
  return args
}

export function serveFilePath(root) {
  return path.join(root, '.harness', 'serve.json')
}

/** Lê o serve.json DESTE processo (pid) — outro serve no mesmo projeto não conta. */
export function readServeFile(root, pid) {
  try {
    const info = JSON.parse(fs.readFileSync(serveFilePath(root), 'utf8'))
    if (pid !== undefined && info.pid !== pid) return null
    if (!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(String(info.url)) || !info.token) return null
    return info
  } catch {
    return null
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Espera o serve gravar o serve.json (url + token). Lança se o processo morrer ou estourar o tempo. */
export async function waitForServe(root, pid, { timeoutMs = 20_000, isAlive = () => true, interval = 100 } = {}) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    const info = readServeFile(root, pid)
    if (info) return info
    if (!isAlive()) throw new Error('o harness serve encerrou antes de ficar pronto (veja o log)')
    await sleep(interval)
  }
  throw new Error(`o harness serve não ficou pronto em ${Math.round(timeoutMs / 1000)}s (veja o log)`)
}

/** Log em memória com limite (saída do serve para a janela de diagnóstico). */
export function ringLog(max = 400) {
  const lines = []
  return {
    push(chunk) {
      for (const l of String(chunk).split(/\r?\n/)) {
        if (!l) continue
        lines.push(l)
        if (lines.length > max) lines.shift()
      }
    },
    text: () => lines.join('\n'),
    lines: () => [...lines]
  }
}

/**
 * Sobe o `harness serve` do projeto. Retorna `{ child, info, log }` quando o serve.json aparece.
 * `spawnImpl` injetável nos testes.
 */
export async function startServe({ root, entry, execPath, allowUnsafe = false, env = process.env, timeoutMs, spawnImpl = spawn }) {
  if (!isHarnessProject(root)) throw new Error(`não é um projeto do harness: ${root}`)
  if (!fs.existsSync(entry)) throw new Error(`CLI do harness não encontrado: ${entry}`)
  const { cmd, env: childEnv } = nodeCommand({ execPath, env })
  const log = ringLog()
  const child = spawnImpl(cmd, serveArgs(entry, { allowUnsafe }), { cwd: root, env: childEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let exited = false
  child.on('exit', (code, signal) => {
    exited = true
    log.push(`[harness serve saiu: ${code ?? signal}]`)
  })
  child.stdout?.on('data', (c) => log.push(c))
  child.stderr?.on('data', (c) => log.push(c))
  try {
    const info = await waitForServe(root, child.pid, { timeoutMs, isAlive: () => !exited })
    return { child, info, log }
  } catch (err) {
    try {
      child.kill()
    } catch {}
    err.log = log.text()
    throw err
  }
}

/** POST /api/shutdown com o token da sessão; espera o processo sair (ou mata após o prazo). */
export async function stopServe({ child, info }, { timeoutMs = 8000 } = {}) {
  if (!child || child.exitCode !== null || child.signalCode) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  try {
    await new Promise((resolve, reject) => {
      const u = new URL('/api/shutdown', info.url)
      const req = http.request(
        { host: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'x-harness-token': info.token, 'content-type': 'application/json', 'content-length': 2 } },
        (res) => {
          res.resume()
          res.on('end', resolve)
        }
      )
      req.on('error', reject)
      req.setTimeout(3000, () => req.destroy(new Error('timeout')))
      req.end('{}')
    })
  } catch {}
  const timer = new Promise((resolve) => setTimeout(() => resolve('timeout'), timeoutMs))
  if ((await Promise.race([exited, timer])) === 'timeout') {
    try {
      child.kill()
    } catch {}
  }
}

/** Navegação permitida dentro da janela: só a origem do serve. O resto abre no navegador. */
export function isInternalUrl(target, base) {
  try {
    const a = new URL(target)
    const b = new URL(base)
    return a.origin === b.origin
  } catch {
    return false
  }
}

// ---------- configurações ----------

const DEFAULT_SETTINGS = { recents: [], unsafe: {}, window: null }

export function loadSettings(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    return {
      recents: Array.isArray(raw.recents) ? raw.recents.filter((p) => typeof p === 'string').slice(0, MAX_RECENTS) : [],
      unsafe: raw.unsafe && typeof raw.unsafe === 'object' ? raw.unsafe : {},
      window: raw.window && typeof raw.window === 'object' ? raw.window : null
    }
  } catch {
    return { ...DEFAULT_SETTINGS, recents: [], unsafe: {} }
  }
}

export function saveSettings(file, settings) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2))
  fs.renameSync(tmp, file)
}

/** Projeto aberto vai para o topo dos recentes (sem duplicar; caminho normalizado). */
export function touchRecent(settings, dir) {
  const norm = path.resolve(dir)
  const same = (p) => (process.platform === 'win32' ? p.toLowerCase() === norm.toLowerCase() : p === norm)
  return { ...settings, recents: [norm, ...settings.recents.filter((p) => !same(p))].slice(0, MAX_RECENTS) }
}
