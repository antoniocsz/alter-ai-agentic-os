# Task: `harness update` sincroniza adapters instalados
## Agente: `backend` | Módulo: `harness` | Prioridade: P2 | Tipo: feat
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/update.js`
- `scripts/harness/src/adapter.js`
- `scripts/harness/src/lib/adapters.js`
- `scripts/harness/tests/update-adapters.test.js`

Anotações do escopo: `adapter.js` para gravar o marcador de adapters instalados; `update.js` para sincronizar adapters conforme o marcador; o teste novo cobre ambas.

## Depende de: —

## Contexto para ler: context/modules/harness/context.md · context/modules/harness/status.md (handoffs 82–88) · scripts/harness/src/update.js · scripts/harness/src/adapter.js · context/features/sandbox-por-tool/spec.md
## Skills a carregar: codegen.md
## O que já existe (ciclo Superfik):
- `harness update` sincroniza AGENTS.md/`.agents`/`.opencode`/`scripts/harness` (fonte HARNESS_SOURCE), com backup do AGENTS.md — mas NÃO copia `adapters/`
- `harness adapter <tool>` instala a camada da tool no projeto; pós-task 87 a fonte dos agents opencode mora em `adapters/opencode/.opencode/agent/` (espelhos byte-faithful com placeholder `{{SANDBOX_DENY}}`); claude/codex/browser também têm templates em `adapters/<tool>/`
- Débito listado no handoff da 87: projeto que adotou sandbox/browser/adapter fica desatualizado após `update` (fallback silencioso mascara)
- Suíte baseline: 198+ (conforme ciclo); NÃO rodar via `pnpm harness` nesta máquina — usar `node scripts/harness/bin/harness.js ...`; zero deps
## O que criar:
- `.harness/adapters.json` (gitignored) gravado pelo `adapter <tool>` com `{ "tools": ["opencode", ...], "sandbox": "minimal|strict|null" }` (merge, nunca substitui entrada de outros adapters)
- `harness update`: após a cópia padrão da camada, para cada tool no marcador re-executa a instalação do adapter (mesma `installAdapter`, respeitando o perfil sandbox salvo) — idempotente
- Projetos sem `.harness/adapters.json` → comportamento atual (sem sync de adapters) (nenhum update de adapters)
- Se `HARNESS_SOURCE` apontar para fonte sem `adapters/` → aviso claro e skip (não erro)
- O update NÃO toca README/documentação (docs do update ficam para a task 89+) — nada de fase "docs" aqui
## Especificação:
- Reuso do `installAdapter` (fonte única da verdade por tool) — sem duplicar lógica de template
- Teste: projeto tmp com adapter opencode instalado + fonte atualizada → `update` reflete os novos templates nos arquivos-alvo do projeto
## Critério de conclusão:
- [ ] Marcador escrito/Atualizado por `adapter <tool>` (add/removal idempotente)
- [ ] `update` sincroniza adapters do marcador e é no-op sem marcador
- [ ] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 91`
## Complexidade: média
## Baseline (git): main pós-lote 2 do ciclo Superfik (2026-11-10)

## Baseline (git)
- tasks/queue/88-backend-rotinas-ui.md
- tasks/active/88-backend-rotinas-ui.md
