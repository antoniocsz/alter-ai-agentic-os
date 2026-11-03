# Core — papéis neutros do harness

Textos canônicos dos papéis lógicos. São **independentes de tool**: o adaptador
(`adapters/<tool>/`) traduz cada papel para o formato da ferramenta.

| Papel | Arquivo | Função |
|---|---|---|
| Coordinator | `coordinator.md` | loteia tasks, abre worktrees, delega e revisa |
| Executor | `executor.md` | executa uma task dentro da worktree, respeitando escopo |
| Reviewer | `reviewer.md` | valida spec × implementação e gates (não edita código) |

Regras comuns (valem para qualquer tool):

1. Leia `AGENTS.md` e o `context/` do projeto antes de agir.
2. Task só executa depois de `harness start` e `harness worktree start`.
3. Respeite o `## Escopo` e os gates do `harness.json`.
4. Encerre com `harness worktree finish`/`harness finish` e registre a sessão.
