# Task: iniciador do app (atalho com icone) e readme
## Agente: `frontend`
## Módulo: `harness`
## Feature: iniciador-app
## Prioridade: P1
## Tipo: feat
## ACs: AC-1, AC-2, AC-3
## Escopo (arquivos que esta task vai tocar):
- `apps/desktop/src/shortcut.js`
- `apps/desktop/build/icon.ico`
- `apps/desktop/build/icon.png`
- `apps/desktop/package.json`
- `apps/desktop/src/main.js`
- `apps/desktop/README.md`
- `README.md`
- `scripts/harness/tests/desktop-shortcut.test.js`
- `context/modules/harness/status.md`
- `context/features/iniciador-app/spec.md`
- `context/features/iniciador-app/plan.md`
## Depende de: [x] `143`
## Contexto para ler: context/modules/harness/context.md
## Skills a carregar: codegen.md + frontend.md
## O que já existe: app abre só com `npm start`; ícone padrão do Electron; README sem apresentação atual.
## O que criar:
- `apps/desktop/src/shortcut.js` → `npm run atalho` (atalhos com ícone, sem terminal)
- `apps/desktop/build/icon.{ico,png}` → ícone do app e do instalador
## Especificação: ver context/features/iniciador-app/spec.md (AC-1..AC-3).
## Critério de conclusão:
- [ ] `npm run atalho` documentado e coberto por testes; ícone no app e no instalador
- [ ] `node --test scripts/harness/tests/*.test.js` passando
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 144-iniciador-do-app-atalho-com-icone-e-readme.md`
## Complexidade: baixa

## Baseline (git)
- apps/desktop/package-lock.json
- context/features/iniciador-app/plan.md
- context/features/iniciador-app/spec.md
- tasks/queue/144-iniciador-do-app-atalho-com-icone-e-readme.md
