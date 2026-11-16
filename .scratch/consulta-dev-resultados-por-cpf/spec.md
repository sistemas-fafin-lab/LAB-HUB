## Problem Statement

O LAB-HUB atualmente funciona como portal do paciente: a aba Resultados lista apenas os `resultado` e `laudo` associados ao paciente identificado pelo token da sessão. Durante o desenvolvimento, é necessário consultar os resultados de outro paciente pelo CPF para validar integrações, dados e comportamentos da tela. Hoje não existe uma capacidade administrativa para essa consulta.

A arquitetura documentada mantém as telas operacionais do laboratório no FlowLab, não no LAB-HUB. Portanto, esta solicitação não cria uma área operacional de laboratório: cria somente uma capacidade temporária, local/dev e read-only para diagnóstico do próprio desenvolvimento.

## Solution

Adicionar à aba Resultados do web do LAB-HUB um campo de consulta administrativa por CPF, visível somente para a sessão cujo email seja `teste@gmail.com` e somente em ambiente local/dev.

O administrador de testes informa um CPF válido. A API autentica a sessão, confere o email autorizado no servidor, localiza o paciente ativo e devolve os `resultado` do FlowLab junto dos `laudo` do LIS já armazenados em cache. A consulta não deve iniciar uma nova busca no LIS.

A tela substitui temporariamente a lista do próprio paciente pela lista read-only do paciente consultado, identifica claramente o paciente pelo nome e CPF e oferece uma ação para retornar aos próprios resultados.

## User Stories

1. Como administrador de testes, quero ver o campo de consulta por CPF na aba Resultados, para validar os resultados de pacientes diferentes da conta usada na sessão.
2. Como administrador de testes, quero usar a mesma sessão autenticada do portal, para não precisar de um segundo fluxo de login.
3. Como usuário não autorizado, quero que o campo administrativo não apareça, para não ser induzido a consultar dados de terceiros.
4. Como usuário não autorizado que tente chamar a API diretamente, quero receber uma recusa, para que esconder o campo no navegador não seja a única proteção.
5. Como administrador de testes, quero digitar o CPF com máscara visual `000.000.000-00`, para reduzir erros de digitação.
6. Como administrador de testes, quero que a API receba o CPF normalizado somente com dígitos, para que a busca seja compatível com o formato persistido no cadastro do paciente.
7. Como administrador de testes, quero que o CPF tenha os dígitos verificadores validados antes da consulta, para evitar requisições inúteis com identificadores inválidos.
8. Como administrador de testes, quero iniciar a busca pelo botão ou pela tecla Enter, para escolher uma interação rápida e previsível.
9. Como administrador de testes, quero ver um estado de carregamento durante a busca, para saber que a consulta está em andamento.
10. Como administrador de testes, quero receber uma mensagem específica quando o CPF for inválido, para corrigir a entrada sem perder o contexto da tela.
11. Como administrador de testes, quero receber uma mensagem específica quando nenhum paciente ativo corresponder ao CPF, para diferenciar cadastro inexistente de ausência de resultados.
12. Como administrador de testes, quero receber uma mensagem específica quando o paciente existir mas não tiver resultados disponíveis, para distinguir esse caso de um CPF não encontrado.
13. Como administrador de testes, quero ver o nome e o CPF completo do paciente consultado no banner, para confirmar visualmente que estou vendo a pessoa correta.
14. Como administrador de testes, quero ver todos os resultados ativos disponíveis para o paciente, independentemente de estarem liberados ou em análise, para validar o histórico retornado pelas fontes.
15. Como administrador de testes, quero que os `resultado` recebidos do FlowLab apareçam na consulta, para verificar a fonte de resultados já persistida no LAB-HUB.
16. Como administrador de testes, quero que os `laudo` disponíveis no cache de `exam_results` apareçam na consulta, para ver a mesma composição de fontes apresentada na aba Resultados do paciente.
17. Como administrador de testes, quero que a política de exibição vigente dos laudos seja mantida, incluindo o corte configurado para fontes do Álvaro, para que a consulta administrativa não apresente dados que a visão normal esconderia.
18. Como administrador de testes, quero que a consulta use somente dados já persistidos em cache, para evitar latência e efeitos colaterais de uma varredura ao vivo nos LIS.
19. Como administrador de testes, quero que os itens sejam ordenados do mais recente para o mais antigo pela mesma regra da aba Resultados, para comparar a consulta com a visão normal.
20. Como administrador de testes, quero ver a lista no mesmo formato resumido das linhas de resultado existentes, para não manter uma segunda representação visual do `resultado` e do `laudo`.
21. Como administrador de testes, quero que as linhas consultadas sejam somente leitura e não abram detalhe de exame, laudo ou declaração, para manter o escopo da primeira versão restrito à conferência da lista.
22. Como administrador de testes, quero que a lista dos meus próprios resultados seja substituída enquanto uma consulta estiver ativa, para não misturar resultados de duas pessoas na mesma visão.
23. Como administrador de testes, quero que os filtros de status, período e texto da visão normal fiquem ocultos durante a consulta administrativa, para não confundir filtros de um contexto com o outro.
24. Como administrador de testes, quero poder submeter outro CPF enquanto estou no modo administrativo, para comparar pacientes sem sair e entrar novamente na aba.
25. Como administrador de testes, quero voltar explicitamente aos meus resultados, para encerrar o contexto de consulta de terceiro.
26. Como administrador de testes, quero que voltar aos meus resultados limpe o CPF consultado, para que dados de uma consulta anterior não permaneçam visíveis sem indicação.
27. Como administrador de testes, quero que trocar de aba encerre o modo administrativo e limpe o CPF, para reduzir o risco de deixar dados de terceiro expostos na navegação.
28. Como administrador de testes, quero que o botão Atualizar repita a consulta do CPF atualmente exibido, para conferir alterações já persistidas sem precisar redigitar o identificador.
29. Como administrador de testes, quero receber uma mensagem genérica e uma forma de tentar novamente quando a API ou a rede falhar, para diferenciar falha técnica de ausência de resultados sem expor detalhes internos.
30. Como paciente, quero que meu fluxo normal da aba Resultados continue igual quando não houver consulta administrativa ativa, para que a nova capacidade de teste não altere o portal do paciente.
31. Como paciente não administrador, quero que meus resultados continuem isolados pelo paciente do token, para que a nova consulta não crie um caminho de acesso cruzado.
32. Como responsável pela aplicação, quero que uma configuração administrativa ausente ou inválida falhe fechada, para que nenhum usuário se torne administrador por acidente.
33. Como responsável pelo ambiente, quero manter o email autorizado somente na configuração local/dev não versionada, para que a autorização de teste não seja confundida com uma credencial de produção.
34. Como responsável pela aplicação, quero que o app mobile não receba essa capacidade nesta versão, para manter o escopo limitado ao web usado nos testes.

## Implementation Decisions

- A capacidade é um diagnóstico temporário de desenvolvimento, não uma nova área de operação interna do laboratório. O FlowLab continua sendo o sistema para operadores, analistas e gestores.
- Não será criada tabela de administradores, role persistida, tela de gestão de usuários ou migration de autorização. Para esta versão existe exatamente um email autorizado: `teste@gmail.com`.
- A API usará uma variável de ambiente de servidor `ADMIN_EMAIL`; o web usará `VITE_ADMIN_EMAIL` apenas para controlar a visibilidade da interface. Ambas devem ser configuradas localmente com o mesmo valor e não devem ser versionadas. A decisão de autorização pertence à API; o valor exposto ao browser nunca é uma barreira de segurança.
- A funcionalidade será habilitada apenas em local/dev. Fora desse ambiente, o campo não aparece e o endpoint não autoriza a consulta, mesmo que uma configuração residual exista.
- A autenticação administrativa validará o JWT Supabase e o email normalizado do usuário antes de acessar o CPF-alvo. O caminho administrativo não deve depender de resolver o `pacienteId` do administrador como se ele fosse o titular consultado.
- Requisição sem token ou com token inválido responde `401`. Usuário autenticado cujo email não corresponde ao autorizado responde `403`. Ausência de configuração, email vazio ou comparação inválida falha fechada.
- O novo contrato de leitura será um endpoint administrativo de resultados com o CPF como query parameter. O CPF será normalizado e validado no boundary da API; a busca no banco será exata, aproveitando a unicidade do CPF.
- Uma resposta bem-sucedida conterá a identidade mínima do paciente-alvo (`id`, `nome` e `cpf`) e as duas fontes de dados necessárias para a aba: os `resultado` do FlowLab e os `laudo` do cache LIS. Não serão retornados dados de outros pacientes nem capacidades de download.
- CPF válido sem paciente ativo responde `404`. Paciente ativo sem itens responde `200` com listas vazias. Falhas de banco ou de composição respondem erro de servidor com mensagem segura e não são convertidas em “nenhum resultado”.
- O paciente-alvo será filtrado para excluir registros com `excluido_em` preenchido. Pacientes ativos ainda não reivindicados podem ser consultados se tiverem CPF e resultados associados.
- Os `resultado` serão buscados por `paciente_id` do paciente encontrado. Os `laudo` serão lidos pelo repositório/cache existente, com a conferência de CPF e a descriptografia feitas no servidor.
- A consulta administrativa não chamará o serviço de busca ao vivo do LIS, não usará `refresh=true` e não fará nova varredura de ApLIS/AOL. O botão Atualizar repete a leitura do cache e dos `resultado` persistidos.
- A composição manterá as regras existentes de mapeamento, retificação, corte de fontes e ordenação. O web continuará convergindo `resultado` e `laudo` para a representação de linha já usada pela aba.
- Todos os estados suportados pela aplicação, incluindo `analyzing` e `ready` e seus equivalentes de laudo, permanecem elegíveis para a lista. O recorte de fonte já vigente continua valendo.
- A aba Resultados manterá o estado da conta atual separado do estado da consulta administrativa. A consulta não reutilizará o cache global destinado aos resultados do paciente autenticado.
- No estado normal, o administrador vê a aba existente com busca por nome/categoria, filtros e Atualizar. O campo de CPF é acrescentado à mesma toolbar.
- No estado administrativo, a lista própria é substituída pela lista do paciente-alvo, os filtros normais ficam ocultos, e o banner mostra nome e CPF completo. A entrada permite uma nova consulta e existe um controle explícito para voltar à lista própria.
- As linhas administrativas serão renderizadas em modo não interativo: não chamarão a navegação atual para detalhe de exame e não oferecerão laudo ou declaração.
- A máscara é apenas apresentação. O valor submetido terá 11 dígitos e usará a validação de CPF já existente no domínio da API.
- Mensagens de estado serão distintas: CPF inválido, paciente não encontrado, paciente sem resultados e falha técnica. Falhas técnicas terão ação de tentativa novamente sem expor stack, SQL ou detalhes de integração.
- Não haverá gravação na trilha de auditoria nesta versão, conforme decisão explícita. O CPF da query continuará protegido pelo mecanismo existente de redação de identificadores nos logs HTTP.
- Não haverá alteração no app mobile, no FlowLab ou no modelo de dados para esta primeira entrega.

## Testing Decisions

- Bons testes devem observar comportamento externo nos boundaries da API e da tela, não nomes de helpers, chamadas internas específicas ou a estrutura privada do estado. O foco é confirmar quem pode consultar, quais dados são entregues e o que o usuário vê em cada estado.
- O seam principal de segurança e contrato será o boundary HTTP do Fastify, usando injeção de requisição. Ele deve cobrir autenticação, autorização pelo email, fail-closed de configuração, normalização/validação de CPF, paciente excluído, paciente inexistente, paciente sem resultados, retorno combinado das fontes, ordenação, erros e ausência de chamadas ao LIS.
- O seam de persistência existente deve ser reutilizado com o mock encadeável do Supabase já usado pela suíte da API, verificando o filtro por `paciente_id`, o uso da identidade do paciente encontrado e a leitura das colunas cifradas sem exigir detalhes de implementação do repositório.
- O seam de interface será o DOM renderizado de `ResultsPage`, usando React Testing Library e Vitest, como nos testes existentes da página e de `ExamRow`. Ele deve cobrir visibilidade para email autorizado e não autorizado, máscara, validação sem requisição, Enter/botão, loading, banner, filtros ocultos, lista read-only, estados vazios, erro técnico, voltar, limpeza, nova consulta e Atualizar.
- A regressão da visão normal deve confirmar que um usuário não administrador continua vendo apenas os próprios resultados, que os filtros existentes continuam funcionando fora do modo admin e que a navegação de detalhe não muda para a lista normal.
- A composição de fontes deve aproveitar a cobertura existente de `useResultados`: resultados FlowLab e laudos LIS devem permanecer independentes, ordenados pela data vigente e sem vazamento de cache entre contas ou entre o paciente autenticado e o paciente consultado.
- A política de “sem busca ao vivo” deve ser testada observando que nenhuma chamada de rede aos clientes ApLIS/AOL ocorre durante a consulta administrativa ou durante o Atualizar administrativo.
- A redação do CPF em logs deve permanecer coberta pelo teste existente do serializador HTTP; qualquer novo parâmetro identificador deve seguir o comportamento fail-closed já estabelecido.
- Não será criado um harness end-to-end novo nesta entrega, pois o repositório já possui seams HTTP e DOM suficientes para o comportamento contratado.

## Out of Scope

- Admin em produção, homologação ou qualquer ambiente não local/dev.
- Role persistida, tabela de administradores, múltiplos emails, convite, gestão ou revogação de administradores pela interface.
- Auditoria específica da consulta administrativa ou alteração da trilha `auditoria_acesso`.
- Tela operacional de laboratório no LAB-HUB; recepção, operadores, analistas, gestores e fluxo interno continuam no FlowLab.
- Busca ao vivo, revalidação forçada ou ampliação da janela de descoberta do LIS.
- Garantia de histórico completo além dos `resultado` persistidos e dos `laudo` presentes no cache atual; dados antigos podem continuar ausentes conforme a política existente do LIS.
- Visualização de detalhes de exame, analitos, laudo completo, PDF, declaração ou URLs assinadas do paciente-alvo.
- Filtros de status, período ou texto sobre a lista administrativa.
- Consulta por nome, busca parcial de CPF ou consulta de qualquer outro dado cadastral além de CPF.
- Compartilhamento da consulta por URL, persistência do CPF em rota ou armazenamento local.
- Alteração, exclusão, correção ou qualquer outra operação de escrita nos resultados ou no paciente.
- Alteração do app mobile, do FlowLab ou dos contratos de integração de origem.

## Further Notes

- O email `teste@gmail.com` é uma configuração de teste, não um segredo. O controle efetivo deve permanecer no servidor, e os valores locais não podem ser adicionados ao Git.
- O CPF e os resultados clínicos são dados sensíveis. Mesmo sem auditoria nesta versão, o endpoint deve retornar somente o paciente-alvo autorizado e manter o CPF fora de logs em claro.
- A escolha de cache-only é deliberada: “todos” significa todos os dados disponíveis nas fontes persistidas e visíveis pela política atual do LAB-HUB, não uma promessa de histórico integral do LIS.
- Antes de qualquer habilitação em produção, esta especificação deve ser substituída por uma decisão de autorização persistente, auditoria de acesso e revisão da arquitetura que hoje reserva a operação interna ao FlowLab.
