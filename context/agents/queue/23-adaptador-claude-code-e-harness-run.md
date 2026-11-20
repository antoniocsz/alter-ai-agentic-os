# Task: Adaptador Claude Code + harness run
## Agente: `backend`
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/runtimes/adapters/claude-code.js`
- `scripts/harness/src/run.js`
- `scripts/harness/bin/harness.js`
- `scripts/harness/tests/run.test.js`
- `scripts/harness/tests/fixtures/claude-code`
## Depende de: [ ] `21-worktree-por-task.md`, `22-contrato-de-runtime-adapters.md`
## Contexto para ler: ARCHITECTURE.md (seções 4.1–4.3), documentação oficial do Claude Code (modo não interativo e saída JSON em streaming)
## Skills a carregar: codegen.md + backend.md + security.md
## O que já existe: contrato de adapter (task 22), eventos (task 20), worktrees (task 21).
## O que criar:
- `claude-code.js` → `run()` real: processo filho não interativo com saída JSON em streaming, parse linha a linha, normalização para `agent.*` preservando o evento original em `native`; uso de tokens como `agent.usage` com `measured: true`
- `src/run.js` → `harness run <task> --runtime claude-code [--model <m>] [--permission-mode <modo>]`: exige task ativa com `## Worktree`, monta o prompt a partir do arquivo da task, executa **dentro da worktree**, grava todos os eventos e mostra progresso resumido
## Especificação:
- Flags exatas do CLI conferidas na documentação na hora da implementação (registrar fonte no adaptador).
- Permissões: padrão é o modo mais restritivo suportado; nada de "pular permissões" sem flag explícita do usuário.
- Ctrl+C interrompe o processo filho e emite `agent.failed` com motivo `interrupted`.
- Linha que não for JSON válido vira `agent.message` com `native` bruto — nunca é descartada.
- Testes usam um executável falso que reproduz uma transcrição gravada em `tests/fixtures/claude-code/`.
## Critério de conclusão:
- [ ] Transcrição gravada → eventos normalizados esperados, incluindo `agent.usage` medido (teste)
- [ ] Linha inválida preservada como `agent.message` (teste)
- [ ] `run` recusa task sem worktree (teste)
- [ ] Execução manual real numa task de exemplo, com eventos visíveis em `harness events --task <t>` (relatar no handoff)
- [ ] `pnpm test` 100% e `pnpm harness check` limpo
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 23-adaptador-claude-code-e-harness-run.md`
## Complexidade: alta
