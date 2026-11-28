// Iniciador do app desktop (feature iniciador-app, task 144): conteúdo dos atalhos (.lnk via
// PowerShell no Windows, .desktop no Linux) e detecção do Electron instalado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { windowsShortcutScript, linuxDesktopEntry, electronBinary, APP_NAME } from '../../../apps/desktop/src/shortcut.js'
import { tmpdir } from './helpers.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP = path.resolve(HERE, '../../../apps/desktop')

test('windows: um .lnk por pasta, apontando para o electron.exe com a pasta do app e o ícone', () => {
  const script = windowsShortcutScript({
    electronExe: "D:\\projetos\\harness\\apps\\desktop\\node_modules\\electron\\dist\\electron.exe",
    appDir: "D:\\projetos\\O'Neil app",
    icon: 'D:\\projetos\\harness\\apps\\desktop\\build\\icon.ico'
  })
  assert.equal((script.match(/\$lnk\.Save\(\)/g) || []).length, 2)
  assert.match(script, /GetFolderPath\('Desktop'\)/)
  assert.match(script, /GetFolderPath\('Programs'\)/)
  assert.match(script, new RegExp(`'${APP_NAME}\\.lnk'`))
  assert.match(script, /\$lnk\.TargetPath = 'D:\\projetos\\harness\\apps\\desktop\\node_modules\\electron\\dist\\electron\.exe'/)
  // Aspas simples do PowerShell dobradas; a pasta vai entre aspas duplas no argumento.
  assert.match(script, /\$lnk\.Arguments = '"D:\\projetos\\O''Neil app"'/)
  assert.match(script, /\$lnk\.IconLocation = '.*icon\.ico,0'/)
  assert.equal(windowsShortcutScript({ electronExe: 'e', appDir: 'a', icon: 'i', folders: ['Desktop'] }).match(/Save\(\)/g).length, 1)
})

test('linux: .desktop sem terminal, com Exec citado e ícone', () => {
  const entry = linuxDesktopEntry({ electronBin: '/opt/x/electron', appDir: '/home/a/meu "app"', icon: '/home/a/icon.png' })
  assert.match(entry, /^\[Desktop Entry\]\nType=Application\nName=AlterAI - Agentic OS\n/)
  assert.match(entry, /\nExec="\/opt\/x\/electron" "\/home\/a\/meu \\"app\\""\n/)
  assert.match(entry, /\nIcon=\/home\/a\/icon\.png\n/)
  assert.match(entry, /\nTerminal=false\n/)
})

test('electronBinary: null quando o electron não está instalado', () => {
  const dir = tmpdir()
  fs.writeFileSync(path.join(dir, 'package.json'), '{}')
  assert.equal(electronBinary(dir), null)
})

test('ícones do app existem e o build os usa', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8'))
  assert.equal(pkg.scripts.atalho, 'node src/shortcut.js')
  assert.equal(pkg.build.win.icon, 'build/icon.ico')
  for (const f of ['build/icon.ico', 'build/icon.png']) {
    assert.ok(fs.existsSync(path.join(DESKTOP, f)), f)
    assert.ok(pkg.build.files.includes(f), `${f} no pacote`)
  }
  const ico = fs.readFileSync(path.join(DESKTOP, 'build/icon.ico'))
  assert.deepEqual([...ico.subarray(0, 4)], [0, 0, 1, 0], 'cabeçalho ICO')
  assert.ok(ico.readUInt16LE(4) >= 5, 'vários tamanhos no .ico')
})
