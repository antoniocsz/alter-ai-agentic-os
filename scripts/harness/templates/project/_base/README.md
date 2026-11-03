# {{NAME}}

Projeto inicializado com o harness — perfil **{{PROFILE}}**.

## Começar

```bash
# se o perfil tiver package.json:
pnpm install

pnpm harness status        # WIP + próximas tasks
pnpm harness task "<desc>" # planejar
pnpm harness start <n>     # iniciar (valida escopo)
pnpm harness finish <n>    # concluir (gates do perfil)
pnpm harness kanban --serve
```

## Contexto e memória local

- `context/project/` — overview, stack e ADRs (identidade do projeto)
- `context/project/runbook.md` — ambientes, deploy, rollback, migrations e backup
- `context/features/<slug>/spec.md` — spec da feature (fonte da verdade)
- `context/modules/<m>/` — contexto e status por módulo (perfis com código)
- `context/sessions/` — resumos de sessão (memória local)
- `tasks/queue|active|done/` — pipeline de tasks
- `harness.json` — perfil, gates e WIP

## Fluxo

```
spec → tasks/queue → start → execução → finish (gates) → done
```

## Arquivos temporários

Artefatos temporários (rascunhos, dumps, builds de teste, experimentos) devem ser criados
dentro de `.tmp/` (gitignored) e **removidos ao terminar a tarefa**. Nada de lixo permanente
no repositório ou no workspace.
