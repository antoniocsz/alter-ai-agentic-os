# Spec: pacote-de-contexto

> Fonte da verdade da feature. Task(s) referenciam esta spec via `## Feature: pacote-de-contexto`.
> Criada em 2026-11-23.

## Problema

O `harness run` envia ao agente só a task e as regras fixas. Cada agente redescobre o projeto
sozinho — lê o `status.md` inteiro (50 KB no harness), procura ADRs, refaz investigações que outra
task já documentou — gastando tokens e tempo, e às vezes ignorando decisões registradas. Falta um
**pacote de contexto compacto e determinístico** por task, com orçamento de tokens, que o run
entregue pronto (o "Context Intelligence Engine" da visão).

## Comportamento esperado

- `harness context <task> [--budget <tokens>] [--json | --out <arquivo>]` monta o pacote a partir do
  que a própria task declara, em seções com prioridade:
  1. **task** (sempre, inteira)
  2. **regras** — "Regras inegociáveis" e "Guard Rails" do `AGENTS.md`
  3. **feature** — `spec.md` da feature declarada em `## Feature`
  4. **módulo** — `context.md` do módulo e os **3 handoffs mais recentes** do `status.md`
  5. **dependências** — handoff registrado (banco) de cada task em `## Depende de`
  6. **skills** — arquivos de `.agents/` citados em `## Skills a carregar`
  7. **ADRs** — ADRs citados no texto da task (`ADR-00N`)
  8. **escopo** — por arquivo: existe?, tamanho, último commit que o tocou (sem conteúdo)
  9. **histórico** — últimos commits que tocaram o escopo
- Cada seção traz `tokens` **estimados** (caracteres/4, sempre rotulados como estimativa).
- Com `--budget`, seções de menor prioridade saem inteiras (a task nunca sai); o pacote lista o que
  ficou de fora e por quê.
- `harness run` e `run --batch` passam a anexar o pacote ao prompt (padrão: orçamento de
  `harness.json → context.budget`, ou 8000), com `--no-context` para desligar e `--context-budget n`.
  O tamanho do pacote fica registrado no histórico da task.

## Critérios de aceitação

- [ ] AC-1 — `harness context <task>` monta as seções na ordem de prioridade, só com o que existe (seção ausente não aparece).
- [ ] AC-2 — Estimativa de tokens por seção e total, rotulada como estimada.
- [ ] AC-3 — `--budget` remove seções de menor prioridade inteiras, nunca a task, e lista as omitidas.
- [ ] AC-4 — Do `status.md` entram só os 3 handoffs mais recentes; das dependências, o handoff registrado no banco.
- [ ] AC-5 — `--json` e `--out` (markdown) para consumo por outras ferramentas.
- [ ] AC-6 — `run`/`run --batch` anexam o pacote (padrão ligado, `--no-context`, `--context-budget`, `context.budget` no `harness.json` validado) e registram o tamanho no histórico da task.
- [ ] AC-7 — Zero dependências novas; segredos passam por redaction; funciona sem banco e sem git (seções dependentes somem).

## Fora de escopo

- Busca semântica/embeddings e resumo por LLM (só seleção determinística).
- Tokenização exata por modelo.
- Conteúdo dos arquivos do escopo no pacote (o agente lê o que precisar).
