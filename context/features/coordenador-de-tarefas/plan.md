# Plano: coordenador-de-tarefas

> Decisões técnicas da feature (derivado da spec). Criado em 2026-11-25.

## Abordagem

- `lib/coordinator.js` (novo): prompt do coordenador, `parsePlanBlock`, `validatePlan`, `waves`,
  `generatePlan` (runTool só leitura + guarda), `editPlan`, `rejectPlan`, `approvePlan`
  (`createTaskFile` + preenchimento das seções), `planProgress`.
- `lib/plans-schema.js` (novo): tabela `plans` (migrada pelo `db.js`, sem ciclo de imports).
- `src/coordinate.js` (novo): CLI; `next` reaproveita `startTask`, `startWorktree`, `prepareRun`,
  `runTool`, `createFlow`/`runFlow`.

## Módulos e arquivos afetados

- novos: `lib/coordinator.js`, `lib/plans-schema.js`, `src/coordinate.js`, `tests/coordinator.test.js`
- `lib/db.js`, `commands/index.js`, fixture `fake-flow-agent.js`; `README.md`, `AGENTS.md`

## Ordem de tasks

1. `137` — coordenador (plano, validação, aprovação, ondas). depende de: —
2. `138` — docs. depende de: 137

## Riscos

- Plano ruim do agente → validação estrita + edição + aprovação humana.
- Escopo mal estimado pelo coordenador → o `finish` continua validando o escopo real.
