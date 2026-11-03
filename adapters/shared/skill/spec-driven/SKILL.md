---
name: spec-driven
description: Cria e mantém a spec de uma feature (critérios AC-N) antes de gerar tasks.
---

# Spec-driven

1. Rode `harness feature $ARGUMENTS` para criar `context/features/<slug>/{spec.md,plan.md}`.
2. Preencha a spec com problema, comportamento e critérios `AC-1`, `AC-2`...
3. Só então crie tasks: `harness task "<desc>" --feature <slug>`.
4. Toda implementação referencia os ACs; o reviewer valida spec × implementação.
