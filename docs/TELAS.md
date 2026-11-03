# Lab Hub v2 — telas, estados e comportamento

Referência visual: [`docs/prototipo-v2.html`](prototipo-v2.html) (dados de exemplo, sem API; precisa de internet para carregar o Tailwind do protótipo). Identidade e componentes: [`docs/DESIGN.md`](DESIGN.md). Código: `apps/web/src`.

Ajustado ao escopo do portal v2 (`.scratch/portal-v2-ui/spec.md`): **o comportamento do sistema atual sempre vence.** Só entram telas e estados que já existem ou têm dados reais; o que está atrás de flag continua atrás da mesma flag. Ficaram fora desta lista, com issue própria: verificação em duas etapas, dependentes e troca de perfil, cartões e troca de plano, declaração de comparecimento nova, compartilhar com médico, sair de outros aparelhos, webhook de status para a linha do tempo, "Avançar etapa (dev)" e a página `/estados`.

## Rotas e estados cobertos

| Rota | Tela | Estados |
|---|---|---|
| `/` | Visão geral | coletas e próximos passos; cartões liberados por flag; sem exames (primeira coleta) |
| `/resultados` | Resultados | carregando (esqueleto + nó animado), busca e filtros iguais aos atuais, vazio, busca sem resultado; consulta admin por CPF (admin autorizado) |
| `/exame/:id` | Exame | liberado (marcadores, valores de referência, etapas); em andamento; recoleta |
| `/laudo/:id` | Laudo | liberado; ainda não liberado; imprimir / salvar PDF (`window.print()`), com todos os campos de hoje |
| `/coletas` | Minhas coletas | alerta de recoleta, próxima coleta, em andamento, histórico, vazio |
| `/coleta/:id` | Coleta | linha do tempo das etapas; agendada; em andamento; recoleta; liberada; cancelada |
| `/agendar` | Agendar | fluxo atual (unidade, dia, horário, confirmação); carrossel de dias com botões; disponibilidade retroativa do FlowLab; horários indisponíveis riscados; preparo com o texto atual |
| `/tendencias` | Tendências | mesmo conteúdo e fontes de dados de hoje |
| `/documentos` | Documentos | separados por tipo como hoje, enviar com confirmação antes de adicionar, visualizar, baixar, excluir, vazio |
| `/faturamento` | Faturamento | mesmo conteúdo de hoje (sem trocar plano nem cartões) |
| `/configuracoes` | Configurações | ações de hoje, incluindo o tema |
| `/perfil` | Perfil | ver e editar dados com as validações atuais |
| `/entrar` | Acesso | login (Supabase Auth), cadastro com as validações atuais, recuperar senha |
| 404 / sem conexão / erro / manutenção | Sistema | cada uma com uma ação para voltar |

Globais: barra de 2 px na troca de página; faixa "sem conexão"; caixa "sessão expirada" em qualquer 401; avisos (toasts) para sucesso, informação e erro; busca com atalho Ctrl/⌘ K; suporte e chatbot conforme as flags atuais; gaveta de navegação abaixo de 1024 px.

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
