# Spec: orquestracao-paralela

> Fonte da verdade da feature. Task(s) referenciam esta spec via `## Feature: orquestracao-paralela`.
> Criada em 2026-11-23.

## Problema

`harness run` executa **uma** task por vez. Para o fluxo da visão "Agent Harness Canvas" — vários
agentes trabalhando em paralelo, cada um isolado na sua worktree — hoje o usuário precisa abrir N
terminais, rodar `start` + `worktree start` + `run` em cada um e acompanhar tudo à mão. Não há
noção de "lote": não dá para limitar a concorrência, interromper todos de uma vez nem ver o
resultado do conjunto.

## Comportamento esperado

- `harness run --batch 12,13,14 --tool claude [--max-parallel n] [--model m] [--unsafe]`:
  1. **Preparação** (sequencial, com o lock do pipeline): para cada task do lote, `start` se estiver
     na queue (DoR + conflito de escopo como hoje) e `worktree start` se ainda não tiver worktree.
     Task já ativa com worktree é reaproveitada. Qualquer recusa (DoR, conflito, dependência dentro
     do próprio lote, task em `done/`) **aborta o lote antes de executar qualquer agente**, listando
     o motivo por task — nada fica pela metade sem o usuário saber o que foi preparado.
  2. **Execução**: um `harness run` por task, em paralelo, até `--max-parallel` simultâneos
     (padrão: `wip.active` do `harness.json`). Cada agente roda na própria worktree.
  3. **Saída**: progresso com prefixo da task (`[12] 🔧 Bash …`) e, no fim, um resumo por task
     (run, status, duração, tokens, custo) + exit code 1 se alguma falhou.
- Cada run guarda o `batch_id`; `harness runs --batch <id>` lista o lote.
- Ctrl+C interrompe **todos** os runs do lote (árvores de processos) e os em espera não começam.
- O `/canvas` mostra o lote de cada cartão (id do lote) — o acompanhamento ao vivo já existe por task.
- Integração continua humana: o lote **não** roda `worktree finish`; o resumo indica o próximo comando.

## Critérios de aceitação

- [x] AC-1 — `run --batch` prepara (start + worktree start) e valida o lote inteiro antes de executar; qualquer recusa aborta sem iniciar agentes e lista o motivo por task.
- [x] AC-2 — Execução em paralelo limitada por `--max-parallel` (padrão `wip.active`); nunca mais que N processos de agente simultâneos.
- [x] AC-3 — Cada run do lote grava `batch_id`; `harness runs --batch <id> [--json]` lista o lote.
- [x] AC-4 — Resumo final por task e exit code ≠ 0 quando algum run falha; falha de um não interrompe os outros.
- [x] AC-5 — Ctrl+C (AbortSignal) interrompe todos os runs em andamento e cancela os pendentes; todos ficam `failed` (`interrupted`) ou não iniciados.
- [x] AC-6 — `/canvas` e `GET /api/canvas` expõem o `batch_id` do run do cartão.
- [x] AC-7 — Zero dependências novas; testes com executáveis falsos (sem tools reais).

## Estado (2026-11-23)

- Entregue nas tasks 100 (núcleo: `run --batch`, `batch_id`), 101 (`runs --batch`, lote no
  /canvas) e 102 (docs).
- Validado com um runtime falso que registra início/fim (concorrência medida), falha isolada,
  interrupção e CLI ponta a ponta. **Pendente:** lote com as tools reais instaladas.
- Desvio do plano: o DoR completo e dependências externas são checados pelo `start` (não
  duplicados na validação do lote) — a preparação pode parar no meio, com relatório do que
  ficou pronto.



- Ondas por dependência (task B do lote esperar a integração de A) — exige integração automática.
- Integração automática (`worktree finish` em sequência após sucesso).
- Tool/modelo por task no mesmo lote (todas usam o `--tool` do comando).
- Retentativas automáticas.
