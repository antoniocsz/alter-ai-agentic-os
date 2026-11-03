import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_STALE_MS = 60_000

const held = new Set()

function lockPath(root) {
  return path.join(root, '.harness', 'lock')
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function isStale(file, staleMs) {
  try {
    const stat = fs.statSync(file)
    return Date.now() - stat.mtimeMs > staleMs
  } catch {
    return false
  }
}

/**
 * Adquire o lock do pipeline. Reentrante no mesmo processo (Set de caminhos).
 * Lock obsoleto (mais velho que staleMs) é removido.
 */
export function acquireLock(root, opts = {}) {
  const file = lockPath(root)
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS

  if (held.has(file)) return { release() {}, reentrant: true }

  fs.mkdirSync(path.dirname(file), { recursive: true })
  const started = Date.now()

  while (true) {
    try {
      const fd = fs.openSync(file, 'wx')
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }) + '\n')
      fs.closeSync(fd)
      held.add(file)
      return {
        release() {
          held.delete(file)
          try {
            fs.rmSync(file)
          } catch {}
        }
      }
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
      if (isStale(file, staleMs)) {
        try {
          fs.rmSync(file)
          continue
        } catch {}
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error(
          `pipeline ocupado: ${path.relative(root, file)} existe há mais de ${Math.round(timeoutMs / 1000)}s.\n` +
            '  outro processo pode estar operando; se for lock órfão, remova o arquivo.'
        )
      }
      sleep(100)
    }
  }
}

export function withLock(root, fn, opts = {}) {
  const lock = acquireLock(root, opts)
  try {
    return fn()
  } finally {
    lock.release()
  }
}

export function lockStatus(root, opts = {}) {
  const file = lockPath(root)
  if (!fs.existsSync(file)) return { locked: false }
  let info = null
  try {
    info = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {}
  return {
    locked: true,
    stale: isStale(file, opts.staleMs ?? DEFAULT_STALE_MS),
    info,
    file: path.relative(root, file)
  }
}
