// Ponte do app desktop para o Workspace (feature seletor-projetos, task 142). Roda isolada
// (contextIsolation + sandbox) e expõe só três chamadas; o processo principal confere a origem
// de quem chamou (só a página do harness serve aberto) e se a pasta é um projeto do harness.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('harnessDesktop', {
  openProject: (root) => ipcRenderer.invoke('harness:open-project', String(root ?? '')),
  pickProject: () => ipcRenderer.invoke('harness:pick-project'),
  recents: () => ipcRenderer.invoke('harness:recents')
})
