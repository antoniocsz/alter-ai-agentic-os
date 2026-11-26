// App desktop do AlterAI - Agentic OS (feature app-desktop, task 136). Electron sobre a API local:
// o app sobe o `harness serve` do projeto escolhido (com o Node do próprio Electron ou
// `HARNESS_NODE`) e abre o Workspace (conversa + mudanças), o quadro, o Analytics e o canvas clássico numa janela.
// A lógica sem Electron vive em core.js (testada); aqui só janela, menus e ciclo de vida.
import { app, BrowserWindow, Menu, dialog, shell, clipboard, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  harnessEntry,
  isHarnessProject,
  isInternalUrl,
  loadSettings,
  saveSettings,
  startServe,
  stopServe,
  touchRecent,
  validProjectRequest
} from './core.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SETTINGS = path.join(app.getPath('userData'), 'settings.json')

let win = null
let settings = loadSettings(SETTINGS)
let current = null // { root, child, info, log, allowUnsafe }
let starting = false

const entry = harnessEntry({ packaged: app.isPackaged, resourcesPath: process.resourcesPath, appDir: path.resolve(HERE, '..') })

function page(title, body) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title>
<style>body{margin:0;background:#0f1117;color:#e6e9ef;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}
main{max-width:720px;padding:32px}h1{font-size:20px;margin:0 0 8px}p{color:#8b93a5;font-size:14px;line-height:1.5}
pre{background:#171a21;border:1px solid #262b36;border-radius:10px;padding:12px;font-size:12px;max-height:50vh;overflow:auto;white-space:pre-wrap;color:#e6e9ef}
kbd{background:#171a21;border:1px solid #262b36;border-radius:6px;padding:1px 6px;font-size:12px}</style></head><body><main>${body}</main></body></html>`
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html)
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function showWelcome(extra = '') {
  win?.loadURL(
    page(
      'AlterAI - Agentic OS',
      `<h1>AlterAI - Agentic OS</h1><p>Abra a pasta de um projeto do harness (com <code>harness.json</code>) em
       <kbd>Arquivo → Abrir projeto…</kbd> (<kbd>Ctrl/Cmd+O</kbd>). O app sobe o <code>harness serve</code> do projeto e
       abre o Workspace; dali você troca de projeto pelo nome no topo.</p>${extra}`
    )
  )
}

function showError(title, err, log) {
  win?.loadURL(page(title, `<h1>${esc(title)}</h1><p>${esc(err?.message ?? err)}</p>${log ? `<pre>${esc(log)}</pre>` : ''}<p>Tente <kbd>Servidor → Reiniciar</kbd> ou abra outro projeto.</p>`))
}

async function openProject(root) {
  if (starting) return
  if (!isHarnessProject(root)) {
    dialog.showErrorBox('Não é um projeto do harness', `${root}\n\nEscolha a pasta que tem harness.json (ou .harness/).`)
    return
  }
  starting = true
  try {
    await closeProject()
    const allowUnsafe = Boolean(settings.unsafe[path.resolve(root)])
    win.setTitle(`AlterAI — ${path.basename(root)} (iniciando…)`)
    win.loadURL(page('Iniciando', `<h1>Iniciando o harness serve…</h1><p>${esc(root)}</p>`))
    const started = await startServe({ root, entry, execPath: process.execPath, allowUnsafe })
    current = { root, allowUnsafe, ...started }
    started.child.on('exit', () => {
      if (current?.child === started.child) {
        const log = current.log.text()
        current = null
        buildMenu()
        showError('O harness serve parou', new Error('o processo do servidor encerrou'), log)
      }
    })
    settings = touchRecent(settings, root)
    saveSettings(SETTINGS, settings)
    win.setTitle(`AlterAI — ${path.basename(root)}${allowUnsafe ? ' · unsafe liberado' : ''}`)
    await win.loadURL(new URL('/workspace', current.info.url).href)
  } catch (err) {
    showError('Não consegui subir o harness serve', err, err.log)
  } finally {
    starting = false
    buildMenu()
  }
}

async function closeProject() {
  const prev = current
  current = null
  if (prev) await stopServe(prev)
}

async function pickProject() {
  const res = await dialog.showOpenDialog(win, { title: 'Abrir projeto do harness', properties: ['openDirectory'] })
  if (!res.canceled && res.filePaths[0]) await openProject(res.filePaths[0])
}

function go(p) {
  if (current) win.loadURL(new URL(p, current.info.url).href)
}

async function toggleUnsafe() {
  if (!current) return
  const key = path.resolve(current.root)
  const next = !settings.unsafe[key]
  if (next) {
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Liberar unsafe', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      title: 'Liberar unsafe',
      message: 'Permitir que o painel rode agentes sem pedir permissões?',
      detail: 'Sobe o serve com --allow-unsafe neste projeto: o formulário do painel passa a aceitar "unsafe" (necessário para o opencode). Fica registrado em cada run.'
    })
    if (response !== 0) return
  }
  settings = { ...settings, unsafe: { ...settings.unsafe, [key]: next } }
  saveSettings(SETTINGS, settings)
  await openProject(current.root)
}

function showLog() {
  const text = current?.log.text() || '(sem saída ainda)'
  win.loadURL(page('Log do harness serve', `<h1>Log do harness serve</h1><pre>${esc(text)}</pre><p><kbd>Visualizar → Execução</kbd> volta ao painel.</p>`))
}

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const recents = settings.recents.filter((p) => isHarnessProject(p))
  const has = Boolean(current)
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Abrir projeto…', accelerator: 'CmdOrCtrl+O', click: pickProject },
        {
          label: 'Recentes',
          submenu: recents.length ? recents.map((p) => ({ label: p, click: () => openProject(p) })) : [{ label: '(nenhum)', enabled: false }]
        },
        { label: 'Fechar projeto', enabled: has, click: async () => {
          await closeProject()
          buildMenu()
          showWelcome()
        } },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: 'Sair' }
      ]
    },
    {
      label: 'Visualizar',
      submenu: [
        { label: 'Workspace', accelerator: 'CmdOrCtrl+1', enabled: has, click: () => go('/workspace') },
        { label: 'Quadro', accelerator: 'CmdOrCtrl+2', enabled: has, click: () => go('/') },
        { label: 'Analytics', accelerator: 'CmdOrCtrl+3', enabled: has, click: () => go('/analytics') },
        { label: 'Canvas (clássico)', accelerator: 'CmdOrCtrl+4', enabled: has, click: () => go('/canvas') },
        { type: 'separator' },
        { role: 'reload', label: 'Recarregar' },
        { role: 'toggleDevTools', label: 'Ferramentas de desenvolvedor' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Servidor',
      submenu: [
        { label: 'Reiniciar', enabled: has, click: () => openProject(current.root) },
        { label: 'Liberar unsafe neste projeto', type: 'checkbox', enabled: has, checked: Boolean(has && settings.unsafe[path.resolve(current.root)]), click: toggleUnsafe },
        { label: 'Abrir no navegador', enabled: has, click: () => shell.openExternal(new URL('/workspace', current.info.url).href) },
        { label: 'Copiar endereço da API', enabled: has, click: () => clipboard.writeText(current.info.url) },
        { label: 'Ver log', enabled: has, click: showLog }
      ]
    },
    { label: 'Ajuda', submenu: [{ label: 'Documentação (README)', click: () => shell.openExternal('https://github.com/antoniocsz/alter-ai-agentic-os#readme') }] }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  const bounds = settings.window ?? { width: 1360, height: 860 }
  win = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1117',
    title: 'AlterAI - Agentic OS',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(HERE, 'preload.cjs') }
  })
  // Só a origem do serve navega dentro da janela; links externos vão para o navegador.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (current && isInternalUrl(url, current.info.url)) {
      win.loadURL(url)
    } else if (/^https?:/.test(url)) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('data:')) return
    if (current && isInternalUrl(url, current.info.url)) return
    event.preventDefault()
    if (/^https?:/.test(url)) shell.openExternal(url)
  })
  win.on('close', () => {
    settings = { ...settings, window: win.getBounds() }
    saveSettings(SETTINGS, settings)
  })
  buildMenu()
}

// Ponte da página (task 142): só a página do serve aberto pode pedir; a pasta precisa ser projeto.
const fromServe = (event) => Boolean(current && event.senderFrame && isInternalUrl(event.senderFrame.url, current.info.url))
ipcMain.handle('harness:open-project', async (event, root) => {
  if (!fromServe(event)) return { ok: false, error: 'origem não autorizada' }
  const dir = validProjectRequest(root)
  if (!dir) return { ok: false, error: 'não é um projeto do harness' }
  setImmediate(() => openProject(dir))
  return { ok: true }
})
ipcMain.handle('harness:pick-project', async (event) => {
  if (!fromServe(event)) return { ok: false, error: 'origem não autorizada' }
  setImmediate(() => pickProject())
  return { ok: true }
})
ipcMain.handle('harness:recents', async (event) => {
  if (!fromServe(event)) return []
  return settings.recents.filter((p) => isHarnessProject(p))
})

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
    const dir = argv.slice(1).reverse().find((a) => isHarnessProject(a))
    if (dir) openProject(dir)
  })

  app.whenReady().then(() => {
    createWindow()
    // Projeto por argumento (npm start -- <pasta>) ou o último aberto.
    const fromArgs = process.argv.slice(app.isPackaged ? 1 : 2).find((a) => isHarnessProject(path.resolve(a)))
    const last = settings.recents.find((p) => isHarnessProject(p))
    const target = fromArgs ? path.resolve(fromArgs) : last
    if (target) openProject(target)
    else showWelcome()
  })

  let quitting = false
  app.on('before-quit', (event) => {
    if (quitting || !current) return
    event.preventDefault()
    quitting = true
    closeProject().finally(() => app.quit())
  })

  app.on('window-all-closed', () => app.quit())
}
