# ADR-004: Harness copy-per-project (1 fonte + N projetos independentes)

**Data:** 2026-09-29
**Status:** accepted

## Contexto

O AlterAI - Agentic OS precisa operar em N projetos ao mesmo tempo, cada um com identidade,
stack e ritmo próprios. Alternativas: (a) compartilhar a camada do harness via import/symlink
(uma única cópia para todos) ou (b) copiar a camada para dentro de cada projeto.

## Decisão

**Copy-per-project**: a camada do harness (`AGENTS.md`, `.agents/`, `.opencode/agent/`,
`scripts/harness/`) é **copiada** para cada projeto via `harness init`, e **re-sincronizada**
a partir de uma fonte única via `harness update --source <caminho>` (ou `HARNESS_SOURCE`).
Cada projeto é dono da própria camada e pode divergir quando quiser — parando de rodar `update`.

## Consequências positivas

- Projetos ficam autossuficientes: abrir o opencode dentro do projeto carrega o protocolo sem
  depender de nenhum caminho externo
- Isolamento natural: nenhum estado compartilhado entre projetos
- Divergência permitida por projeto (evolução da camada sem afetar os outros)

## Trade-offs aceitos

- Duplicação do código da camada (pequeno — CLI zero deps, poucos arquivos)
- Divergência pode acumular se o projeto parar de sincronizar — mitigado por `update --all` no workspace

## Alternativas descartadas

- **Symlink/import compartilhado:** um problema em um projeto afeta todos; impossibilita divergir;
  atualização exigiria acordo entre todos os projetos
- **Uma fonte por família:** adotado apenas se um grupo de projetos precisar divergir da base
  (ex.: `harness-web`, `harness-mobile`)