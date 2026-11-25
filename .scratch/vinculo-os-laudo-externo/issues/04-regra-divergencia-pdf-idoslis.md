# 04: Regra para divergência entre PDF e `idOsLis`

**What to build:** Quando o PDF anexado diz que a O.S. é da requisição A e o `idOsLis` digitado no Álvaro diz que é da requisição B (do mesmo paciente), o portal mostra a O.S. no pedido certo, por uma regra definida — em vez de manter o que foi gravado primeiro.

Na medição de 24/11/2026 isso ocorreu em 5 de 76 O.S. (7%), sempre entre requisições do mesmo paciente. Não se sabe qual das duas fontes está certa.

**Blocked by:** 01 (a saída da auditoria lista os casos reais a examinar).

**Status:** done

- [ ] Os casos divergentes apontados pela auditoria foram examinados com a recepção, e a conclusão está nos comentários deste ticket.
- [x] A regra de qual fonte vence está decidida e registrada na documentação dos laudos LIS.
- [x] A busca ao vivo aplica a regra; o vínculo já gravado pela fonte perdedora é corrigido na revalidação seguinte.
- [x] Toda correção de vínculo é logada com requisição de origem, requisição de destino e O.S.
- [x] A regra nunca move uma O.S. para requisição de outro paciente: a conferência de CPF continua decidindo antes.
- [x] Testes cobrem a regra nos dois sentidos e o caso de CPF divergente.

## Comments

### 25/11/2026 — casos reais examinados (sem a recepção) e regra implementada

**O primeiro critério continua aberto**: os casos foram conferidos contra o
apLIS e o Álvaro, não com a recepção. A regra abaixo foi escolhida pelo que os
dados mostram e precisa da confirmação do responsável pelo produto; está atrás
da flag `LAUDOS_OS_VIA_PDF` (desligada por padrão) e a fonte vencedora é uma
constante só (`FONTE_QUE_VENCE`, em `apps/api/src/laudos/divergencia.ts`).

**Regra: vence o PDF.** A O.S. fica na requisição em que o laudo está anexado.

Auditoria repetida (398 requisições de Medicina Laboratorial, 80 dias): 16 O.S.
com as fontes em requisições diferentes. Para cada uma: data de coleta e exames
da O.S. no Álvaro × datas, exame e finalização das duas requisições no apLIS.

| O.S. | PDF → | idOsLis → | O que o `idOsLis` aponta |
|---|---|---|---|
| 396493016 | 0040002898007 | 0200011959001 | requisição de **outro paciente** (Captura Híbrida, 2022) |
| 395417350 | 0040002816001 | 0200066895002 | requisição de PCR; a O.S. tem 30 exames de análises clínicas |
| 397518969 | 0040002994006 | 0200067915006 | requisição de PCR, não finalizada; a O.S. tem 23 exames |
| 394339930 | 0040002718008 | 0040001931002 | requisição de 11/06, quatro meses antes da coleta (15/10) |
| 392814527 | 0040002540005 | 0040002541002 | vizinha, finalizada, com laudo próprio de outra O.S. (392813973) |
| 394054286 | 0040002679002 | 0040002680008 | vizinha, finalizada, com laudo próprio de outra O.S. (394058550) |
| 394088958 | 0040002686000 | 0040002688004 | vizinha, finalizada, com laudo próprio de outras O.S. |
| 395272737 | 0040002808006 | 0040002807009 | mesmo dia, nunca finalizada, sem laudo |
| 395493078 | 0040002820008 | 0040002825003 | dia seguinte, nunca finalizada, sem laudo |
| 395498645 | 0040002822002 | 0040002824006 | mesmo dia, nunca finalizada, sem laudo |
| 397729752 | 0040002822002 | 0040002824006 | idem (O.S. de um exame, colhida três semanas depois) |
| 395592235 | 0040002830007 | 0040002829001 | mesmo dia, nunca finalizada, sem laudo |
| 396112056 | 0040002883003 | 0040002882006 | mesmo dia, nunca finalizada, sem laudo |
| 390843266 | 0040002482008 | 0040002486006 | dia seguinte, nunca finalizada; **a coleta da O.S. (1 exame) é a data dela** |
| 394818261 | 0040002749002 | 0040002757007 | dia seguinte, nunca finalizada; **a coleta da O.S. (1 exame) é a data dela** |
| 393366633 | 0040002624002 | 0040002623005 | não é divergência: o laudo está anexado nas duas requisições |

- Em 4 o `idOsLis` está errado sem dúvida (outro paciente, outro exame, outra época).
- Em 3 o PDF dá uma O.S. para cada requisição vizinha; o `idOsLis` deixaria uma delas sem nenhuma.
- Em 8 o `idOsLis` aponta uma requisição que nunca foi finalizada e não tem laudo — parece cadastro em duplicidade: a recepção digitou um código e o laboratório trabalhou no outro.
- **Nenhum caso em que o `idOsLis` esteja certo contra o PDF.** Os dois em negrito são os que valem levar à recepção: a data favorece o `idOsLis`, mas o pedido que ele aponta não tem laudo liberado.
- O caso de outro paciente nunca entra na regra: `idOsLis` que não aponta requisição do próprio paciente não conta como afirmação.

O que foi implementado:

- `divergencia.ts` — `pedidoDaOs(pdf, idOsLis)`, pura. Laudo anexado em duas requisições: vale a que o `idOsLis` aponta; se ele aponta uma terceira, nada é movido.
- `service.ts` — a listagem do Álvaro passou para antes do passo do PDF (FASE 2.1), para as duas fontes estarem na mesa; `#colocarNoPedido` grava e corrige. A correção só acontece com as duas fontes afirmando na mesma busca (site ou Álvaro fora do ar não move nada), e roda também na revalidação em segundo plano.
- `repository.ts` — `desvincularOs`: tira a O.S. da linha da requisição errada junto com o laudo em cache.
- Log `warn` "Vínculo da O.S. corrigido" com `requisicaoOrigem`, `requisicaoDestino`, `codigoOs`; `vinculosCorrigidos` nos dois resumos.
- Corrigido de passagem: O.S. nova com as fontes divergindo era gravada **nas duas** requisições (o PDF punha em A e a varredura em B, sem conferir se ela já existia).
- Testes: `test/laudosDivergencia.test.ts` (a regra, com cada fonte vencendo) e o bloco "divergência entre o PDF e o idOsLis" em `test/laudosVinculoPdf.test.ts` (os dois sentidos, CPF divergente, `idOsLis` de outro paciente, laudo em duas requisições, Álvaro fora do ar, flag desligada).
- Documentado em `docs/LAUDOS_LIS.md`, "Quando o PDF e o `idOsLis` divergem".

Limites:

- Não exercitado contra o banco real (dublês em memória), como o resto do caminho do PDF.
- Desvincular e regravar não é transação: se a segunda gravação falhar, a O.S. some até a busca seguinte, que a regrava.
- Desligar a flag depois de uma correção: a varredura sem a flag não confere se a O.S. já existe e pode pô-la também na requisição do `idOsLis`. É o mesmo risco de qualquer O.S. que o PDF e o `idOsLis` situam em pedidos diferentes desde o ticket 02.
- No serviço, os testes exercitam só "vence o PDF"; "vence o `idOsLis`" está coberto na função pura.
- Trocar a regra para "vence o `idOsLis`" é mudar a constante e reescrever os testes do serviço; a função já cobre os dois lados.

### 25/11/2026 — revisão em dois eixos

Corrigido depois da revisão:

- **Vai-e-volta com leitura parcial.** Laudo anexado em A e B, `idOsLis` = B: se a leitura do laudo de B falhasse naquela busca, o PDF pareceria apontar só A, a O.S. iria para A e voltaria na busca seguinte. Agora não há correção quando o laudo de alguma requisição do paciente não pôde ser lido, nem para a O.S. que a identidade recusou em algum laudo.
- O log da correção sai logo depois de desfazer o vínculo antigo, antes da regravação — se ela falhar, a origem e o destino já estão registrados.

Fora do que o ticket pedia, e mantido: corrigir também quando as fontes passaram a concordar e o gravado é outro; `idOsLis` como desempate do laudo anexado em duas requisições; listagem do Álvaro antes do passo do PDF.

### 25/11/2026 — regra confirmada

O responsável pelo produto confirmou "vence o PDF" como está. A conferência dos casos com a recepção (primeiro critério) não foi feita e fica dispensada por essa decisão; as duas O.S. em que a data favorece o `idOsLis` (390843266 e 394818261) continuam listadas acima, caso alguém queira olhar.
