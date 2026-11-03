# {{NAME}}

CLI em Node.js (perfil **cli**).

## Estrutura

- `bin/cli.js` — entry point executável
- `src/index.js` — lógica (exporta `run`)
- `tests/` — testes com `node --test`

## Comandos

```bash
pnpm test          # testes
pnpm start -- --help
pnpm harness status
```

## Contexto

- `context/project/` — overview, stack, ADRs
- `context/features/<slug>/spec.md` — spec da feature
- `tasks/` — pipeline
