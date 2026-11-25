# 05: Paciente baixa o laudo original

**What to build:** Na tela do `laudo`, o paciente aciona "baixar laudo original" e recebe o PDF emitido pelo laboratório de apoio, o mesmo anexado à requisição no apLIS. A API busca o arquivo ao vivo, confere que é do paciente e o entrega; nada fica guardado no LAB-HUB.

**Blocked by:** 01. Independente de 02, 03 e 04.

**Status:** done

- [x] A ação só aparece para `laudo` que tem requisição do apLIS e com a flag `LAUDOS_OS_VIA_PDF` ligada.
- [x] O paciente vem do token; `laudo` de outro paciente responde como inexistente.
- [x] Com mais de um PDF anexado, o paciente vê a lista e escolhe qual baixar.
- [x] Antes de entregar, o CPF extraído do PDF é conferido contra o do paciente; `diverge` ou `indisponivel` recusam a entrega e são logados como erro.
- [x] Cada download é registrado na trilha de auditoria de acesso.
- [x] Limite de requisições apertado, como o da atualização forçada da lista de laudos.
- [x] Site interno fora do ar: a tela mostra "indisponível no momento", sem erro técnico.
- [x] A resposta não é cacheável pelo navegador e o PDF não é gravado em disco nem no Storage.
- [x] Botão e estados (carregando, indisponível, escolha entre arquivos) seguem o LAB Design System do portal v2.
- [x] Testes no boundary HTTP (sem token, outro paciente, CPF divergente, sucesso com auditoria) e na tela do `laudo`.

## Comments

### 25/11/2026 — implementado

Rotas `GET /laudos/requisicoes/:codigoLis/original` (lista) e
`.../original/:idAnexo` (PDF); código em `apps/api/src/laudos/laudoOriginal.ts`
e botão "Baixar laudo original" na `LaudoPage`. Detalhes em
`docs/LAUDOS_LIS.md`, seção "Baixar o laudo original".

Decisões tomadas na implementação, para o responsável pelo produto confirmar:

- **Só o CPF libera a entrega.** A segunda prova (nome + nascimento), que vale
  para o vínculo desde 25/11, não vale aqui: o ticket pede que `diverge` e
  `indisponivel` recusem, e depois do download não há outra barreira. Pela
  medição de 25/11 (488 O.S.: 14 sem CPF, 3 com CPF diferente), cerca de 3% dos
  laudos ficam sem download.
- **O arquivo inteiro precisa ser do paciente.** Uma O.S. de outro CPF, ou uma
  página sem O.S. com CPF de outra pessoa, recusa o arquivo todo. Não é pega a
  página sem O.S. e sem CPF em texto (digitalização no meio do arquivo);
  recusar toda página sem cabeçalho fecharia isso, mas falta medir em laudos
  reais quantos legítimos têm página assim.
- **O nome do arquivo no apLIS não chega ao paciente** (pode trazer o nome de
  alguém); a escolha entre vários aparece como "Laudo 1", "Laudo 2
  (retificação)".
- **A trilha de auditoria guarda a linha do laudo**, como `laudos.ler`; qual
  dos anexos saiu fica no log `Laudo original entregue`.
- **O botão aparece em todo laudo com requisição**, sem consultar o site antes.
  Requisição sem anexo responde "Este laudo não tem o documento original do
  laboratório" ao clicar.

Não testado contra o apLIS real: os testes usam dublês do site e da API de
integração. Antes de ligar a flag em produção vale um download de ponta a
ponta, já com o usuário do ticket 06.

