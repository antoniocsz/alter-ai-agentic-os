# Plano: pacote-de-contexto

> Decisões técnicas da feature (derivado da spec). Criado em 2026-11-23.

## Abordagem

- `lib/context.js` (novo): `buildContextPackage(root, taskName, { budget })` → `{ task, sections:
  [{ id, title, priority, source, content, tokens }], omitted: [{ id, title, tokens, reason }],
  total_tokens, estimated: true }` + `renderContextMarkdown(pkg)`. Leitura só de arquivos do
  projeto e do banco (`tryOpenDb`) e `git log` com timeout; tudo opcional (degradação).
- Extração do `AGENTS.md` por heading (`## Regras inegociáveis…`, `## Guard Rails…`).
- Handoffs do `status.md`: blocos `## Handoff (...)` — os 3 últimos na ordem do arquivo.
- Dependências: `interactions` com `content LIKE 'handoff:%'` da task dependente (último).
- Skills: tokens `x.md` em `## Skills a carregar` → `.agents/x.md`.
- `src/context.js` (novo): comando; `run.js` chama `buildContextPackage` e anexa
  `renderContextMarkdown` ao prompt; `config.js` valida `context.budget` (inteiro ≥ 0; 0 = sem pacote).

## Módulos e arquivos afetados

- `scripts/harness/src/lib/context.js`, `scripts/harness/src/context.js` — novos
- `scripts/harness/src/commands/index.js` — registro
- `scripts/harness/src/run.js`, `scripts/harness/src/lib/config.js` — integração
- `README.md`, `AGENTS.md` — docs

## Ordem de tasks

1. `103` — `lib/context.js` + `harness context`. depende de: —
2. `104` — run/run --batch anexam o pacote + `context.budget`. depende de: 103
3. `105` — docs. depende de: 104

## Riscos

- Pacote grande demais no prompt → orçamento padrão conservador e corte por prioridade.
- Heading do AGENTS.md renomeado num projeto → seção "regras" simplesmente some (o prompt do run já
  manda ler o AGENTS.md).
