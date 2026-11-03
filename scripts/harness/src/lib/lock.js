import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

const DEFAULT_TIMEOUT_MS = 10_000
// Gates longos rodam com timeout próprio (10 min); o lock só é considerado
// órfão bem depois disso, para nunca ser "roubado" durante um gate.
const DEFAULT_STALE_MS = 30 * 60_000

const held = new Map()

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

function readLock(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

export function acquireLock(root, opts = {}) {
  const file = lockPath(root)
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS

  const existingToken = held.get(file)
  if (existingToken) return { release() {}, reentrant: true, token: existingToken }

  fs.mkdirSync(path.dirname(file), { recursive: true })
  const started = Date.now()
  const token = randomBytes(8).toString('hex')

  while (true) {
    try {
      const fd = fs.openSync(file, 'wx')
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, token, at: new Date().toISOString() }) + '\n')
      fs.closeSync(fd)
      held.set(file, token)
      return {
        token,
        release() {
          held.delete(file)
          // Só remove se ainda formos os donos (nunca apaga lock de outro).
          const current = readLock(file)
          if (current?.token === token) {
            try {
              fs.rmSync(file)
            } catch {}
          }
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
  return {
    locked: true,
    stale: isStale(file, opts.staleMs ?? DEFAULT_STALE_MS),
    info: readLock(file),
    file: path.relative(root, file)
  }
}
