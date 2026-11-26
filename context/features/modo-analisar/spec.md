# Spec: modo-analisar

> Fonte da verdade da feature. Task(s) referenciam esta spec via `## Feature: modo-analisar`.
> Criada em 2026-11-26.

## Problema

Para revisar o que o agente fez, o humano só tinha o diff cru e a conversa. Faltava ver os achados
da revisão nas linhas, comentar por linha, perguntar sobre o código sem risco de alteração e
devolver tudo ao agente em um clique (tela "Analisar" do layout aprovado).

## Comportamento esperado

- Workspace → *Analisar*: diff por arquivo com número de linha, achados da revisão nas linhas
  (selecionáveis), comentários do humano por linha, painel de achados e de perguntas.
- Pergunta sobre o código = run só leitura (`role = ask`): Claude em modo plan, Codex read-only;
  guarda compara a worktree antes/depois e registra `agent.error` com `read_only_violation`.
  CLI `harness run <task> --ask "..."`; API `POST /api/runs` com `ask`.
- `GET /api/findings?task=`: achados `arquivo:linha — texto` + veredito da revisão mais recente.
- *Enviar ao agente para corrigir*: achados marcados + comentários viram uma mensagem que continua
  a sessão do último run de escrita (ou run novo com `note`).
- `runs.role`; `--continue` sem id ignora runs só leitura (ask/review/judge).

## Critérios de aceitação

- [x] AC-1 — `parseFindings` extrai `arquivo:linha[-fim] — texto` de listas/crases e ignora caminhos fora da raiz; `verdictOf` lê o veredito.
- [x] AC-2 — `--ask`/`ask` roda só leitura (claude `plan`), grava `role = ask` e `user.message`; guarda avisa se a worktree mudou.
- [x] AC-3 — `GET /api/findings` devolve a revisão mais recente com achados e veredito.
- [x] AC-4 — `--continue` sem id pula runs só leitura; continuar um run `ask` é recusado.
- [x] AC-5 — tela Analisar: comentar em linha, marcar achados, perguntar e enviar ao agente (verificado em navegador headless).

## Fora de escopo

- Achados estruturados por linha vindos de ferramentas externas (lint, SAST).
- Sincronizar comentários entre máquinas (ficam no navegador).

## Estado

- 2026-11-26 — task 141: implementado e testado (CLI, API e navegador headless com agente falso). Validação com as tools reais pendente.
