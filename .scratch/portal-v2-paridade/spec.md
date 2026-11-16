# Portal v2 · Paridade visual (lotes 0 a 7)

Status: em andamento

Origem: pacote "Paridade do Portal v2" (`prompt-claude-code.md` e `auditoria-portal-v2.md`, de 05/11/2026), que compara o protótipo `docs/prototipo-v2.html` com `apps/web`.

## Escopo pedido

O pedido foi fazer os lotes 0 a 7, **só design, sem nenhuma funcionalidade nova**. O Lote 8 (verificação em duas etapas e declaração de comparecimento) fica fora.

Para separar design de funcionalidade, valeu esta regra: entra o que muda a aparência, o texto ou o arranjo de dados que a tela **já tem**. Fica de fora o que cria ação, rota, parâmetro de URL, chamada de API, armazenamento ou dado novo. Também fica de fora o texto que prometeria uma busca ou um recurso que não existe.

## Tarefas

Base: `4240d47`.

- [x] PV2-01 · Borda tracejada do envio com o token `strong`.
- [ ] PV2-02 · Excluir conta: **decisão D3**. O botão "Solicitar" continua sem ação.
- [x] PV2-03 · `FalhaAoCarregar` no desenho do protótipo: `cloud-off` coral 48, Btn md com ícone e "Tentando" por no mínimo 600 ms. Ícones `cloud-off` e `calendar-clock` adicionados ao registro.
  - Tela de sistema: já tinha `rotate-cw`. A nova tentativa ali é síncrona (só remonta), então não ganhou estado de carregamento.
- [ ] PV2-04 · Título da aba por rota: comportamento novo (fica no histórico do navegador). Ficou para decisão.
- [ ] PV2-05 · Acompanhamento com dado real: **decisão D1**.
- [~] PV2-06 · Próximos passos: feitos o ícone `calendar-clock` e o jejum no subtítulo. Ficaram para decisão as linhas novas "Resolver pendência" e "Guardar um documento" (esta depende da PV2-12).
- [x] PV2-07 · Em andamento: `truncate` com `title`, e "Ver" no lugar de "n de 5" na coleta com pendência.
- [ ] PV2-08 · Busca de Resultados: busca por médico e marcador, `?filtro=` e esconder a barra (que levaria junto o "Atualizar"). Tudo ficou para decisão.
- [ ] PV2-09 · Exportar CSV: funcionalidade nova.
- [x] PV2-10 · `ExamRow`: coluna de 160 px, pílula à esquerda a partir de md, nó sem anel.
- [~] PV2-11 · Exame: feitas as datas de coleta e de emissão na linha do tempo. Ficaram para decisão "Acompanhar coleta", "Ver coleta" e esconder "Ver laudo".
- [ ] PV2-12 · `?enviar=1`: funcionalidade nova.
- [ ] PV2-13 · Endereço e "Como chegar": funcionalidade nova (store de postos e link externo).
- [ ] PV2-14 · .ics, "Agendar novamente" e "Ver resultados": funcionalidade nova.
- [x] PV2-15 · Lista de coletas em colunas a partir de md. O bloco de ações usa `min-w-[152px]` (e não largura fixa), porque "Reenviar" + "Cancelar" + preparo não cabem em 152 px.
- [~] PV2-16 · Agendar: feitos a) etapas, b) escolher e depois confirmar pelo Resumo, com o Preparo no horário escolhido, e d) unidades em radiogroup. Ficou para decisão o c) painel de sucesso, cuja ação principal é o .ics.
- [ ] PV2-17 · Store de agendamentos: só servia ao contador da PV2-18.
- [ ] PV2-18 · Contadores do menu: dado novo no menu.
- [ ] PV2-19 · Exames novos: **decisão D2**.
- [~] PV2-20 · Busca ⌘K: feitos os Atalhos e os Exames recentes sem termo, os subtítulos das páginas, a situação no subtítulo no lugar da pílula e os limites 4/3. Ficaram para decisão a busca de coletas, o grupo Marcadores, as palavras-chave e o placeholder novo.
- [ ] PV2-21 · Avisos de entrada e saída: comportamento novo.
- [~] PV2-22 · Feito o novo nome do cartão, "Privacidade e segurança". "Senha › Alterar" é funcionalidade nova.
- [ ] PV2-23 · Termos e opt-in: **decisão D4**.
- [ ] PV2-24 · Manter conectado: **decisão D5**.
- [x] PV2-25 · Eixo das tendências com o mês curto da primeira e da última coleta. Quando os anos diferem, o rótulo leva o ano.

Legenda: [x] feito · [~] só a parte de design · [ ] não feito (decisão ou funcionalidade nova)

## Verificação

- `tsc --noEmit` (web): ok.
- `eslint .`: os mesmos 2 avisos da base.
- `vitest run` (web): 532 testes ok (a base tinha 517).
- O `npm run type-check` da raiz já falhava antes nos testes da API. A correção está em `main` (`e795ec4`) e ainda não foi trazida para esta branch.
- Ainda falta a conferência visual no navegador (375 a 1440 px, claro e escuro).

## Rodada 2 · Decisões aprovadas (16/11/2026)

O usuário aprovou todas as decisões (D1–D6 e os itens que ficaram de fora). D6 = opcional. D4: os Termos e a Política ainda não existem, então o aceite ficou pronto e desligado.

- [x] PV2-02 Excluir conta, com o texto conforme o backend: a exclusão é imediata, e o prontuário (laudos, agendamentos, nome, CPF, nascimento) fica retido.
- [x] PV2-04 Título da aba.
- [x] PV2-05 Acompanhamento com dado real (lib/acompanhamento).
- [x] PV2-06 Pendência e guardar documento.
- [x] PV2-08 Busca, `?filtro=` e esconder a barra · PV2-09 CSV.
- [x] PV2-11 "Acompanhar coleta" e "Ver coleta" (agendamentoId em Exam).
- [x] PV2-12 `?enviar=1`.
- [x] PV2-13 usePostos, endereço e "Como chegar". `DS.Button` passou a aceitar `href`.
- [x] PV2-14 .ics, "Agendar novamente" (`?posto=`) e "Ver resultados" · PV2-16c "Agendamento confirmado".
- [x] PV2-17 cacheDeModulo + useAgendamentos.
- [x] PV2-18 e 19 Contadores e exames novos (lib/vistos).
- [x] PV2-20 Marcadores, coletas, palavras-chave e placeholder.
- [x] PV2-21 Avisos de entrada e saída. `<Avisos/>` foi para o App.
- [x] PV2-22 Alterar senha. A senha atual é conferida num cliente Supabase à parte.
- [x] PV2-23 Aceite dos termos (flag desligada, URLs vazias em lib/termos). A API grava o aceite em app_metadata.
- [x] PV2-24 Manter conectado.
- [x] PV2-26 Verificação em duas etapas (API, migration e web). Desenho em `desenho-dois-fatores.md`.
- [ ] PV2-27 Declaração de comparecimento: não foi pedida nesta rodada.

## Teste em produção (16/11/2026)

Web `8efb399` na Vercel e API nova na VPS. Teste pela API com conta temporária (apagada no fim):

- Ligar com código, bloqueio da sessão nova sem código (403 `DOIS_FATORES_PENDENTE`), código errado, código certo, reuso do código, sessão aberta só pelo código (bloqueada), excluir conta sem código e com código errado (recusado), desligar: tudo como no desenho.
- O SMTP do Supabase recusava a senha (535 do Gmail) e o código tinha 8 dígitos. Corrigido no painel: SMTP `sistemas@laboratoriolab.com.br` (o mesmo do FlowLab), remetente `no-reply@`, código de 6 dígitos. Confirmação de cadastro e "Esqueci minha senha" voltaram a sair.
- Falta: as telas no navegador e o código digitado a partir do e-mail.
- Risco achado: a consulta admin por CPF está ligada em produção para `teste@gmail.com` (caixa que não é do laboratório, senha fraca, sem a verificação em duas etapas).
