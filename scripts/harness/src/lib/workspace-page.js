/**
 * Workspace (feature `workspace-app`, task 140): a tela principal do app — barra lateral por
 * estado (precisa de você / rodando / paradas / fila), conversa com o agente no centro e o painel
 * de mudanças/gates/execução à direita. Página estática + JS do cliente em `workspace-page.html`; os
 * dados vêm da API local (`/api/canvas`, `/api/board`, `/api/conversation`, `/api/changes`,
 * `/api/runs`, `/api/flows`). Controles (enviar, parar, aprovar) só no `harness serve`.
 */
import fs from 'node:fs'

const TEMPLATE = fs.readFileSync(new URL('./workspace-page.html', import.meta.url), 'utf8')

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function renderWorkspacePage(title = 'AlterAI - Agentic OS', opts = {}) {
  // JSON dentro de <script>: `<` escapado não fecha a tag com dados.
  const cfg = JSON.stringify({
    control: Boolean(opts.control),
    token: opts.control ? String(opts.token ?? '') : '',
    allowUnsafe: Boolean(opts.control && opts.allowUnsafe)
  }).replace(/</g, '\\u003c')
  return TEMPLATE.split('__TITLE__').join(escHtml(title)).replace('__CONFIG__', () => cfg)
}
