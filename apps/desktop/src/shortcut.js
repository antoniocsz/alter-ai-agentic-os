// Iniciador do app desktop (feature iniciador-app, task 144): `npm run atalho` cria os atalhos
// que abrem o app com um clique, sem janela de terminal e com o ícone do AlterAI.
//   Windows: Área de Trabalho + Menu Iniciar (.lnk apontando para o electron.exe deste app)
//   Linux:   ~/.local/share/applications/alterai-agentic-os.desktop (+ cópia na Área de Trabalho)
//   macOS:   sem atalho — use `npm run dist:mac` (gera o .app/.dmg)
// As funções que montam o conteúdo são puras (testadas); só `main()` toca o disco.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

export const APP_NAME = 'AlterAI - Agentic OS'
export const DESKTOP_ID = 'alterai-agentic-os'

const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`

/** Script PowerShell que cria um .lnk em cada pasta (`Desktop`, `Programs`) — sem console. */
export function windowsShortcutScript({ electronExe, appDir, icon, folders = ['Desktop', 'Programs'], name = APP_NAME }) {
  const lines = ['$ErrorActionPreference = "Stop"', '$shell = New-Object -ComObject WScript.Shell', '$made = @()']
  for (const folder of folders) {
    lines.push(
      `$dir = [Environment]::GetFolderPath(${psQuote(folder)})`,
      `$lnk = $shell.CreateShortcut((Join-Path $dir ${psQuote(name + '.lnk')}))`,
      `$lnk.TargetPath = ${psQuote(electronExe)}`,
      `$lnk.Arguments = ${psQuote('"' + appDir + '"')}`,
      `$lnk.WorkingDirectory = ${psQuote(appDir)}`,
      `$lnk.IconLocation = ${psQuote(icon + ',0')}`,
      `$lnk.Description = ${psQuote('Abre o ' + name)}`,
      '$lnk.Save()',
      '$made += $lnk.FullName'
    )
  }
  lines.push('$made -join "`n"')
  return lines.join('\n')
}

/** Arquivo .desktop (Linux). */
export function linuxDesktopEntry({ electronBin, appDir, icon, name = APP_NAME }) {
  const q = (s) => `"${String(s).replace(/(["\\`$])/g, '\\$1')}"`
  return [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${name}`,
    'Comment=Agentes de código com pipeline de tasks, worktrees e analytics',
    `Exec=${q(electronBin)} ${q(appDir)}`,
    `Path=${appDir}`,
    `Icon=${icon}`,
    'Terminal=false',
    'Categories=Development;',
    `StartupWMClass=${name}`,
    ''
  ].join('\n')
}

/** Caminho do binário do Electron instalado neste app (o pacote `electron` exporta o caminho). */
export function electronBinary(appDir) {
  try {
    const req = createRequire(path.join(appDir, 'package.json'))
    const bin = req('electron')
    return typeof bin === 'string' && fs.existsSync(bin) ? bin : null
  } catch {
    return null
  }
}

function main() {
  const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const bin = electronBinary(appDir)
  if (!bin) {
    console.error('Electron não encontrado. Rode antes, nesta pasta:  npm install')
    process.exit(1)
  }
  if (process.platform === 'win32') {
    const script = windowsShortcutScript({ electronExe: bin, appDir, icon: path.join(appDir, 'build', 'icon.ico') })
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { encoding: 'utf8' })
    console.log('✅ Atalhos criados:\n' + out.trim().split(/\r?\n/).map((l) => '   ' + l).join('\n'))
    console.log('   Abra pelo ícone "' + APP_NAME + '" na Área de Trabalho ou no Menu Iniciar (pode fixar na barra de tarefas).')
    return
  }
  if (process.platform === 'linux') {
    const entry = linuxDesktopEntry({ electronBin: bin, appDir, icon: path.join(appDir, 'build', 'icon.png') })
    const appsDir = path.join(os.homedir(), '.local', 'share', 'applications')
    fs.mkdirSync(appsDir, { recursive: true })
    const file = path.join(appsDir, DESKTOP_ID + '.desktop')
    fs.writeFileSync(file, entry, { mode: 0o755 })
    const made = [file]
    const desk = path.join(os.homedir(), 'Desktop')
    if (fs.existsSync(desk)) {
      fs.writeFileSync(path.join(desk, DESKTOP_ID + '.desktop'), entry, { mode: 0o755 })
      made.push(path.join(desk, DESKTOP_ID + '.desktop'))
    }
    console.log('✅ Atalhos criados:\n' + made.map((l) => '   ' + l).join('\n'))
    return
  }
  console.log('No macOS, gere o app com:  npm run dist:mac  (o .dmg fica em apps/desktop/dist/)')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
