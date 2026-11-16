# 01 — Infraestrutura de estilos: Tailwind compilado, fim dos CDNs, ícones

**What to build:** Abrir a branch de integração `feat/portal-v2` e tirar a web da dependência de CDNs **sem mudar nenhuma tela**. Tailwind 3.4 passa a ser compilado via PostCSS (reproduzindo a configuração que hoje vive inline no `index.html`). O CSS inline do `index.html` (folha do laudo, `@media print`, ajustes em px) vai para arquivos de estilo sem mudança de comportamento. As fontes atuais deixam de vir do Google Fonts por CDN. Os ícones passam a sair de um registro `lucide-react` com versão fixa (ícone fora do registro renderiza vazio e avisa em dev), e o `WIcon` atual delega a esse registro para as telas antigas continuarem iguais.

O pacote de origem está no zip "Lab Hub" (pasta `lab-hub-v2`); ver spec.

**Blocked by:** None — pode começar imediatamente.

**Status:** ready-for-agent

- [ ] `index.html` sem Tailwind, Lucide nem Google Fonts por CDN; só o esqueleto da página.
- [ ] Todas as telas atuais idênticas antes e depois — conferido em 360 e 1440 px, claro e escuro.
- [ ] Impressão do laudo idêntica antes e depois (laudo curto e longo).
- [ ] Todos os ícones usados hoje aparecem; nenhum aviso de ícone ausente no console.
- [ ] React 19 e Vite 6 mantidos; nenhuma mudança em `apps/api`, `packages/shared`, migrations ou `apps/mobile`.
- [ ] Suíte atual (`vitest`) verde sem alterar testes; `type-check`, `lint` e `build` verdes.
