## Problem Statement

O portal do paciente só mostra `resultado` de análises clínicas quando encontra a O.S. do Álvaro Online (AOL) correspondente à requisição do apLIS — é a AOL que tem os valores medidos. Hoje esse vínculo depende do `idOsLis`, campo digitado à mão pela recepção na AOL, lido pela listagem `orders/status`, que não filtra por paciente.

Medição de 24/11/2026 (75 requisições de Medicina Laboratorial dos últimos 80 dias, 76 O.S.):

| Situação da O.S. no método atual | Qtde | % |
|---|---|---|
| Achada pelo código da requisição no `idOsLis` | 52 | 68% |
| `idOsLis` vazio — o `laudo` não aparece para o paciente | 19 | 25% |
| `idOsLis` com o código de OUTRA requisição do mesmo paciente | 5 | 7% |

Além do buraco de cobertura, a varredura é cara: 32 s para listar 612 O.S. da entidade em 90 dias, a cada busca ao vivo.

O apLIS guarda, anexado à própria requisição, o PDF do laudo emitido pelo laboratório de apoio (imagem do tipo 14, "Laudo EXTERNO"). Esse PDF traz o número da O.S. e o CPF do paciente em texto extraível. A API de integração do apLIS (`requisicaoImagem`) só devolve os tipos 1 e 5; o tipo 14 só sai pelo site interno do apLIS (`/areas/shared/imagem.php`), que não é API documentada.

## Solution

Usar o PDF "Laudo EXTERNO" anexado à requisição como fonte do vínculo requisição ↔ O.S.: a API lista os anexos tipo 14 da requisição pelo site interno do apLIS, baixa o PDF, extrai O.S. e CPF, confere o CPF contra o paciente do token e grava a O.S. na linha de `exam_results`. Os valores continuam vindo da AOL por O.S. (`PUT /v2/resultados`), como hoje.

O caminho novo é **aditivo e desligável**: a varredura por `idOsLis` continua existindo e cobre tudo que o PDF não resolver (sem anexo, site fora do ar, layout não reconhecido, flag desligada).

Numa segunda entrega, o mesmo anexo passa a ser oferecido ao paciente como "baixar laudo original".

## Evidências (testes de 24/11/2026)

- **Cobertura do anexo** (backup MySQL do apLIS, exame 49 Medicina Laboratorial, jan–nov/2026): 1.696 de 1.703 requisições finalizadas têm ao menos um tipo 14 ativo (99,6%); 1.986 arquivos, todos PDF. `NumExterno` e `ExaAlvaro` preenchidos em 0 de 2.113 requisições — não servem de vínculo.
- **Extração** (113 PDFs: 35 espalhados pelo ano + 78 recentes): O.S. e CPF extraídos em 113 de 113. Três variações de layout no ano: modelo antigo (jan–fev, gerado por iText, rótulo "Ordem Serviço" com o número na linha seguinte), modelo atual ("OS: <número>", rodapé Álvaro) e o mesmo modelo com rodapé Dasa (ago em diante).
- **Ponta a ponta** (35 O.S. extraídas do PDF): a AOL devolveu exames com valores para 35 de 35; latência mediana 4,4 s, máxima 11,3 s por O.S. O CPF da AOL conferiu com o do PDF em 9, divergiu em 0 e veio ausente em 26.
- **Site interno**: 78 PDFs baixados em 27 s numa única sessão.
- **Anexos por requisição**: 88% têm 1 PDF, 12% têm de 2 a 6. Na amostra recente, 3 de 75 tinham 2 PDFs; uma delas com 2 O.S. distintas (pedido despachado em duas remessas).
- **Várias O.S. no mesmo PDF** (auditoria do ticket 01, 25/11/2026, 398 requisições em 80 dias): 60 de 407 PDFs (15%) trazem 2 ou 3 O.S. no mesmo arquivo, uma por página; as 398 requisições somaram 490 O.S. O teste de extração acima não tinha registrado esse caso. Resumo completo nos comentários do ticket 01.

Não medido: quanto tempo depois da liberação o PDF é anexado (`requisicaoimagem.DtaImg` vem nulo no backup).

## User Stories

1. Como paciente, quero ver o `resultado` dos meus exames mesmo quando a recepção não preencheu o `idOsLis` no Álvaro, para não depender de um campo manual para acessar meu `laudo`.
2. Como paciente, quero que um pedido despachado em duas remessas apareça como um pedido só, para não ver cards órfãos.
3. Como paciente, quero baixar o laudo original emitido pelo laboratório de apoio, para apresentar ao médico o documento assinado.
4. Como paciente, quero que nenhum `laudo` de outra pessoa apareça para mim, mesmo que um PDF tenha sido anexado na requisição errada.
5. Como responsável pela operação, quero desligar o caminho novo por configuração, para voltar ao comportamento atual sem deploy se o site do apLIS mudar.
6. Como responsável pela operação, quero ver nos logs quantas O.S. vieram do PDF, quantas do `idOsLis` e quantas divergiram, para decidir quando aposentar a varredura.
7. Como responsável pela segurança, quero que a API use no site do apLIS um usuário próprio e somente leitura, para que uma falha nossa não grave nada no LIS nem bloqueie os outros sistemas que usam o mesmo login.

## Implementation Decisions

- **O paciente vê todos os seus exames** (decisão do responsável pelo produto, 25/11/2026). É a regra que desempata as demais: nenhuma O.S. do paciente fica só em log à espera de uma entrega futura. Onde a estrutura ainda não comporta o ideal (várias O.S. num pedido), a O.S. aparece do jeito possível — card próprio — em vez de não aparecer.
- **Qual O.S. ocupa a linha da requisição** (25/11/2026): a que ocupa mais páginas no PDF, entre as que são do paciente; no empate, a que aparece antes. A ordem do arquivo não serve: nos casos reais a primeira O.S. é a menor.

- **Fonte do vínculo.** O que liga a O.S. à requisição é o PDF estar anexado àquela requisição no apLIS. O campo "OS Lis" impresso dentro do PDF é ignorado: ele repete o `idOsLis` digitado à mão (código, CPF ou vazio).
- **Cliente do site interno.** Módulo novo em `apps/api/src/laudos/`, ao lado de `aplis.ts` e `aol.ts`, com a mesma forma (interface + classe, erros como `IntegrationError`). Expõe só duas leituras: listar os anexos tipo 14 ativos de uma requisição e baixar um anexo em memória. Nenhuma função de gravação do site é implementada.
- **Sem contrato.** O site interno não é API do fornecedor. Toda falha (login, 404, 500, JSON em outro formato, PDF ilegível) vira "sem vínculo pelo PDF" e log, nunca erro para o paciente.
- **Flag.** `LAUDOS_OS_VIA_PDF`, desligada por padrão, lida a cada chamada como `LAUDOS_SOMENTE_ALVARO`. Credenciais em `APLIS_WEB_URL`, `APLIS_WEB_USUARIO`, `APLIS_WEB_SENHA`; sem elas o caminho fica inerte.
- **Login.** Recusas de login seguidas ativam captcha para todos que usam o mesmo usuário (inclusive o backend do projeto-admissao). Após uma recusa o cliente não tenta de novo por 10 minutos. A sessão é reaproveitada entre chamadas do mesmo ciclo de busca.
- **Usuário dedicado.** Antes de ligar em produção, a API usa um usuário do apLIS criado para ela, somente leitura. O usuário hoje usado para investigação tem permissão de gravar.
- **Extração.** Função pura `páginas → { os, layout }`, só para o formato atual ("OS: <n>"). `os` é a lista das O.S. distintas do PDF — um arquivo pode trazer mais de uma —, cada uma com o CPF impresso nas páginas dela e a contagem de páginas, a maior primeiro. O modelo antigo de jan–fev/2026 fica de fora: a busca olha 90 dias para trás e não o alcança mais. Layout não reconhecido devolve a lista vazia, nunca um palpite; uma ocorrência ilegível do rótulo esvazia a lista inteira. A leitura de texto do PDF exige uma dependência nova em Node (o teste usou `pdftotext`, que não existe no ambiente de produção); escolher e registrar a biblioteca faz parte do ticket 01.
- **Primeira entrega é a auditoria.** O caminho novo estreia no script de auditoria de vínculos (ticket 01), comparando O.S. do PDF com O.S. do `idOsLis` contra dados reais, antes de qualquer mudança no portal. É também a medição que precede ligar a flag.
- **Barreira de identidade.** Por O.S., não por arquivo: um mesmo PDF já veio com O.S. de pessoas diferentes (25/11/2026). O CPF das páginas de cada O.S. passa por `conferirCpf` contra o paciente do token. Quando o CPF falta ou diverge, vale a segunda prova (decisão de 25/11/2026): nome + nascimento impressos, os dois e exatos, contra o cadastro da requisição no apLIS. Sem nenhuma das duas, `diverge` descarta a O.S. e loga em `error`; `indisponivel` também descarta — aqui o padrão é fechar, porque o PDF é uma fonte nova e o CPF veio em 113 de 113. A barreira existente sobre o payload da AOL continua valendo depois.
- **Onde entra no fluxo.** Em `#buscarAoVivo`, depois da FASE 2 (requisições registradas) e antes da varredura da FASE 2.5: para cada requisição do paciente — inclusive a que já tem `codigo_os`, que pode ter outras O.S. no PDF —, lê os anexos. A FASE 2.5 roda em seguida e preenche o que continuar sem O.S.; o PDF nunca remove o que o `idOsLis` já mostra: a O.S. que o laudo atribui a outro CPF ainda pode ser vinculada pela varredura, com aviso em log.
- **Mais de uma O.S. por requisição.** Acontece com PDFs diferentes ou dentro do mesmo PDF, e é comum (15% dos PDFs). A linha de `exam_results` é uma por O.S. e `codigo_lis` é único global. A principal (a maior entre as do paciente) entra na linha da requisição; as demais precisam de um elo explícito com o pedido para serem fundidas ao servir — hoje a fusão é só por data de coleta (`fundirPedidosPorColeta`), que não cobre remessas em datas diferentes. O ticket 02 põe a principal na linha da requisição e grava cada uma das demais como linha própria, só com a O.S. — o paciente vê todas desde já, como cards do Álvaro; o elo que as funde no card do pedido é o ticket 03.
- **Divergência entre as fontes.** Quando a linha já tem `codigo_os` pelo `idOsLis` e o PDF aponta outra requisição do mesmo paciente (7% na amostra), nada é sobrescrito: o vínculo existente fica e a divergência é logada. Decidir qual fonte vence depende de olhar os casos reais (ticket 04).
- **PDF não é persistido** nesta primeira entrega: é lido em memória e descartado. Nome e CPF nunca vão para log.
- **Download do laudo original.** Rota autenticada que resolve o `laudo` pelo paciente do token, busca o anexo ao vivo, refaz a conferência de CPF no PDF e devolve o arquivo. Registra na trilha de auditoria de acesso. Com mais de um anexo, a rota lista e o paciente escolhe. Botão na tela do `laudo` conforme `docs/DESIGN.md`.
- **Documentação.** `docs/LAUDOS_LIS.md` ganha a seção do vínculo pelo PDF e as medições acima; `ARCHITECTURE.md` e `.env.example` ganham a integração nova.

## Testing Decisions

- O extrator é testado como função pura, com textos sintéticos do layout atual nas duas variações de rodapé (nenhum PDF nem dado real de paciente entra no repositório), mais os casos de recusa: layout desconhecido (inclusive o modelo antigo), O.S. ausente, CPF ausente.
- O cliente do site interno é testado com `fetch` simulado: login, reaproveitamento de sessão, trava de 10 minutos após recusa, filtro de tipo 14 ativo, e cada falha virando "sem dado".
- O serviço é testado com os dublês que `laudos.test.ts` já usa para ApLIS, AOL e repositório: O.S. vinda do PDF grava o vínculo; CPF divergente descarta; flag desligada não chama o site; site fora do ar cai na varredura; linha com `codigo_os` não é sobrescrita; várias O.S. na mesma requisição, em PDFs diferentes e no mesmo PDF.
- A rota de download é testada no boundary HTTP: sem token, `laudo` de outro paciente, CPF do PDF divergente, sucesso com registro de auditoria.
- Antes de ligar a flag em produção, repetir contra dados reais a medição de cobertura com o script de auditoria do ticket 01, já com o usuário dedicado do ticket 06.

## Out of Scope

- Aposentar a varredura `orders/status`. Só depois de a flag rodar em produção e os logs mostrarem o que resta para ela.
- O layout antigo do PDF (jan–fev/2026, rótulo "Ordem Serviço"), fora da janela de 90 dias da busca.
- Extrair valores de exame do PDF. Os valores continuam vindo da AOL, estruturados.
- Persistir o PDF no Storage do LAB-HUB.
- Outros tipos de anexo do apLIS (pedido, guia, frasco, documento).
- Outros exames além de Medicina Laboratorial. Captura Híbrida também tem tipo 14 em volume, mas não foi testada.
- Qualquer gravação no apLIS.
- App mobile e FlowLab.

## Further Notes

- O caminho com contrato é o apLIS expor o tipo 14 na API de integração (`requisicaoImagem`). Vale pedir ao fornecedor em paralelo; se sair, o cliente do site interno é trocado sem mexer no resto.
- O layout do PDF mudou três vezes em 2026. A extração precisa só de dois campos e falha fechada, mas o log de "layout desconhecido" deve ser acompanhado.
- Se o anexo for incluído pela recepção com atraso em relação à liberação, o ganho só aparece depois disso — é a medição que ficou faltando.
- Scripts e amostras dos testes ficaram fora do repositório por conterem dados de pacientes.
