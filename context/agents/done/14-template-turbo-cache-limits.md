# Task: Adicionar limites de cache ao turbo.json do template de projetos
## Agente: `coordinator` (infra/config — alteração direta no template do harness)
## Módulo: `harness/templates/project`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/templates/project/turbo.json`
## Depende de: [ ] —
## Contexto para ler: AGENTS.md (protocolo); docs Turborepo (cacheMaxAge/cacheMaxSize top-level)
## Skills a carregar: codegen.md
## O que já existe: turbo.json do template com `$schema`, `tasks` (build/test/typecheck/lint/dev) e sem limites de cache — cache local do Turbo pode crescer sem limite e consumir todo o armazenamento do dev.
## O que criar:
- Adicionar ao `turbo.json` do template (top-level, ao lado de `tasks`):
  - `"cacheMaxAge": "5m"` → evita entradas de cache mais velhas que 5 minutos
  - `"cacheMaxSize": "500MB"` → evita cache total maior que 500MB (evicção LRU)
## Especificação:
- Chaves top-level válidas no schema do Turborepo 2.x (`$schema` já referenciado no arquivo).
- Eviction roda em background thread no início de cada `turbo run`; TTL primeiro (age), depois LRU (size).
- Não alterar `tasks` existentes.
- Valores conforme pedido pelo usuário: `5m` (duração) e `500MB` (tamanho).
## Critério de conclusão:
- [ ] `turbo.json` do template contém `cacheMaxAge` e `cacheMaxSize` como top-level
- [ ] `tasks` existentes intactas
- [ ] JSON válido (parse ok)
- [ ] `pnpm harness check` limpo
## Ao terminar: rodar `pnpm harness finish 14-template-turbo-cache-limits.md`
## Complexidade: baixa
## Baseline (git)
- context/agents/queue/14-template-turbo-cache-limits.md
