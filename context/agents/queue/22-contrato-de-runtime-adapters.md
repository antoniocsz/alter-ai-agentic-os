# Task: Contrato de runtime adapters + registro + harness runtimes
## Agente: `backend`
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/runtimes/adapter.js`
- `scripts/harness/src/lib/runtimes/registry.js`
- `scripts/harness/src/lib/runtimes/adapters`
- `scripts/harness/src/runtimes.js`
- `scripts/harness/tests/runtimes.test.js`
## Depende de: [ ] `20-barramento-de-eventos-normalizado.md`
## Contexto para ler: ARCHITECTURE.md (seção 4.2), ADR-006
## Skills a carregar: codegen.md + backend.md
## O que já existe: nada — agentes rodam fora do harness.
## O que criar:
- `adapter.js` → validação do contrato (`id`, `detect`, `capabilities`, `run`, `interrupt`) e lista fechada de capabilities
- `registry.js` → registra adaptadores, `detectAll()` com timeout por runtime
- `adapters/{claude-code,codex,gemini,opencode}.js` → **só `detect` e `capabilities`** nesta task (versão via `--version`); `run` lança erro explícito "não implementado" — nunca simula
- `src/runtimes.js` → `harness runtimes [--json]`: tabela runtime / instalado / versão / capacidades
## Especificação:
- Antes de declarar capabilities, conferir na documentação oficial de cada CLI os modos não interativos e de saída estruturada; registrar a fonte (URL + data) em comentário no adaptador.
- Detecção usa `PATH` + `--version` com timeout; runtime ausente aparece como "não instalado", sem erro.
- Testes usam executáveis falsos em diretório temporário no `PATH` (não dependem de runtimes instalados).
## Critério de conclusão:
- [ ] Adaptador fora do contrato é rejeitado no registro (teste)
- [ ] `harness runtimes --json` detecta executável falso e reporta ausente quando não existe (teste)
- [ ] `run` não implementado falha com mensagem clara (teste)
- [ ] `pnpm test` 100% e `pnpm harness check` limpo
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 22-contrato-de-runtime-adapters.md`
## Complexidade: média
