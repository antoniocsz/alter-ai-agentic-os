# Task: Execução de agentes — runner + driver Claude Code (`harness run --tool claude`)
## Agente: `backend` | Módulo: `harness` | Prioridade: P1 | Tipo: feat
## Módulo: `harness`
## Feature: execucao-agentes
## ACs: AC-2, AC-3, AC-4, AC-5, AC-8
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/runner.js`
- `scripts/harness/src/lib/runtimes/claude.js`
- `scripts/harness/src/run.js`
- `scripts/harness/src/commands/index.js`
- `scripts/harness/tests/run-claude.test.js`
- `scripts/harness/tests/fixtures/runtimes`

Anotações do escopo: tudo novo exceto `commands/index.js` (só registra `run`). Fixtures: executável falso + transcrição JSONL gravada.
## Depende de: 93
## Contexto para ler: context/features/execucao-agentes/spec.md · context/features/execucao-agentes/plan.md · scripts/harness/src/lib/runs.js (task 93) · scripts/harness/src/lib/worktree.js · scripts/harness/src/lib/gates.js (padrão de spawn no Windows) · scripts/harness/src/lib/adapters.js (perfis de sandbox) · https://code.claude.com/docs/en/headless
## Skills a carregar: codegen.md + security.md
## O que já existe:
- Registro de runs/eventos (task 93); worktree por task com registro em `.harness/worktrees.json`
- Perfis de sandbox por tool instalados em `.claude/settings.json` (task 87)
- NÃO rodar via `pnpm harness` nesta máquina — usar `node scripts/harness/bin/harness.js ...`; zero deps
## O que criar:
- `lib/runner.js` → `runTool(root, task, driver, opts)`: resolve executável (POSIX direto; Windows `.cmd/.exe` no PATH com `shell: true` e args validados), spawn com `cwd` = worktree da task, lê stdout por linha (buffer parcial), `driver.normalize(obj)` → `appendRunEvent`; linha não-JSON → `agent.message` com `native` bruto; stderr agregado no `error` se exit ≠ 0; SIGINT/`stop` mata a árvore (`taskkill /T /F` no Windows)
- `lib/runtimes/claude.js` → `command(prompt, opts)` = `claude -p <prompt> --output-format stream-json --verbose [--model m] [--permission-mode <modo>]`; `normalize`: `system/init` → `run.started` (+session_id, model), `assistant` text → `agent.message`, `tool_use` → `agent.tool_call`, `user/tool_result` → `agent.tool_result`, Edit/Write tool_use → `agent.file_changed` (path), `result` → `agent.usage` (`usage.input_tokens/output_tokens`, `total_cost_usd`, `measured: true`) + status
- `src/run.js` → `harness run <task> --tool claude [--model m] [--permission-mode default|acceptEdits|plan] [--unsafe]` e `harness run --stop <run>`; prompt = task completa + bloco do protocolo (escopo estrito, não rodar finish/merge, terminar com resumo); progresso resumido no terminal
## Especificação:
- Recusas (AC-3): task não ativa; task sem worktree registrada/existente; `claude` não encontrado no PATH (mensagem com o comando de instalação, sem simular)
- Permissão padrão = `default` (pede aprovação → em modo -p falha a ferramenta não permitida, o que é o comportamento seguro); `--unsafe` é o único caminho para `bypassPermissions` e fica gravado no run
- Prompt nunca interpolado em string de shell; no Windows passar via arquivo temporário/stdin se o tamanho ou caracteres exigirem
- Conferir as flags na doc oficial na hora da implementação e registrar URL + data em comentário no driver
## Critério de conclusão:
- [ ] Transcrição gravada → sequência de eventos normalizados esperada, com `agent.usage` medido e custo — teste
- [ ] Linha inválida preservada como `agent.message` — teste
- [ ] Recusa sem worktree / tool ausente — teste
- [ ] Interrupção encerra o processo falso e registra `run.failed` (`interrupted`) — teste
- [ ] Execução REAL numa task de exemplo (projeto temporário) com `harness events <run>` anexado ao handoff
- [ ] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 94`
## Complexidade: alta
