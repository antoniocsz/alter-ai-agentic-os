# Spec: coordenador-de-tarefas

> Fonte da verdade da feature. Task(s) referenciam esta spec via `## Feature: coordenador-de-tarefas`.
> Criada em 2026-11-25.

## Problema

Decompor uma feature em tasks (escopo, dependências, ACs) é feito à mão. A visão do produto pede
orquestração hierárquica: um coordenador recebe o objetivo, decompõe, distribui e acompanha — com
o humano aprovando o plano.

## Comportamento esperado

- `harness coordinate plan <feature> --tool <t>`: um agente coordenador (só leitura) lê spec, plano
  técnico, tasks existentes e arquivos do repositório e devolve um plano JSON entre `--- PLANO ---` e
  `--- FIM ---`; o harness valida e guarda como proposto.
- Validação: escopo (arquivos exatos, dentro do repo), dependências conhecidas e sem ciclo, ids
  únicos, critérios; tasks independentes não podem compartilhar arquivos. Avisos de cobertura de ACs.
- `show` (ondas), `edit --file` (revalida), `approve [--only]` (cria as tasks com dependências e
  seções preenchidas), `reject`, `list`, `status`.
- `next <plano> --tool <t> [--review <t>]`: tasks prontas (dependências em done) → start + worktree +
  run ou fluxo, em paralelo; integração humana com `worktree finish`.

## Critérios de aceitação

- [x] AC-1 — Plano gerado por agente só leitura, bloco parseável, guardas (alteração, sem bloco).
- [x] AC-2 — Validação de escopo/dependências/ciclos/critérios e avisos de ACs; ondas.
- [x] AC-3 — Aprovação cria tasks prontas para o DoR, ligadas por `Depende de`; `--only`; edição.
- [x] AC-4 — `next` executa a onda pronta (run ou fluxo) e `status` mostra o andamento.
- [x] AC-5 — Zero dependências novas; testes com agente falso.

## Estado (2026-11-25)

- Entregue nas tasks 137 (coordenador) e 138 (docs).
- Validado com agente falso: plano válido, edição, aprovação (tasks passam no DoR), onda com
  fluxo implementar → revisar, status, onda seguinte; guardas (escrita, sem bloco, escopos
  sobrepostos, --only incompleto, rejeição).
- Pendente: qualidade do plano com o Claude real; painel do coordenador no canvas.
- Decisões: coordenador só propõe; integração continua humana.

## Fora de escopo

- Integração automática (`worktree finish`) sem humano.
- Replanejamento automático quando uma task falha.
- Painel do coordenador no canvas (próxima etapa).
