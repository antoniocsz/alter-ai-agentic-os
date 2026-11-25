# Spec: execucao-competitiva

> Fonte da verdade da feature. Task(s) referenciam esta spec via `## Feature: execucao-competitiva`.
> Criada em 2026-11-25.

## Problema

Para uma task difícil, não dá para saber de antemão qual tool ou modelo resolve melhor. A visão do
produto pede execução competitiva: vários agentes propõem soluções independentes e o humano
compara e escolhe. O harness só roda um agente por task (run, lote, fluxo).

## Comportamento esperado

- `harness compete <task> --tools <t1[:modelo],t2,...> [--judge <tool[:modelo]>] [--max-parallel n]`
  cria uma worktree por candidata a partir do HEAD da worktree da task (que precisa estar limpa) e
  roda as candidatas em paralelo, cada uma como run normal (mesmas regras do `harness run`).
- Comparação por candidata: status, arquivos/linhas alterados, tokens, custo, tempo e arquivos fora
  do escopo da task.
- Juiz opcional: recebe o diff de cada candidata, só lê (alterar a worktree descarta a
  recomendação) e responde `VENCEDOR: <candidata>` ou `VENCEDOR: NENHUM`. Só recomenda.
- `pick <comp> <candidata>` aplica a escolhida (squash, sem commit) na worktree da task e remove
  todas as worktrees/branches de candidatas; `discard` remove tudo sem aplicar; `show`/`list`.
- Uma competição aberta por task; não convive com fluxo aberto ou run em andamento na task.
- Painel (`harness serve`): iniciar (até 3 candidatas + juiz), comparar, escolher e descartar; API
  `/api/competitions`.

## Critérios de aceitação

- [ ] AC-1 — Candidatas em worktrees próprias a partir da worktree da task, em paralelo (`--max-parallel`), cada uma um run.
- [ ] AC-2 — Comparação: status, tamanho, uso, custo, tempo e fora do escopo; `show` em tabela e `--json`.
- [ ] AC-3 — Juiz opcional só leitura com recomendação parseável.
- [ ] AC-4 — `pick` aplica na worktree da task e limpa; `discard` limpa; candidata com falha não pode ser escolhida.
- [ ] AC-5 — API `/api/competitions` e canvas (iniciar, comparar, escolher, descartar).
- [ ] AC-6 — Zero dependências novas; testes com agente falso.

## Fora de escopo

- Gates (teste/lint) por candidata antes da escolha.
- Mesclar partes de candidatas diferentes.
