# Plano: sandbox-por-tool

> Decisões técnicas da feature (derivado da spec). Criado em 2026-11-09.

## Abordagem

- Centralizar perfis em `scripts/harness/src/lib/adapters.js`: objeto `SANDBOX_PROFILES = { minimal: [...denies], strict: [...denies] }` com semantics de prefixes (deny casa apenas o início do comando — evita quebrar `pnpm harness worktree finish` que contém "git" no meio).
- Templates por tool consomem o perfil: `settings.json`/`allow` (claude), frontmatter `permission:` (opencode), seção markdown (codex). `adapter <tool> --sandbox strict` muda o template gerado; `adapter list` usa o mesmo dado.
- `.agents/sandbox.md` como asset compartilhado (igual às demais refs de `.agents/`), com matriz de garantia: **harness** (escopo/gates/worktree/lock) **× tool** (permissões do adaptador).
- Regra de evolução: qualquer mudança deny/allow é mudança de contrato público do adaptador → ADR obrigatório (guidail de arquitetura declarada).

## Módulos e arquivos afetados

- `scripts/harness/src/lib/adapters.js` — perfis + aplicação por tool
- `scripts/harness/src/adapter.js` — flag `--sandbox` + `list` mostrando perfil
- `adapters/claude/*`, `adapters/opencode/*`, `adapters/codex/*` — templates com deny/allow do perfil
- `.agents/sandbox.md` — nova referência
- `scripts/harness/tests/adapter-sandbox.test.js` — novo (perfis, allow explícito, strict superset do minimal)

## Ordem de tasks

1. `87-backend-sandbox-por-tool.md` — única task de implementação. depende de: 83 (ambas mexem no comando `adapter.js` — sequência)

## Riscos

- Deny patterns quebrarem o próprio pipeline do harness → AC-6 dedido: testes garantem allow explícito (`pnpm harness*`, `node scripts/harness*`) e deny apenas por prefixo.
- Over-blocking em strict travar tarefas legítimas (instalar deps autorizadas) → strict é opt-in por flag; docs explicam como liberar caso a caso (com humano no ciclo).
- Codex não tem deny/allow declarativo igual → sempre documentar o que a tool não reforça na .agents/sandbox.md (matriz honesta).
