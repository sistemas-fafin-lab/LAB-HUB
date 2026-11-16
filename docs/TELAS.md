# Lab Hub v2 — telas, estados e comportamento

Referência visual: [`docs/prototipo-v2.html`](prototipo-v2.html) (dados de exemplo, sem API; precisa de internet para carregar o Tailwind do protótipo). Identidade e componentes: [`docs/DESIGN.md`](DESIGN.md). Código: `apps/web/src`.

Paridade com o protótipo (lotes 0 a 7 e a verificação em duas etapas): `.scratch/portal-v2-paridade/spec.md`.

Estado final do portal v2: todas as telas no LAB DS, sem código nem identidade do visual antigo. Ajustado ao escopo (`.scratch/portal-v2-ui/spec.md`): **o comportamento do sistema atual sempre vence.** Só entram telas e estados que já existem ou têm dados reais; o que está atrás de flag continua atrás da mesma flag. Ficaram fora desta lista, com issue própria: dependentes e troca de perfil, cartões e troca de plano, declaração de comparecimento nova, compartilhar com médico, sair de outros aparelhos, webhook de status para a linha do tempo, "Avançar etapa (dev)" e a página `/estados`.

## Rotas e estados cobertos

| Rota | Tela | Estados |
|---|---|---|
| `/` | Visão geral | destaque + Acompanhamento (marcadores reais, 8/4); próximos passos (pendência na recepção, próxima coleta com jejum, guardar documento; até 3); em andamento (pendência com "Ver"); sem exames (primeira coleta) |
| `/resultados` | Resultados | carregando (esqueleto + nó animado); busca por exame, categoria, médico ou marcador (sem acento); `?filtro=liberados\|andamento`; exportar CSV; selo "Novo"; conta sem exames (só o vazio, sem a barra); busca sem resultado; consulta admin por CPF (admin autorizado) |
| `/exame/:id` | Exame | liberado (marcadores, valores de referência, etapas com datas); em andamento sem conteúdo ("Acompanhar coleta" no lugar de "Ver laudo"); "Ver coleta"; recoleta |
| `/laudo/:id` | Laudo | liberado; ainda não liberado; imprimir / salvar PDF (`window.print()`), com todos os campos de hoje |
| `/coletas` | Minhas coletas | alerta de recoleta, próxima coleta (endereço e "Como chegar"), lista em colunas a partir de md, em andamento, histórico, vazio |
| `/coleta/:id` | Coleta | linha do tempo das etapas; agendada ("Adicionar ao calendário" .ics); "Agendamento confirmado" logo depois de agendar; em andamento; recoleta; liberada ("Ver resultados"); cancelada ("Agendar novamente"); cartão Local com endereço e "Como chegar" |
| `/agendar` | Agendar | etapas 01 · 02 · 03; unidades em rádio; `?posto=` pré-seleciona a unidade; escolher o horário só seleciona e o Resumo confirma; carrossel de dias com botões; disponibilidade retroativa do FlowLab; horários indisponíveis riscados; preparo com o jejum do horário escolhido |
| `/tendencias` | Tendências | mesmo conteúdo e fontes de dados de hoje; eixo com o mês da primeira e da última coleta |
| `/documentos` | Documentos | separados por tipo como hoje; `?enviar=1` abre a caixa de envio; enviar com confirmação antes de adicionar, visualizar, baixar, excluir, vazio |
| `/faturamento` | Faturamento | mesmo conteúdo de hoje (sem trocar plano nem cartões) |
| `/configuracoes` | Configurações | tema, idioma e região; Privacidade e segurança: verificação em duas etapas (pede o código para ligar e desligar), alterar senha, excluir a conta (com o código, se a verificação estiver ligada) |
| `/perfil` | Perfil | ver e editar dados com as validações atuais |
| `/entrar` | Acesso | login (Supabase Auth) com "Manter conectado"; cadastro com as validações atuais (aceite dos termos pronto, atrás de `MOSTRAR_ACEITE_TERMOS`); recuperar senha; nova senha |
| qualquer rota, sessão sem o código | Confirme que é você | segunda etapa da verificação por e-mail: na moldura da entrada, sem mudar a URL; também quando a API responde 403 `DOIS_FATORES_PENDENTE` |
| qualquer rota desconhecida | 404 (dentro do shell) | "404", título e "Voltar ao início"; exame/laudo inexistente usa a mesma tela com "Exame não encontrado" e volta para Resultados |
| — | Erro | falha ao montar uma tela: troca só o conteúdo (menu disponível), "Tentar novamente" monta de novo, trocar de tela sai do erro; falha no próprio shell: página inteira |
| — | Sem conexão | a mesma falha com o navegador offline; "Tentar novamente" |
| todas | Manutenção | flag `EM_MANUTENCAO` (desligada; a API não tem sinal de manutenção): página inteira em qualquer URL, "Tentar novamente" recarrega |

Telas de sistema: `components/sistema/` (`TelaDeSistema`, `LimiteDeErro`). Textos do protótipo, menos o que prometeria comportamento inexistente: horário de volta e 0800 da manutenção, "resultados já abertos neste aparelho" (não há cache offline), "Falar com o suporte" (o suporte está atrás de `MOSTRAR_CHATBOT`) e "Ver status" (não há página de status). Erros de dados não passam por elas: cada tela mostra o próprio estado de erro (`FalhaAoCarregar`).

Globais: título da aba "{Tela} · Lab Hub" (nunca o nome do exame); barra de 2 px na troca de página; faixa "sem conexão"; caixa "sessão expirada" em qualquer 401; avisos (toasts) para sucesso, informação e erro, inclusive "Bem-vindo de volta" e "Você saiu da sua conta"; contadores no menu (exames novos e coletas em andamento); busca com atalho Ctrl/⌘ K (exames, marcadores, coletas e páginas); suporte e chatbot conforme as flags atuais; gaveta de navegação abaixo de 1024 px.

## O nó (etapas)

Agendamento → Check-in → Coleta → Análise → Liberação. Uma ramificação por etapa, no sentido horário a partir do topo (`Node` e `Timeline` em `components/portal/`).

- Etapa atual: ramificação vazada. Recoleta: ramificação Coleta em coral.
- Sempre acompanhado do rótulo em texto (nunca só a cor).
- Animado (`loading`) como indicador de carregamento; respeita `prefers-reduced-motion`.

## Densidade e medidas

- Página: padding 16/24/32 px, largura máxima 1280 px, 20 px entre blocos, título em Ranade 28–34 px terminando com o bloco azul.
- Cartão: raio 20, padding 20 (24 nos cabeçalhos de detalhe), borda 1 px `--lh-line`, sem sombra.
- Linhas de lista: 56–64 px; ícone 18 px; texto 14 px; meta 12 px.
- Controles: botão 36 (sm) / 44 (md) / 56 (lg); campo 44; chip 34; raio 12.
- Movimento: 120 ms (hover), 200 ms (caixas), 240 ms (troca de página), 320 ms (painel lateral).
