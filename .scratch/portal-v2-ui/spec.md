Status: ready-for-agent

# Portal do paciente v2 — nova identidade visual (LAB Design System)

## Problem Statement

O portal do paciente (web) ainda usa o visual herdado do FlowLab: gradientes azul/índigo, fontes Inter e Plus Jakarta Sans, Tailwind e Lucide carregados por CDN (o Lucide em `@latest`, sem versão fixa) e ícones criados via `window.lucide`. Um colega de frontend produziu, com o Claude Design, uma nova interface aprovada para o portal com a identidade LAB (pacote "lab-hub-v2": protótipo, tokens, componentes do LAB Design System e telas portadas).

O pacote, porém, foi gerado sobre uma versão antiga do repositório: supõe uma API só com `/ping`, dados mockados na web e uma autenticação própria. Hoje o LAB-HUB já tem Supabase Auth, laudos do LIS, criptografia de colunas, `cpf_hash`, consulta admin por CPF, expurgo, auditoria e uma suíte de testes extensa. Aplicar o pacote como está sobrescreveria esse trabalho.

O paciente precisa ver o portal com a nova identidade em todas as telas existentes, sem perder nada do que o sistema já faz hoje.

Navegar também é um problema: as rotas vivem em `useState`. Não há URL por tela, o botão voltar do navegador não funciona e não dá para abrir um exame, um laudo ou uma coleta por link.

## Solution

Trazer do pacote **apenas a camada visual da web** e aplicá-la tela a tela sobre os hooks, a API e a autenticação atuais. A API, o domínio compartilhado, as migrations, a autenticação e o app mobile não mudam.

A entrega acontece numa branch de integração (`feat/portal-v2`), com um PR por etapa:

1. fundação visual;
2. rotas por URL;
3. shell;
4. telas, uma por PR;
5. limpeza final.

A branch recebe o master com frequência e só vai para o master quando todas as telas estiverem no visual novo, para o paciente nunca ver o portal meio velho, meio novo.

Regras de fidelidade:

- **Visual:** as telas do pacote, com o protótipo aprovado como desempate.
- **Comportamento:** o sistema atual sempre vence. Tudo o que existe hoje e não está no design continua existindo, vestido com o DS novo. Exemplos: consulta admin por CPF, confirmação antes de adicionar arquivo, carrossel de dias com botões, disponibilidade retroativa, chatbot e demais flags.
- **Textos:** vale o texto do design para títulos, rótulos, estados vazios e microcopy. Ficam os textos atuais em:
  - preparo de exame;
  - LGPD/consentimento;
  - mensagens de erro vindas da API;
  - textos de comportamentos que só o sistema atual tem.

  Nenhum texto do design que prometa um comportamento inexistente entra (ex.: "enviamos um SMS").
- **Escopo das telas:** só entram telas e estados que já existem ou têm dados reais. Telas que hoje mostram conteúdo estático (Tendências, Faturamento) são reestilizadas com o mesmo conteúdo e as mesmas fontes de dados que têm hoje. Recursos do design sem backend viram issues separadas.

## User Stories

### Identidade e tema

1. Como paciente, quero ver o portal com a identidade LAB (azul `#416EF5`, coral só para atenção, Ranade nos títulos e DM Sans no texto), para reconhecer a marca do laboratório.
2. Como paciente, quero que o status de cada exame e coleta use cor **e** rótulo (azul = liberado/dentro da referência, coral = atenção, cinza = em andamento), para entender a situação sem depender só da cor.
3. Como paciente, quero continuar podendo usar o modo escuro, agora com a paleta tinta/navy da marca, para usar o portal à noite.
4. Como paciente que usa o modo escuro, quero que a tela não pisque em branco ao carregar, como já acontece hoje.
5. Como paciente, quero que o tema escolhido continue salvo entre visitas.
6. Como paciente com sensibilidade a movimento, quero que as animações sejam desligadas quando meu sistema pede `prefers-reduced-motion`.
7. Como paciente que navega pelo teclado, quero foco visível em todos os controles e poder fechar caixas e menus com Esc.
8. Como paciente no celular, quero alvos de toque de pelo menos 44 px e o layout funcionando de 360 px a 1440 px.
9. Como paciente, quero que o portal carregue sem depender de scripts de CDN de terceiros (Tailwind, Lucide, Google Fonts), para a página ser mais rápida e estável.
10. Como paciente, quero ver o novo logo e o novo favicon do Lab Hub.

### Navegação e URL

11. Como paciente, quero que cada tela tenha a própria URL (`/resultados`, `/exame/:id`, `/coletas`, `/coleta/:id`, `/agendar`, `/documentos`…), para poder salvar e compartilhar links e recarregar a página sem perder onde estava.
12. Como paciente, quero que o botão voltar/avançar do navegador funcione entre as telas do portal.
13. Como paciente sem sessão que abre um link do portal, quero ser levado ao login e, depois de entrar, voltar à tela que eu tinha aberto.
14. Como paciente, quero uma indicação discreta de carregamento ao trocar de página.
15. Como paciente que digita uma URL inexistente, quero ver uma tela 404 com caminho de volta.
16. Como paciente numa tela menor que 1024 px, quero a navegação numa gaveta lateral.
17. Como paciente, quero buscar no portal pelo atalho Ctrl/⌘ K, como no design.
18. Como responsável pelo produto, quero que as visualizações de página continuem chegando ao Umami, agora por URL, sem mudar o nome dos eventos.

### Shell

19. Como paciente, quero o novo cabeçalho e a nova navegação, com meu nome e minhas iniciais vindos do meu cadastro real.
20. Como paciente, quero que o suporte e o chatbot continuem aparecendo ou escondidos conforme as flags atuais.
21. Como responsável pelo produto, quero que tudo o que hoje está atrás de flag (notificações, dependentes, novidades, enviar ao médico, extras de privacidade, cartões da visão geral) continue respeitando a mesma flag.
22. Como paciente, quero uma faixa "sem conexão" quando eu perder a internet.
23. Como paciente cuja sessão expirou, quero uma caixa avisando e me levando ao login, em vez de uma tela quebrada.
24. Como paciente, quero avisos (toasts) no novo visual para sucesso, informação e erro.

### Acesso

25. Como paciente, quero entrar com o meu login atual (Supabase Auth) numa tela com o painel da marca (recorte em L, `Grafismo`).
26. Como novo paciente, quero criar conta pelo fluxo de cadastro atual, com as mesmas validações (CPF, data de nascimento, senha), no visual novo.
27. Como paciente, quero recuperar a senha pelo fluxo atual, no visual novo.
28. Como paciente, quero mensagens de erro de login e cadastro claras, perto do campo com problema.
29. Como paciente, quero mostrar e esconder a senha, como hoje.

### Visão geral

30. Como paciente, quero uma visão geral no visual novo com o que já existe hoje: coletas, próximos passos e o que estiver liberado por flag.
31. Como paciente sem nenhum exame, quero um estado vazio que me leve a agendar a primeira coleta.
32. Como paciente, quero ver, enquanto os dados carregam, um esqueleto e o "nó" animado da marca, não um texto solto.

### Resultados, exame e laudo

33. Como paciente, quero a lista de resultados no visual novo, com busca e filtros iguais aos atuais.
34. Como paciente, quero ver na lista se cada exame está liberado, em análise ou em recoleta, com pílula e rótulo.
35. Como paciente, quero abrir o detalhe do exame pela URL e ver marcadores, valores de referência e etapas no visual novo.
36. Como paciente, quero ver as etapas da coleta (Agendamento → Check-in → Coleta → Análise → Liberação) no indicador "nó", sempre com rótulo em texto.
37. Como administrador autorizado, quero que a consulta de resultados por CPF continue funcionando na tela de Resultados, inclusive a abertura do detalhe do exame, com as mesmas proteções de hoje (disjuntor, e-mail autorizado, proteção contra respostas fora de ordem).
38. Como paciente, quero abrir o laudo pela URL e vê-lo com a nova identidade.
39. Como paciente, quero que o laudo traga **todas as informações que ele traz hoje**, sem perder nenhum campo.
40. Como paciente, quero imprimir e salvar o laudo em PDF pelo mesmo botão de hoje e receber uma folha legível também em impressora preto e branco.
41. Como paciente com laudo longo, quero que a paginação continue correta com a fonte nova (sem linhas cortadas entre páginas nem tabela partida de forma ilegível).
42. Como paciente, quero baixar a declaração do exame como hoje.

### Coletas e agendamento

43. Como paciente, quero ver minhas coletas (próxima, em andamento, histórico) no visual novo.
44. Como paciente, quero abrir uma coleta pela URL e ver a linha do tempo dela.
45. Como paciente com recoleta pendente, quero um alerta em coral para agendar a recoleta.
46. Como paciente, quero agendar uma coleta pelo fluxo atual (unidade, dia, horário, confirmação) no visual novo.
47. Como paciente, quero continuar navegando pelos dias com os botões do carrossel, como hoje.
48. Como recepção/integração, quero que o agendamento continue respeitando a disponibilidade retroativa do FlowLab.
49. Como paciente, quero ver as instruções de preparo do exame com o mesmo texto de hoje.
50. Como paciente, quero ver os horários indisponíveis claramente marcados.

### Documentos

51. Como paciente, quero ver meus documentos no visual novo, separados por tipo como hoje.
52. Como paciente, quero enviar um documento e confirmar antes de adicioná-lo, como hoje.
53. Como paciente, quero visualizar, baixar e excluir meus documentos com as mesmas regras de hoje.
54. Como paciente, quero um estado vazio orientando o primeiro envio.

### Conta

55. Como paciente, quero ver Tendências, Faturamento, Configurações e Perfil no visual novo, com o mesmo conteúdo e as mesmas ações de hoje.
56. Como paciente, quero editar meus dados no Perfil como hoje, com as mesmas validações.
57. Como paciente, quero trocar o tema em Configurações.
58. Como responsável pelo produto, quero que nenhum controle novo sem backend apareça nessas telas (ex.: trocar plano, adicionar cartão, sair de outros aparelhos).

### Telas de sistema

59. Como paciente, quero telas de 404, sem conexão, erro e manutenção no visual novo, cada uma com uma ação para voltar.

### Equipe

60. Como desenvolvedor, quero tokens, componentes do DS e peças do portal tipados em TypeScript estrito, sem `@ts-nocheck`, para o type-check proteger as telas.
61. Como desenvolvedor, quero um único documento de design no repo (`docs/DESIGN.md`) no lugar da antiga skill de identidade Flow LAB, para orientar novas telas.
62. Como desenvolvedor, quero o protótipo aprovado no repo como referência visual.
63. Como autor do design, quero revisar a fidelidade visual de cada PR de tela antes do merge na branch de integração.
64. Como tech lead, quero revisar em cada PR que nenhum dado nem comportamento atual se perdeu.
65. Como tech lead, quero que a branch de integração receba o master com frequência, para o merge final não virar um conflito grande.

## Implementation Decisions

### Escopo e base técnica

- **Só `apps/web` muda.** A API, o domínio compartilhado, as migrations, a autenticação (Supabase Auth via `AuthContext`) e `apps/mobile` ficam fora. Do pacote, nada de API, `shared` nem migration entra.
- **Versões:** mantemos React 19 e Vite 6 do repo, e não React 18 / Vite 8 do pacote. As dependências novas da web se limitam ao necessário para o visual: Tailwind 3.4 compilado (PostCSS + autoprefixer), `lucide-react` com versão fixa e `@fontsource/dm-sans`. A Ranade é servida localmente.
- **Fim dos CDNs:** o `index.html` deixa de carregar Tailwind, Lucide e Google Fonts. O wrapper atual de ícones via `window.lucide` dá lugar a um registro de ícones `lucide-react`. Ícone fora do registro renderiza vazio e avisa no console em desenvolvimento.

### Tokens, tema e DS

- **Tokens:** os arquivos de tokens do LAB DS (cores, tipografia, espaçamento, efeitos) e o tema com variáveis `--lh-*` para claro e escuro. O `tailwind.config` liga as classes aos tokens (`bg-card`, `text-muted`, `border-line`, `bg-brand`…).
- **Modo escuro:** o mecanismo atual continua: preferência salva, classe `dark` aplicada antes do primeiro render, sem flash. Mudam só os valores, que passam a vir dos tokens.
- **CSS inline do `index.html`:** tem a folha do laudo, o `@media print` e ajustes em px. Ele sai para arquivos de estilo dentro de `src` **sem mudança de comportamento**, na fundação. A impressão do laudo é conferida antes e depois. O restyle desse CSS acontece só no PR do laudo.
- **DS em `.tsx` estrito:** os componentes do LAB DS (Button, Input, Select, Checkbox, Radio, Switch, Tabs, Tag, Badge, Card, Dialog, Toast, Tooltip, Grafismo) chegaram em `.jsx` + `.d.ts`. São convertidos para `.tsx` estrito na fundação, com os `.d.ts` como contrato das props.
- **Peças do portal** (nó, pílulas, chips, painéis, linha do tempo, bloco de data, esqueletos, estados vazios): entram tipadas, sem `@ts-nocheck`. As telas do pacote são **referência**, não código a ser colado: cada tela é reescrita sobre os hooks atuais.

### Dados

- Telas e hooks conversam com a API pelos mesmos módulos de hoje: `useResultados`, `useAgendamentos`, `useDocumentos`, `usePaciente`, o cliente `api` e `AuthContext`. O `store.tsx`/`useLH` do pacote **não** entra.
- Onde o design pede um dado que não existe, o elemento não aparece ou fica atrás de uma flag desligada. Dado fictício não entra.

### Rotas

- Um router por URL próprio e pequeno, inspirado no do pacote. Ele substitui o `AppRoute` em `useState`.
- O router:
  - usa a History API;
  - aceita parâmetros (`/exame/:id`, `/coleta/:id`, `/laudo/:id`) e query string;
  - intercepta links internos;
  - expõe navegação programática.
- Sem sessão, qualquer rota vai para `/entrar?next=<rota>`, e o login volta para `next`. O `next` só aceita caminhos internos (nada de URL absoluta ou `//`), para evitar open redirect.
- O `trackPageview` dispara a cada mudança de URL.
- A produção (Vercel) precisa de fallback de SPA (`/* → index.html`). O PR do router confere e, se preciso, configura esse fallback.

### Shell e telas

- O shell (cabeçalho, navegação, gaveta abaixo de 1024 px, busca com Ctrl/⌘ K, suporte, toasts, faixa offline, caixa de sessão expirada) substitui o `Topbar`, a `Sidebar` e o `SupportDock` atuais e preserva todas as flags que eles respeitam hoje. A caixa de sessão expirada dispara quando o cliente `api` recebe 401.
- **Ordem dos PRs:** fundação → router → shell → acesso → visão geral → resultados e exame → laudo (tela + documento) → coletas e agendamento → documentos → conta (tendências, faturamento, configurações, perfil) → telas de sistema e limpeza final.

### Laudo

- O documento do laudo muda de visual e mantém **todos os campos que apresenta hoje**.
- Tipografia e cor: DM Sans no corpo, Ranade no título e no cabeçalho, cor só no cabeçalho e no logo, folha legível em P&B.
- "Exportar PDF" continua sendo `window.print()`.
- A paginação continua medindo com a fonte carregada e é revalidada com a fonte nova.

### Analytics, flags, textos e limpeza

- **Analytics e flags:** nomes de eventos do Umami e nomes das flags inalterados.
- **Textos:** regra descrita em "Solution".
- **Limpeza:**
  - remover `base-from-claude/` (cópias do protótipo antigo);
  - levar para `docs/` o `DESIGN.md`, o `TELAS.md` (ajustado a este escopo: sem dependentes, 2FA, cartões, declaração nova nem `/estados`) e o protótipo aprovado;
  - registrar no `CLAUDE.md` que, neste repo, `docs/DESIGN.md` substitui a skill `flowlab-identity`;
  - o código antigo (`Topbar`, `Sidebar`, `SupportDock`, `WIcon`, `WStatus`, `Sparkline`, `WebHero`, primitivos não usados) sai quando a última tela que o usa migrar, e não antes.

### Entrega

- Branch de integração `feat/portal-v2`, um PR por etapa, merge do master para dentro dela com frequência e merge final no master só com todas as telas migradas.
- O autor do design revisa a fidelidade visual; o tech lead revisa dados e comportamento.

## Testing Decisions

- **Um bom teste afirma o que o paciente vê e faz** (papel, rótulo, texto, navegação, chamadas à API), nunca classes CSS nem estrutura de markup. Assim o comportamento sobrevive a mudanças visuais.
- **Ponto principal (já existe): a tela renderizada.** Cada página é renderizada com Testing Library, e só os hooks de dados e o cliente `api` são trocados por dublês. Funções puras de composição (ex.: `combinaExams`) ficam reais, para não esconder regressão. Referência: os testes de `ResultsPage`, `ExamDetailPage` e `LaudoPage`, `ExamRow` e `Topbar`. Em cada PR de tela, os testes daquela tela são reescritos onde os seletores mudaram, cobrindo o mesmo comportamento. Nenhum teste é removido sem um substituto.
- **Ponto novo (o único): o App montado numa URL.** Renderizar o `App` inteiro numa URL inicial, com `AuthContext` e hooks dublados, para afirmar:
  - a tela certa por rota, incluindo parâmetros;
  - voltar e avançar do navegador;
  - redirecionamento sem sessão para `/entrar?next=…` e volta após o login;
  - rejeição de `next` externo;
  - 404 em rota desconhecida;
  - `trackPageview` por URL;
  - caixa de sessão expirada num 401.

  Esse ponto nasce no PR do router e cresce no do shell.
- **Modelo do laudo (já existe):** o `modelo.test` garante que todos os campos atuais continuam presentes depois do restyle. Referência: o próprio `modelo.test`.
- **Hooks de dados:** como não mudam, os testes atuais (ex.: `useResultados.test`) continuam valendo sem alteração.
- **Sem teste unitário próprio para os componentes do DS.** Eles são cobertos pelas telas.
- **Conferência manual em cada PR de tela** (o jsdom não mede layout):
  - larguras de 360, 768, 1024 e 1440 px;
  - claro e escuro;
  - Tab com foco visível e Esc fechando caixas;
  - `prefers-reduced-motion`;
  - estados de carregando, vazio e erro;
  - comparação lado a lado com a mesma tela do protótipo.

  No PR do laudo, também: impressão de laudo curto, longo (várias páginas) e com tabela de marcadores, em cor e P&B.
- **Portão automático de cada PR:** `vitest`, `type-check`, `lint` e `build` verdes.

## Out of Scope

- Qualquer mudança em `apps/api`, no domínio compartilhado, nas migrations ou na autenticação. Isso inclui a auth própria do pacote (cookie `lh_session`, scrypt) e a migration "portal_paciente".
- `apps/mobile`.
- Recursos do design sem backend, cada um com issue própria:
  - verificação em duas etapas;
  - dependentes e troca de perfil;
  - cartões e troca de plano;
  - declaração de comparecimento nova;
  - compartilhar com médico (link público);
  - sair de outros aparelhos;
  - webhook de status do agendamento para a linha do tempo;
  - "Avançar etapa (dev)".
- A página `/estados` de referência de componentes.
- QR codes reais (no design eles são decorativos).
- Idioma, fuso e unidades funcionando de verdade.

## Further Notes

- O pacote de origem (zip "Lab Hub", pasta `lab-hub-v2`) tem um `PLANO-DE-APLICACAO.md` cujos PRs 0 a 8 **não** devem ser seguidos como estão: ele supõe o repo de julho. Ficam aproveitados os tokens, o DS, as peças do portal, as telas como referência, as fontes, os logos e os documentos de design.
- O plano do colega avisa que a pasta compartilhada com ele tinha `.env` na raiz com chaves reais (service role do Supabase, WhatsApp, Gemini, Groq). Independentemente desta spec, vale rotacionar essas chaves.
- `@vitejs/plugin-react@4` continua compatível porque ficamos no Vite 6.
- Tailwind 3.4 é a mesma major do NativeWind 4 no mobile, o que evita duas majors no monorepo.
