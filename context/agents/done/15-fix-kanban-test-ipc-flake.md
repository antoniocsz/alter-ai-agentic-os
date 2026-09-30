# Task: Corrigir flake do kanban.test.js no CI (erro de deserialização do test runner do Node)

## Agente: `backend`
## Módulo: `harness/tests`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/tests/kanban.test.js`
- `scripts/harness/tests/helpers.js`
## Depende de: [ ] —
## Contexto para ler: AGENTS.md (protocolo); `.agents/backend.md`; `.agents/codegen.md`; diagnóstico completo no handoff do lote
## O que já existe: kanban.test.js com 8 testes, dos quais 3 emitem burst de stdout com emoji no processo filho do test runner:
- `kanbanFor estático` → `process.stdout.write('✅ kanban gerado em ...')`
- `servidor kanban: prefixo ambíguo ...` e `servidor kanban: WIP bloqueia ...` → banner `📋 kanban em http://localhost:...` no callback de `server.listen` de `serveBoard`

## Problema (causa raiz)
O CI falha intermitentemente em `kanban.test.js` com:
```
Error: Unable to deserialize cloned data due to invalid or unsupported version.
    at #processRawBuffer (node:internal/test_runner/runner:392:20)
```
É o bug aberto do Node `nodejs/node#56802`: `node --test` roda cada arquivo num
subprocess e reencaminha o stdout capturado ao runner pelo **mesmo canal IPC
v8-serializado**. Um burst de stdout (especialmente com emoji multi-byte) faz o
`#processRawBuffer` do parent quebrar o framing do buffer → o resultado do arquivo
se perde (falha em `1:1`, intermitente, pior em runners de CI). Não é problema de
worker threads nem de versão do Node (bug ainda aberto no 24.x).

## O que fazer
1. Adicionar em `helpers.js` um helper `withSilentStdout(fn)` que troca
   `process.stdout.write` por no-op durante a execução do corpo (incluindo gap
   async — cobrir escrita do listen callback) e restaura no `finally`.
2. Envolver os 3 testes ruidosos de `kanban.test.js` com `withSilentStdout`.
   Os testes assertam valores de retorno/estado do servidor, nunca o banner —
   nada fica escondido.
3. NÃO alterar o produto (`kanban.js`): os banners são output correto do CLI real.
4. NÃO trocar o script de testes para `--test-isolation=none` (perde isolamento
   por arquivo; um crash derruba a suíte inteira) nem `--no-worker-threads`
   (flag inexistente no Node).

## Critério de conclusão:
- [ ] `helpers.js` exporta `withSilentStdout`
- [ ] 3 testes ruidosos de `kanban.test.js` envolvidos por `withSilentStdout`
- [ ] `node --test "scripts/harness/tests/*.test.js"` → 69/69 passando
- [ ] `pnpm harness check` limpo
- [ ] Nenhuma mudança fora do `## Escopo`

## Ao terminar: rodar `pnpm harness finish 15-fix-kanban-test-ipc-flake.md`
## Complexidade: baixa
## Baseline (git)
- context/agents/queue/15-fix-kanban-test-ipc-flake.md
