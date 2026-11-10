# Spec: sandbox-por-tool

> Fonte da verdade da feature. Task(s) referenciam esta spec via `## Feature: sandbox-por-tool`.
> Criado em 2026-11-09.

## Problema

O harness reforça isolamento nos níveis de **escopo** (`## Escopo` validado), **git** (worktree + gates) e **pipeline** — mas as tools têm sistemas de permissão próprios que hoje ficam: Claude recebe um settings.json com negações parciais; OpenCode usa `permission:` só no reviewer; Codex nem referencia sandbox. Sem perfis declarados e explícitos por tool, um subagent pode executar comandos destrutivos fora do pipeline (`git reset`, `git push`, `rm -rf`, `sudo`) e nada além da convenção do AGENTS.md impede.

## Comportamento esperado

- **Dois perfis declarados** no adaptador (escolhidos via flag, default `minimal`):
  - `minimal` (default): negação de comandos destrutivos em git e filesystem — `git reset*`, `git checkout*`, `git restore*`, `git clean*`, `git push*`, `rm -rf*`, `sudo *` — sempre **permitido explícito** de `pnpm harness *` / `node scripts/harness/**` (o pipeline usa git internamente via node e não pode quebrar).
  - `strict`: estende minimal com `pnpm install*`, `npm install*`, `expo install*`, `curl *`, `wget *` (instalação de deps e rede exigem consentimento humano — guard rails 4 e 9).
- `harness adapter claude [--sandbox strict|minimal]` → `.claude/settings.json` com `allow`/`deny` coerentes com o perfil; `adapter opencode` → frontmatter `permission:` dos agents prontos alinhado (executores não tocam em comandos de reset; reviewer mantém `edit: deny`; permissão adicionais aplicadas só onde a tool suporta); `adapter codex` → seção documentada de sandbox nos prompts/arquivos gerados, com o que o Codex não consegue reforçar.
- `.agents/sandbox.md` (fonte entregue nos projetos): **matriz por tool** do que é garantido pelo harness vs pela tool, tabela de comandos sempre permitidos/bloqueados; critério de evolução do perfil (mudar deny = ADR).
- `harness adapter list` mostra o perfil aplicado por tool.
- Default sem quebrar fluxo atual: worktree finish (via harness CLI) funciona em todos os perfis.

## Critérios de aceitação

- [ ] AC-1 — `harness adapter claude` escreve `.claude/settings.json` com deny patterns do perfil minimal (git destrutivos, `rm -rf`, `sudo`) e allow explícito de `pnpm harness*`/`node scripts/harness*`.
- [ ] AC-2 — `--sandbox strict` estende o perfil com negações de instalador (`pnpm/npm/expo install*`) e rede (`curl*`/`wget*`); default do comando é `minimal` e está documentado.
- [ ] AC-3 — `harness adapter opencode` gera agents com `permission:` alinhado ao perfil (reviewer `edit: deny` preservado; executors sem permissão de git destrutivo quando a tool permite declarar).
- [ ] AC-4 — `harness adapter codex` entrega a seção sandbox documentada (do que a tool reforça e do que não) nos arquivos gerados.
- [ ] AC-5 — `.agents/sandbox.md` existe na fonte, é entregue em `init`/`update` e contém a matriz por tool + política de evolução via ADR.
- [ ] AC-6 — `pnpm harness worktree finish <task>` e `node scripts/harness/**` não são bloqueados pelos deny patterns (testes cobertos).
- [ ] AC-7 — `harness adapter list` mostra o perfil de sandbox por tool ser aplicado.

## Fora de escopo

- Sandbox de sistema/OS (containers, VMs, processos isolados) — não é alcançável pelo harness sem enganchar runtime da tool.
- Monitoramento/auditoria de execução de comandos (logs de shell da tool).
- Mudança do comportamento do CLI do harness (gates e pipeline continuam como estão).
- Perfis per-agent customizados (ex.: "frontend sem pnpm") — perfil é por instalação do adaptador, não por agent.
