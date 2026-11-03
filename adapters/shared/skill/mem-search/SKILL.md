---
name: mem-search
description: Busca na memória local do harness (sessões, tasks, notas e docs) e retoma o estado da sessão.
---

# Memória local

Quando precisar lembrar de algo de sessões anteriores:

1. Rode `harness recall "$ARGUMENTS"` (agrega todos os projetos se estiver na raiz do workspace).
2. Para retomar o trabalho, rode `harness status`.
3. Ao encerrar, registre `harness session end "<resumo>"`.

A memória é 100% local (SQLite + markdown). Não use serviços externos de memória.
