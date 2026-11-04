# Lab Hub — identidade e sistema visual no código (portal v2)

Base: LAB Design System (manual de marca LAB). Este documento orienta toda tela nova da web e, neste repositório, **substitui a skill `flowlab-identity`** (gradientes azul/índigo, Inter e Plus Jakarta Sans eram o visual antigo e saíram por completo).

Referência visual aprovada: [`docs/prototipo-v2.html`](prototipo-v2.html) (dados de exemplo; precisa de internet para carregar o Tailwind do protótipo). Telas e estados: [`docs/TELAS.md`](TELAS.md). Plano de migração: `.scratch/portal-v2-ui/spec.md`.

## Onde está cada coisa

| O quê | Arquivo |
|---|---|
| Tokens da marca (cores, tipografia, espaçamento, efeitos) | `apps/web/src/styles/lh/tokens/*.css` |
| Tema do portal, claro (`:root`) e escuro (`.dark`), com variáveis `--lh-*` | `apps/web/src/styles/lh/tema.css` |
| Classes Tailwind ligadas ao tema (`bg-page`, `bg-card`, `bg-subtle`, `text-ink`, `text-muted`, `border-line`, `bg-brand`, `text-link`, `bg-coral-soft`, `shadow-float`…) | `apps/web/tailwind.config.js` |
| Fontes: Ranade (títulos, `font-display`, local em `public/fonts`) e DM Sans (`@fontsource/dm-sans`, texto do `body`) | `styles/lh/fontes.css`, `styles/fontes.ts` |
| Telas de sistema (404, erro, sem conexão, manutenção) e o limite de erro | `apps/web/src/components/sistema/` |
| Tipos do exame consumidos pelas telas | `apps/web/src/lib/exame.ts` |
| Componentes do LAB DS (Button, IconButton, Input, Select, Checkbox, Radio, Switch, Tabs, Tag, Badge, Card, Dialog, Toast, Tooltip, Grafismo) | `apps/web/src/ds/` |
| Ícones (Lucide, substituto da família própria da marca) | `ds/Icon.tsx` → registro único `components/icones/registro.ts` |
| Peças do portal (nó, pílulas de status, chips, painéis, cabeçalho de página, linha do tempo, bloco de data, esqueletos, estados vazios, mini-gráficos) | `apps/web/src/components/portal/` |
| Logos e favicon | `apps/web/public/assets/labhub/` |

## Base global

`styles/lh/tema.css` aplica a base a toda a página: fundo `--lh-page`, texto `--lh-ink` e DM Sans no `body`, links, `::selection`, foco visível, ajustes de escuro dos controles do DS (`[role=…]`) e a impressão. Não há raiz especial: uma tela nova é só um componente montado no shell (ou na `MolduraAcesso`, sem sessão). Use as cores do tema (`bg-card`, `text-ink`, `border-line`…), nunca a paleta padrão do Tailwind (`slate-*`, `gray-*`, `blue-*`).

## Regras

- **Cor:** azul `#416EF5` para marca, destaques e etapas concluídas; `#3A63DE` para botões, links e texto azul pequeno (5,2:1 com branco); hover e clique `#2F55C9`. Coral `#FF6869` só para atenção (recoleta, fora da referência). Sem verde, sem gradientes decorativos, sem vidro.
- **Status:** azul = dentro da referência / liberado; coral = atenção; cinza = em andamento. **Sempre com rótulo** (`Pill`), nunca só a cor.
- **Tipografia:** Ranade 500 nos títulos com tracking −2%; DM Sans no restante; números tabulares em valores e datas.
- **Formas:** cartões raio 20, controles raio 12, blocos de ícone e avatares com raio de 15%. O destaque da visão geral e o painel do acesso usam o `Grafismo` (recorte em L da marca).
- **Assinaturas:** ponto final dos títulos como bloco azul (`.lh-dot`, já no `PageHeader`); contadores sobrescritos no menu (`.lh-supc`); o nó (`Node`) como indicador de etapas e de carregamento.
- **Escuro:** fundo tinta `#0B1A33`, cartões navy `#1C3C6B`. A classe `dark` no `<html>` continua vindo de `lib/tema.ts`, aplicada antes do primeiro render (sem flash); só os valores mudam, via `--lh-*`. Os componentes do DS recebem ajustes em `tema.css` (`.dark .lh-in …`) — use `Field`/`SelectField` do portal em vez de `DS.Input`/`DS.Select` puros.
- **Acessibilidade:** foco visível em todos os controles (anel azul); Esc fecha caixas e menus (`Modal`, `useDismiss`); `prefers-reduced-motion` desliga animações; alvos de toque de 44 px no mobile. Checkbox, Radio (setas), Switch, Tag e Card clicáveis respondem ao teclado; Tabs seguem o padrão WAI-ARIA (setas, Home/End, só a aba ativa no Tab); o Dialog prende o foco, recebe-o ao abrir e o devolve ao fechar; o texto do Tooltip vira a descrição acessível do controle que ele acompanha.

## Dados

As peças do portal não conhecem dados de exemplo: recebem tudo por props. As telas buscam pelos hooks atuais (`useResultados`, `useAgendamentos`, `useDocumentos`, `usePaciente`, cliente `api`, `AuthContext`). O `store.tsx`/`useLH` do pacote não entra. Onde o design pede um dado que não existe, o elemento não aparece.

O nó e a linha do tempo usam o mesmo modelo: `step`/`passo` = etapas alcançadas (0–5, Agendamento → Check-in → Coleta → Análise → Liberação) e `alert`/`alerta` = índice da etapa em atenção (recoleta) ou −1.

## Ícones

Só os ícones do registro `components/icones/registro.ts` entram no bundle; o `Icon` do DS lê o registro pelo `Icone` (`components/icones/Icone.tsx`). Para usar um novo: importar de `lucide-react` e acrescentar ao objeto `ICONES` com o nome em kebab-case (`'calendar-plus': CalendarPlus`). `IconName` é tipado pelo registro, então um nome inexistente não passa no `type-check`; um nome vindo de dado que não esteja no registro não desenha nada e avisa no console em desenvolvimento. Quando a família de ícones própria da marca existir em SVG, trocar a implementação mantendo os nomes.
