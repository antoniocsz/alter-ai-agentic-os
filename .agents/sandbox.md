# .agents/sandbox.md
# Carregar quando a task envolver execução de comandos com potencial destrutivo,
# perfil de sandbox, permissões de tool ou revisão de guard rails de shell.

## O que é sandbox aqui (e o que não é)

O sandbox do harness é uma **camada de permissões declaradas** entregue aos tools:
perfis de deny **por prefixo de comando** + allow explícito do pipeline. Não é isolamento
de SO (sem containers/VMs/processos isolados) e não é auditoria de execução — o que
cada tool realmente reforça depende do motor de permissões dela (matriz abaixo).

## Perfis

Escolhidos na instalação do adaptador (`harness adapter <tool> --sandbox <perfil>`,
default `minimal`):

- **minimal (default)** — git destrutivos, filesystem destrutivo e escalada de
  privilégio: `git reset*`, `git checkout*`, `git restore*`, `git clean*`, `git push*`,
  `rm -rf*`, `sudo *`.
- **strict** — superset do minimal, com instaladores de dependência e rede
  (guard rails 4 e 9): + `pnpm install*`, `npm install*`, `expo install*`, `curl *`,
  `wget *`.

Deny é **por prefixo**: `git reset*` casa com `git reset --hard` (e qualquer comando
que comece com `git reset`). Sem glob além do `*` final.

## Sempre permitido (todos os perfis)

O pipeline do harness não pode ser bloqueado pelo sandbox — ele usa `git` internamente
(via node) e é operado pela própria CLI:

- `pnpm harness …` (ex.: `pnpm harness worktree finish <task>`)
- `node scripts/harness/…` (ex.: `node scripts/harness/bin/harness.js check`)

Esses prefixos **não casam** com nenhum deny dos dois perfis — negativo coberto por
teste (`adapter-sandbox.test.js`).

## Matriz de garantias: harness × tool

Garantia de execução real em cada tool para o perfil aplicado:

| tool    | onde o perfil aterrissa                                  | o que a tool reforça                    | limite honesto                                   |
|---------|----------------------------------------------------------|-----------------------------------------|--------------------------------------------------|
| opencode| frontmatter `permission:` dos agents gerados (`permission.bash` por glob; reviewer mantém `edit: deny`) | deny por glob de comando no agente      | só cobre execução do agente declarado            |
| claude  | `allow`/`deny` em `.claude/settings.json` (`Bash(cmd:*)`) | deny de prefixo de Bash em toda sessão  | usuário pode reordenar/permitir manualmente       |
| codex   | seção "Sandbox do harness" em `.codex/README.md` gerado  | **nada** — sem engine de deny nativa     | instrução vinculante ao modelo, não enforcement   |
| browser | n/a (camada MCP de navegador)                            | —                                        | —                                                 |

Regra comum: o default do comando é `minimal`; `--sandbox` troca o perfil na
regeneração do adaptador (a saída é descartável — rode de novo para trocar).

## Tabela de comandos do perfil

| comando (prefixo)                        | minimal | strict | motivo                                    |
|------------------------------------------|---------|--------|-------------------------------------------|
| `pnpm harness …` / `node scripts/harness/…` | ✅ allow | ✅ allow | pipeline não pode quebrar (AC-6)          |
| `git reset*`                             | 🚫      | 🚫     | reescreve estado não mapeado (guard rail 3)|
| `git checkout*` / `git restore*`         | 🚫      | 🚫     | idem                                       |
| `git clean*`                             | 🚫      | 🚫     | apaga arquivos fora do controle do harness |
| `git push*`                              | 🚫      | 🚫     | publica sem validação de gates             |
| `rm -rf*`                                | 🚫      | 🚫     | destruição de filesystem                   |
| `sudo *`                                 | 🚫      | 🚫     | escalada de privilégio                     |
| `pnpm install*` / `npm install*` / `expo install*` | ✅ | 🚫 | dependências exigem consentimento (guard rail 4) |
| `curl *` / `wget *`                      | ✅      | 🚫     | rede exfiltrando/entrando sem consentimento (guard rail 9) |

Toques é de shell: `git status`, `git add`, `git commit`, `git diff`, `node --test`,
`node --version`, `pnpm test` etc. seguem permitidos nos dois perfis.

## Entrega e consumo

- `harness init <dir> --tools …` entrega os templates já alinhados ao default (`minimal`)
  — `.agents/sandbox.md` vem junto da camada (copiada por init).
- `harness update` sincroniza `.agents/` (este arquivo incluso); os templates de
  `adapters/` são re-renderizados com `harness adapter <tool>` (`adapters/` não
  é sincronizada por update — use o adaptador para regenerar).
- Fonte dos perfis: `SANDBOX_PROFILES` em `scripts/harness/src/lib/adapters.js`
  — templates claude/opencode/codex consomem esses emissores, nunca listas paralelas.

## Política de evolução do perfil

- **Mudar o deny de um perfil (adicionar/remover prefixo) é mudança estrutural ⇒ ADR
  em `context/project/adr/`** — descreva prefixo, motivo e impacto nas tools.
- Não criar perfis per-agent (ex.: "frontend sem pnpm") — perfil é por instalação
  do adaptador, não por agent.
- Não adicionar mecanismo de reforço novo por aqui (bash hooks, wrappers) — escopo
  da camada é declarar permissões consumíveis pelo motor de cada tool.

## Guard rails de operação

- Sandboxed agents que precisarem de um comando bloqueado: **param e pedem
  consentimento humano** — nunca "contornam" com subshell/encoded cmd.
- `adapters/` é saída descartável: re-render com `harness adapter <tool> [--sandbox <p>]`
  sobrescreve settings/agents sem salvar estado — patches manuais locais se perdem.
- O CLI do harness não muda de comportamento com o perfil (gates/pipeline intactos).
