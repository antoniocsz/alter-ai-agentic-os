# .agents/ui-ux.md
# Carregar para tarefas de design, UI/UX, acessibilidade e revisão visual

Base para qualquer tela (web ou mobile): Heurísticas de Nielsen, WCAG e boas práticas de design.
Agente frontend/mobile usa este arquivo JUNTO com `.agents/frontend.md`/`.agents/mobile.md` (MVVM).

## Heurísticas de Nielsen — checklist em toda tela

| # | Heurística | Como validar na prática |
|---|---|---|
| 1 | **Visibilidade do estado do sistema** | Feedback imediato: loading (skeleton/spinner), ação confirmada, salvamento indicado. Nunca tela congelada. |
| 2 | **Correspondência com o mundo real** | Linguagem do usuário, não do sistema; ícones/metáforas familiares; datas "há 3 dias" e não "2026-09-17T…" |
| 3 | **Controle e liberdade do usuário** | Cancelar/sair SEMPRE disponível; undo/redo; voltar mantém estado. |
| 4 | **Consistência e padrões** | Mesmo componente = mesmo comportamento; convenções da plataforma; termos iguais em toda a app. |
| 5 | **Prevenção de erros** | Confirmar ações destrutivas; desabilitar impossíveis; validação enquanto digita (onBlur), não só no submit. |
| 6 | **Reconhecer em vez de lembrar** | Opções visíveis; preencher valores conhecidos; labels fora do campo (não só placeholder). |
| 7 | **Flexibilidade e eficiência** | Atalhos, busca, default inteligente; caminho rápido para usuário frequente sem atrapalhar o iniciante. |
| 8 | **Design estético e minimalista** | Mostrar só o necessário; hierarquia visual clara; sem ruído decorativo. |
| 9 | **Ajude a reconhecer, diagnosticar e recuperar de erros** | Mensagem explica O QUE errou e COMO corrigir; nunca "erro 500" ou "algo deu errado" sem guia. |
| 10 | **Ajuda e documentação** | Tooltip/help contextual; empty states com próximo passo; documentação alcançável. |

## Acessibilidade (WCAG 2.x) — mínimo obrigatório

### Alto impacto (falha de a11y = bloqueia PR)

| Item | Regra | Exemplo |
|---|---|---|
| Contraste | Texto normal ≥ 4.5:1; texto grande/UI ≥ 3:1 | `#333` sobre branco (7:1) ✅; `#999` sobre branco (2.8:1) ❌ |
| Cor não é o único indicador | Estado não pode depender só de cor | Erro = borda vermelha **+ ícone/texto**; sucesso = verde + check + texto |
| Navegação por teclado | 100% das funcionalidades via teclado; tab order segue o visual | Sem traps; foco visível (`focus-visible`) |
| Nomes acessíveis | Botões com só ícone precisam de nome | `aria-label="Fechar menu"` em vez de `<button><Icon/></button>` |
| Labels de formulário | `<label for=...>` ou wrapper; nunca placeholder como único rótulo | `<label for="email">Email</label>` |
| Alvo de toque | Mín. 44×44px (mobile) | `min-h-11 min-w-11`; nunca `w-6 h-6` |
| Movimento reduzido | Respeitar `prefers-reduced-motion: reduce` | Desligar animações que movem/zoom; animar 1–2 elementos por view no máximo |

### Estados de componente (sempre definir)

| Estado | Regra |
|---|---|
| Hover | Feedback visual sutil + `cursor-pointer`; sem `scale` que desloca layout |
| Focus | Anel visível (`focus:ring-2`); **nunca** `outline-none` sem substituto |
| Active/pressed | Feedback imediato no clique (`active:`); senão parece que "não pegou" |
| Disabled | Opacidade reduzida + `cursor-not-allowed`; distinto do estado normal |
| Loading | Skeleton/spinner imediato; nunca tela em branco |
| Empty | Mensagem + ação ("Nenhum item ainda. Criar um!") |
| Error | Mensagem com o que aconteceu e como corrigir; inline próximo ao campo |

### Estrutura semântica (web)

- Headings em ordem (`h1` → `h2` → `h3`, sem pular); landmarks (`header/nav/main/footer`)
- `aria-live` para regiões dinâmicas (toasts, resultados de busca)
- `inputmode="numeric"` em campos de número (teclado certo no mobile)
- Skip link "Pular para o conteúdo" em páginas com navegação pesada
- Alt text descritivo em imagens; `alt=""` para decorativas

## Boas práticas de design

1. **Hierarquia clara** — 1 ação primária por view; botões primário > secundário > ghost; texto mais importante = maior peso, não só cor.
2. **Consistência** — tokens de design (cor, espaçamento, raio, tipografia); nada de `var()` avulso; ícones de um conjunto só (Lucide/Heroicons), viewBox fixo 24×24.
3. **Espaçamento e layout** — grid consistente (`max-w` único por view); sem scroll horizontal em 375px/768px/1024px/1440px; conteúdo não escondido atrás de navbar fixa.
4. **Feedback** — estados hover/active/disabled/loading/empty/error (tabela acima) SEMPRE implementados, não só no mock.
5. **Dados** — formatar moeda/datas/percentuais; skeleton respeitando o layout real (sem "pulo" de layout ao carregar).
6. **Mobile** — alvo de toque ≥ 44px; ações primárias ao alcance do polegar; teclado correto por tipo de campo.

## Revisão rápida (rodar antes de entregar tela)

- [ ] Heurísticas 1–10 checadas (estado, controle, prevenção, erros, empty states)
- [ ] Contraste ≥ 4.5:1 no texto; cor não é único indicador
- [ ] Teclado navega 100%; foco visível; skip link
- [ ] Labels em todos os campos; `aria-label` em botões de ícone
- [ ] Alvos de toque ≥ 44px; `prefers-reduced-motion` respeitado
- [ ] Estados hover/focus/active/disabled/loading/empty/error definidos
- [ ] Hierarquia: 1 CTA primário; sem emoji como ícone; sem scroll horizontal
- [ ] Light/dark testados (bordas e fundos visíveis nos dois)