# 11 — Perfil e Configurações

**What to build:** Perfil e Configurações no visual novo, com o mesmo conteúdo, as mesmas ações e as mesmas fontes de dados de hoje. Perfil edita os dados como hoje; Configurações mantém a troca de tema e as flags (`MOSTRAR_NOVIDADES`, `MOSTRAR_PRIVACIDADE_EXTRAS`, `MOSTRAR_NOTIFICACOES`). Nenhum controle novo sem backend (ex.: sair de outros aparelhos).

**Blocked by:** 04 (shell)

**Status:** in-review

- [x] Perfil: mesma edição, mesmas validações, mesma chamada.
- [x] Configurações: troca de tema funciona e persiste; flags respeitadas.
- [x] Nenhum controle sem backend introduzido.
- [ ] Conferência manual: 360/768/1024/1440 px, claro e escuro, Tab com foco visível e Esc, `prefers-reduced-motion`, estados carregando/vazio/erro, lado a lado com a tela do protótipo.
- [x] Testes da tela reescritos onde os seletores mudaram, cobrindo o mesmo comportamento; nenhum teste removido sem substituto.
- [x] Eventos do Umami e flags da tela inalterados (mesmos nomes, mesmos gatilhos).
- [x] Textos seguem a regra da spec (design, exceto preparo, LGPD, erros da API, comportamentos exclusivos do sistema atual; nada que prometa comportamento inexistente).
- [ ] `vitest`, `type-check`, `lint` e `build` verdes; revisão visual do autor do design e de comportamento do tech lead.

## Comments

- Implementado em `feat/portal-v2`: `pages/ProfilePage.tsx` e `pages/SettingsPage.tsx` no LAB DS, montadas na raiz `.lh-v2` (entraram em `TELAS_V2`). Saiu a prop `dark` das duas. `usePaciente` ganhou `recarregar` (acréscimo, para "Tentar novamente"). `MensagemDeErro` foi de `components/documents/` para `components/portal/`, porque agora serve a duas telas.
- **Perfil:** os mesmos campos editáveis (nome, telefone com máscara, operadora e plano), as mesmas validações (`validarNome`, `validarTelefone`), o mesmo `PUT /pacientes/me` com o mesmo corpo e os eventos `perfil_salvo` e `logout`. CPF, nascimento e e-mail aparecem bloqueados na edição, com os textos atuais ("Não editável", "Altere pelo login"). `MOSTRAR_NOTIFICACOES` continua controlando a pílula.
- **Configurações:** o tema passa pelo mesmo `handleSetDark` (`tema_alternado` e `salvarTema`), agora com `aria-pressed`. `MOSTRAR_NOVIDADES` e `MOSTRAR_PRIVACIDADE_EXTRAS` continuam escondendo os mesmos cartões e linhas. Sem controle novo:
  - idioma, fuso e unidades são só leitura (os valores usam o texto do design);
  - dispositivos mostra só este aparelho, como hoje, sem "Sair" de outros (issue 19);
  - não há linha "Senha" nem caixa "Alterar senha".
- Decisões para o tech lead confirmar:
  - **"Excluir minha conta" continua sem ação**, como hoje: o "Solicitar" não tem handler. A API já tem `DELETE /pacientes/me`, mas ligar o botão é comportamento novo, fora de "mesmas ações". O texto "Apaga todos os seus dados após 30 dias" é o atual (LGPD), mas não bate com a API: ela exclui na hora e retém prontuário. Recomendo uma issue própria para ligar o botão com confirmação e corrigir o texto.
  - **Novo em relação à tela antiga:**
    - aviso "Dados atualizados" ao salvar (sem a frase do protótipo sobre agendamentos);
    - estados de carregando (nó e esqueleto) e de erro com "Tentar novamente": antes a tela mostrava "—" em tudo;
    - o erro de um campo some ao digitar nele;
    - Enter salva;
    - Salvar e Cancelar ficam no fim do formulário, como no protótipo ("Salvar alterações").
  - Com o perfil carregando ou com erro, o "Sair" da tela não aparece. Continua no menu da conta.
  - O título do Perfil não leva o ponto azul, como no cartão do protótipo (não usa `PageHeader`).
  - Subtítulo "Titular · Operadora · Plano" (do design); sem convênio, fica "Titular da conta".
  - Os subtítulos de "Por e-mail" e "Por SMS" (atrás de flag) eram e-mail e telefone fictícios e passaram a texto genérico.
- Conferido em navegador (Vite com Supabase e API dublados pelo Playwright):
  - `/perfil` (leitura e edição com erro de validação e erro da API) e `/configuracoes` em 360/768/1024/1440, claro e escuro: 0 px de estouro horizontal em todas e nenhum erro de página;
  - estado carregando (768 claro) e de erro (768 escuro);
  - o tema escolhido sobrevive ao recarregar;
  - anel de foco visível em Solicitar, Claro e Escuro, ao avançar com Tab;
  - `prefers-reduced-motion`: nenhuma animação rodando em `/perfil` a 360.

  Olhei as capturas: perfil claro 1440, edição escuro 360, configurações escuro 1440 e claro 360, carregando, erro. Lado a lado com o protótipo só pelo código das telas, não renderizado. Esc não se aplica: as duas telas não têm caixas. **Falta:** revisão visual do autor do design e de comportamento do tech lead.
- Testes:
  - `ProfilePage.test` (novo, 14) e `SettingsPage.test` (novo, 8);
  - `App.test` ganhou a troca de tema em `/configuracoes`, com aplicação, persistência e evento;
  - antes não havia teste próprio destas telas, e nenhum foi removido.

  Portão: `vitest` 451/451, `type-check`, `lint` (0 erros, 2 avisos fora desta issue) e `build` verdes.

- 2026-11-04: "Idioma e região" com os selects do design (`lib/regiao.ts`). **Fuso horário funciona**: Brasília (padrão), Manaus e Fernando de Noronha; a escolha fica no navegador (`labhub:fuso`) e todas as datas/horas do portal passam a usar esse fuso (`lib/datetime`, agrupamento de dias da agenda, `DateBlock`, datas do exame, saudação da visão geral, "gerado em" e idade do laudo). Idioma e Unidades mostram as opções do design, mas só "Português (Brasil)" e "Convencionais (mg/dL)" podem ser escolhidas; as outras estão "(em breve)" — falta tradução (i18n) e conversão de unidades validada pelo laboratório. Preferência não vai para o backend (outro aparelho volta para Brasília).
