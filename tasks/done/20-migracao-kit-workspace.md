# Task: Migrar o kit para D:\projetos\harness (Fase 0)
## Agente: `coordinator` (infra — decisão direta do usuário nesta sessão)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `README.md`
## Depende de: [ ] —
## Contexto para ler: plano `C:\Users\anton\.opencode\plan\harness-v03-workspace.md` (Fase 0)
## Skills a carregar: —
## O que já existe:
- Repo-fonte em `C:\Users\anton\Projetos\harness` (histórico git, 70 testes verdes).
- Clone feito em `D:\projetos\harness` preservando o histórico (`git clone`).
## O que criar:
- Atualizar o README para o workspace real (`D:\projetos`), substituindo os exemplos `~/dev/...`.
- Manter o conteúdo funcional; apenas os caminhos mudam.
## Especificação:
- `D:\projetos\` = raiz do workspace; `D:\projetos\harness` = fonte do kit.
- Os exemplos de `init`, `update --source` e `HARNESS_SOURCE` devem refletir esse layout (Windows/POSIX quando necessário).
- Não alterar código do CLI nesta task.
## Critério de conclusão:
- [ ] README sem referências a `~/dev/` nos exemplos de workspace/fonte
- [ ] `pnpm test` verde
- [ ] `pnpm harness check` limpo
## Ao terminar: rodar `pnpm harness finish 20-migracao-kit-workspace.md --handoff "<resumo>"`
## Complexidade: baixa

## Baseline (git)
- context/agents/queue/20-migracao-kit-workspace.md
