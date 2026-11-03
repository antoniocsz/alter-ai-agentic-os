# {{NAME}}

Projeto de jogo (perfil **game**).

## Estrutura

- `src/scenes/` — cenas/mapas
- `src/systems/` — lógica de gameplay (sistemas puros e testáveis)
- `assets/` — imagens, áudio, fontes, dados
- `tests/` — testes (node --test)

## Assets e Git LFS

Assets binários grandes **não devem ir para o git normal**. Habilite o Git LFS antes de versionar:

```bash
git lfs install
git lfs track "assets/**"
git add .gitattributes
```

O `.gitattributes` já vem com `* text=auto`; descomente/ajuste as regras de LFS quando o
pipeline de assets estiver definido. Engine/framework ainda não foi escolhido — registre a
decisão em `context/project/adr/`.

## Fluxo

`spec → tasks → worktree → gates (lint/test) → merge`. Operação em `context/project/runbook.md`.
