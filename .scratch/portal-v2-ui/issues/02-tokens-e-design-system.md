# 02 — Tokens, tema e LAB Design System tipado

**What to build:** Trazer a base visual do LAB DS para a web, ainda **sem trocar telas**: tokens (cores, tipografia, espaçamento, efeitos), tema `--lh-*` claro/escuro sobre o mecanismo de tema atual (sem flash), `tailwind.config` ligado aos tokens, fontes Ranade (local) e DM Sans (`@fontsource`), logos e favicon novos. Componentes do DS (Button, Input, Select, Checkbox, Radio, Switch, Tabs, Tag, Badge, Card, Dialog, Toast, Tooltip, Grafismo) convertidos de `.jsx` + `.d.ts` para `.tsx` estrito, e peças do portal (nó, pílulas, chips, painéis, linha do tempo, esqueletos, estados vazios) tipadas, sem `@ts-nocheck`. Remover `base-from-claude/`; levar `DESIGN.md`, `TELAS.md` (ajustado ao escopo) e o protótipo aprovado para `docs/`; registrar no `CLAUDE.md` que `docs/DESIGN.md` substitui a skill `flowlab-identity` neste repo.

**Blocked by:** 01 (infraestrutura de estilos)

**Status:** done

- [x] Tokens e tema disponíveis como classes Tailwind (`bg-card`, `text-muted`, `border-line`, `bg-brand`…) em claro e escuro.
- [x] Componentes do DS e peças do portal em `.tsx` sem `@ts-nocheck`; `type-check` verde.
- [x] As telas atuais continuam idênticas (os tokens novos não vazam para o visual antigo).
- [x] Favicon e logos novos servidos localmente.
- [x] `base-from-claude/` removido; docs de design em `docs/`; nota no `CLAUDE.md`.
- [x] `vitest`, `lint` e `build` verdes.

## Comments

- Implementada em `feat/portal-v2`. Regras globais do pacote ficaram sob `.lh-v2` para não vazar no visual antigo (diff do CSS compilado: só `.font-display` mudou, resolvendo para a mesma pilha). Fora do port, por dependerem de dados mockados/store: `ExamRow`, `ColetaRow`, `QRMock`, `useLH` — entram com as telas. Follow-ups anotados nas issues 04 e 13.
