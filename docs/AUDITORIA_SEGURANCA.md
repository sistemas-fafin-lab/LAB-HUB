# Auditoria de Segurança e Qualidade — LAB-HUB

**Data:** 30/07/2026
**Escopo:** projeto Supabase `labhub` (`rhiopafwojxujghscavi`, us-east-2, Postgres 17.6) + monorepo LAB-HUB (`apps/api`, `apps/web`, `apps/mobile`)
**Método:** inspeção do banco em produção via Management API (somente leitura), advisors nativos do Supabase, leitura das migrations e do código-fonte. **A auditoria em si não alterou nada**; as correções aplicadas depois estão registradas abaixo.
**Natureza do dado:** laudos clínicos, CPF, documentos de identidade — **dado pessoal sensível** pela LGPD (art. 5º, II). O padrão de cuidado aqui é mais alto que o de um app comum.

---

## Sumário executivo

O código da API é **acima da média em segurança**: o `pacienteId` sempre sai do JWT (nunca da URL), o CPF usado para buscar laudos nos LIS nunca vem do cliente, uploads são validados por magic bytes, webhooks têm HMAC com comparação em tempo constante, buckets são privados com signed URL de TTL curto, e o `ilike` da busca escapa curingas. Isso é raro e vale registrar.

O problema não está nesse caminho. Está **do lado de fora dele**: o banco expõe uma segunda porta (PostgREST + `anon key`) que ignora toda essa disciplina, e o modelo de identidade permite reivindicar a conta de outra pessoa sabendo só o CPF.

| # | Achado | Severidade |
|---|---|---|
| S-01 | `anon`/`authenticated` têm INSERT/UPDATE/DELETE/TRUNCATE em todas as tabelas; paciente pode reescrever o próprio CPF e puxar laudo alheio | ~~**CRÍTICO**~~ **CORRIGIDO 30/07/2026** |
| P-01 | Reivindicação de paciente-fantasma só por CPF, sem segundo fator de identidade | ~~**ALTO**~~ **CORRIGIDO 30/07/2026** |
| S-02 | Sem backup restaurável — perda de dado clínico é irreversível | **ALTO** |
| S-03 | Banco aberto a `0.0.0.0/0` e SSL não obrigatório na conexão Postgres | **ALTO** → **parcial 31/07** (SSL exigido; CIDR aberto por decisão) |
| S-04 | Política de senha fraca (mín. 6), troca de senha sem reautenticação, MFA não exigido | **ALTO** → **parcial 30/07** |
| S-05 | `site_url` = `localhost:3000`, sem SMTP próprio, confirmação de e-mail desligada | ~~**ALTO**~~ **CORRIGIDO 31/07/2026** |
| S-06 | Dados clínicos (`exam_results.result`, `resultados.paineis`) e identificadores em texto puro | **MÉDIO** → ver Parte 3 |
| P-02 | 4 vulnerabilidades `high` em dependências de produção; sem CI e sem gate de auditoria | ~~**MÉDIO**~~ **CORRIGIDO 30/07/2026** |
| S-07 | `rls_auto_enable()` é `SECURITY DEFINER` e executável por `anon` via RPC | **MÉDIO** |
| S-08 | Sem trilha de auditoria de acesso a dado de saúde (LGPD art. 37/38) | **MÉDIO** |
| S-09 | Sem política de retenção/expurgo; `on delete cascade` deixa arquivos órfãos no Storage | **MÉDIO** |
| P-03 | API sem cabeçalhos de segurança (helmet) e sem redação de PII nos logs | ~~**BAIXO**~~ **CORRIGIDO 30/07/2026** |
| S-10 | Funções sem `search_path` fixo; `anon key` no formato JWT legado (não revogável) | **BAIXO** |
| S-11 | RLS reavalia `auth.uid()` por linha; FKs sem índice de cobertura | **PERF** |
| P-06 | `FLOWLAB_API_KEY` de produção é `flowAPIKey1234567890`; sozinha, reescreve o CPF de qualquer paciente | **ALTO** (novo 31/07) |

**Ordem de ataque recomendada:** ~~S-01~~ (feito) → ~~P-01~~ (feito) → **S-02**/~~S-03~~ (parcial)/~~S-04~~/~~S-05~~ → criptografia (Parte 3) → o resto.

> Nota importante sobre a prioridade: **criptografar as colunas não resolve S-01 nem P-01.** Nos dois casos o atacante está autenticado e autorizado — a aplicação decifra o dado para ele de bom grado. Criptografia protege contra vazamento de *dump*, backup, réplica e acesso indevido ao painel. Controle de acesso protege contra o paciente do lado. São problemas diferentes e o segundo é o mais urgente.

---

## Registro de execução

O que já saiu do papel. Cada item tem a verificação completa na seção do achado.

### 30/07/2026 — S-01 fechado (e S-07 junto)

| | |
|---|---|
| **Migrations** | `20260730120000_s01_revoga_grants_e_trava_identidade.sql`<br>`20260730130000_correcao_identidade_paciente.sql` |
| **Código** | `apps/api/src/routes/integracao.ts` (nova rota), `apps/api/src/schemas/recepcao.ts`, `packages/shared/src/index.ts`, `apps/api/test/helpers.ts` (mock de `.rpc()`), `apps/api/test/integracao.test.ts` (+15 testes) |
| **Aplicação** | SQL executado em produção via Management API |
| **Verificação** | ataque reproduzido de fora pela PostgREST real (401 em GET/PATCH/DELETE); trigger e RPC testados em bloco `do $$` com `raise` final garantindo rollback; 195 testes na API e 52 no web passando; type-check limpo em `api`, `web` e `shared` |

O que mudou, em uma linha cada:

1. `anon` e `authenticated` perderam **todos** os privilégios em `public` — tabelas, sequences e funções — mais `alter default privileges` para que tabela nova não nasça aberta. O `service_role` (a API) ficou intacto.
2. `rls_auto_enable()` perdeu o EXECUTE do pseudo-role `PUBLIC`, o que fecha o S-07.
3. `cpf`, `data_nascimento` e `auth_user_id` viraram imutáveis depois que a conta é vinculada (trigger `trg_pacientes_identidade`).
4. Correção de CPF/nascimento passou a existir como operação explícita, autorizada pela recepção e registrada em `correcoes_identidade` — trilha append-only que nem a API reescreve.

**Duas descobertas na aplicação que o relatório original não previa:**

- `revoke ... from anon, authenticated` **não** remove o grant ao pseudo-role `PUBLIC`, que os dois herdam. Sem um `revoke ... from public` à parte, as funções continuariam executáveis. Detalhado em S-01.
- Existem **duas** entradas em `pg_default_acl` para o schema `public` (grantors `postgres` e `supabase_admin`); só a primeira é alterável por nós.

**O que isso NÃO resolveu na hora:** P-01 — quem soubesse o CPF de um paciente-fantasma ainda assumia a linha dele no cadastro. O trigger tornou `data_nascimento` confiável (imutável pós-claim), que era a peça que faltava para a correção do P-01 valer alguma coisa; ~~é o próximo da fila~~ **fechado no mesmo dia**, ver abaixo.

**Pendência conhecida:** ~~falta a tela do lado do FlowLab que consome a rota~~ — **escrita em 30/07/2026**, ver abaixo. O contrato está em `packages/shared` (`CorrigirIdentidadePayload` / `CorrigirIdentidadeResposta`).

### 30/07/2026 — tela de correção no FlowLab

| | |
|---|---|
| **Repo** | `flowlab` (outro repositório; nada mudou no LAB-HUB) |
| **Tela** | `/analises-clinicas/correcao-identidade` — `src/modules/analises-clinicas/components/CorrecaoIdentidadePage.tsx` + `hooks/useCorrecaoIdentidade.ts` |
| **Proxy** | `POST /api/analises-clinicas/corrigir-identidade` → `api/_lib/recepcaoAgendamento.ts` (`corrigirIdentidadePaciente`) e `api/_lib/handlers/corrigir-identidade.ts` |
| **Permissão** | key própria `canCorrigirIdentidade`, migration `20260730120000_perm_corrigir_identidade.sql` (backfill só do cargo "Administrador") |
| **Verificação** | `tsc` e `eslint` limpos nos arquivos novos; `vite build` passa. **Não exercitada em navegador contra o LAB-HUB.** |

Três decisões que valem registro:

1. **`autorizadoPor` sai da sessão, nunca do corpo da requisição.** É trilha de auditoria append-only deste lado; um campo de trilha que o chamador escolhe não vale como trilha. O proxy do FlowLab monta `nome <email>` a partir de `user_profiles` e trunca em 120 chars.
2. **Key de permissão própria, não `canManageColetas`.** Quem faz check-in não precisa poder destravar a identidade que o S-01 acabou de trancar. Como a tela precisa do typeahead, `GET /integracao/pacientes/buscar` passou a aceitar `canManageColetas` **ou** `canCorrigirIdentidade` no FlowLab.
3. **A tela não tenta adivinhar "nada a corrigir".** O CPF atual chega mascarado (2 dígitos), então comparar daqui daria falso positivo; quem decide é o `22023` da RPC. O nascimento, esse sim, é pré-preenchido com o atual — o caso comum é corrigir só o CPF, e a rota exige os dois campos.

~~Falta para valer em produção: aplicar a migration de permissão no FlowLab e testar a ponta a ponta contra esta API.~~

> **Fechado em 30/07/2026.** A migration de permissão foi aplicada no Supabase de
> teste do FlowLab (`Administrador` foi de 36 para 37 permissões) e o fluxo rodou
> ponta a ponta: a trilha `correcoes_identidade` tem a primeira linha real, com
> `autorizado_por` vindo da **sessão** do FlowLab (`nome <email>`) e não do corpo
> da requisição, como projetado.
>
> Duas ressalvas que continuam de pé:
> - O Supabase de **produção** do FlowLab está em outra conta e não foi
>   verificado daqui. A migration precisa ser aplicada lá também.
> - A migration anterior, `20260729120000_perm_add_stock_depart.sql`, segue **não
>   aplicada** (`Administrador` sem `canAddStockDepart`). Não tem relação com este
>   trabalho, mas sugere que migrations de permissão do FlowLab não estão sendo
>   aplicadas por rotina — vale conferir se há outras atrás.

#### Deploy em produção (31/07/2026)

O código estava pronto desde 30/07, mas **nunca tinha saído da máquina**: os três
commits viviam na branch local `feature/ac-correcao-identidade`, sem merge no
`main` e sem existir no `origin`. Não era um problema de código — era o deploy que
nunca aconteceu. Daí o sintoma reportado pela recepção continuar de pé um dia
depois de o trabalho estar "pronto".

Merge feito em `main` (`79476c4`) e publicado. O `main` tinha andado 3 commits
desde a divergência, então valia conferir antes: o merge saiu **sem conflito**, e
o único arquivo disputado (`src/utils/permissions.ts`, que recebeu a permissão de
WhatsApp no meio-tempo) juntou sozinho.

**A revisão que importava antes de publicar** foi `api/_lib/recepcaoAgendamento.ts`:
a branch não só adicionou código, ela **refatorou `autorizarOperador()`**, que é
compartilhada com fluxos que já rodam em produção (busca de pacientes, criação de
agendamento e os handlers do Envio ao Apoio). Um erro ali quebraria o check-in,
não a tela nova. Conferido: a fachada mantém assinatura, semântica, o bypass de
`role === 'admin'`, os mesmos status e até a mesma mensagem de 403 — o que ela faz
agora é delegar para `identificarOperador(token, permissoes[], acao)`, que
generaliza a checagem para *anyOf* de permissões e devolve também a identidade do
operador (necessária para o `autorizadoPor`). A única mudança em consulta
existente foi acrescentar `name, email` ao `select` de `user_profiles` — colunas
`NOT NULL` desde a criação da tabela em 2025 (`20250616124235_rough_breeze.sql`),
então não há como o `select` falhar em produção.

| Verificação | Resultado |
|---|---|
| Merge `main` ← branch | sem conflito |
| `vite build` | passa; `correcao-identidade` e "Correção de Identidade" presentes no bundle |
| `tsc -p tsconfig.app.json` | 26 erros, **todos** em `IT/` e `quotations/` (pré-existentes); nenhum nos arquivos da tela |
| `eslint` nos arquivos novos | limpo (os erros de `App.tsx`/`Layout.tsx` são linhas pré-existentes) |
| Envs de produção na Vercel | `LABHUB_API_URL` e `FLOWLAB_API_KEY` já existiam (18 dias) |

> **Falta um passo, e ele não é meu:** a migration
> `20260730120000_perm_corrigir_identidade.sql` precisa rodar no Supabase de
> **produção** do FlowLab (`jqxeqmeikqclmmongclj`), que está em outra conta — o
> token daqui recebe **403** nele. Sem isso o deploy é inócuo por segurança, não
> por bug: ninguém tem `canCorrigirIdentidade`, então o item de menu não aparece
> e a rota devolve 403. É também o motivo de o deploy ter risco praticamente
> nulo para quem já usa o sistema: enquanto a permissão não existir, nada muda
> para usuário nenhum.
>
> O `tsconfig.json` da raiz do FlowLab está com `"ignoreDeprecations": "6.0"`,
> valor inválido para o TypeScript instalado — `tsc -b` morre em TS5103 antes de
> checar qualquer arquivo. Descoberto aqui de passagem; é problema do FlowLab,
> não deste trabalho, mas significa que **o type-check daquele repositório não
> está rodando**.

### 30/07/2026 — P-02 e S-04 (parcial)

| | |
|---|---|
| **P-02** | `npm audit fix` em `apps/api` e `apps/web` → **0 vulnerabilidades** nos dois. `fast-uri` 3.1.2→3.1.4, `find-my-way` 9.6.0→9.7.0, `postcss` 8.5.15→8.5.25, `nanoid` 3.3.15→3.3.16 |
| **S-04** | senha mín. 12 + classes de caracteres + reautenticação na troca de senha, aplicados pela Management API; zod, UI e testes alinhados |
| **Verificação** | 209 testes na API, 52 no web, type-check limpo em `api` e `web`, `vite build` passando |

Na **raiz** o `npm audit fix` foi tentado e **desfeito**: ele subiu o toolchain do Expo e o total foi de 13 para 27 vulnerabilidades (mais cópias aninhadas de `brace-expansion`). O lockfile foi restaurado preservando os fixes de `api`/`web`. As 13 restantes são toolchain de build do protótipo mobile e do istanbul — nenhuma roda em produção, e o único caminho restante é `--force`, que rebaixa para `expo@46`.

**S-02 adiado por decisão do usuário.** Continua sendo o item mais grave em aberto. O caminho é `pg_dump` cifrado agendado no VPS, com destino fora do Supabase e teste de restauração.

**S-03 pulado por decisão do usuário.** Vale registrar que ele **está disponível** neste plano (`network-restrictions` responde `entitlement: allowed`) e que seria barato: a API fala com o Supabase só por HTTPS/PostgREST — não há `pg` nas dependências nem `DATABASE_URL` —, então restringir `dbAllowedCidrs` não afeta a aplicação, só conexão Postgres direta. *(Retomado em 31/07: metade do achado foi corrigida — ver o registro daquele dia.)*

### 30/07/2026 — P-01 fechado

| | |
|---|---|
| **Código** | `apps/api/src/routes/cadastro.ts`, `apps/api/test/cadastro.test.ts` (novo, 14 testes) |
| **Banco** | nenhuma mudança — a peça de banco necessária (trigger `trg_pacientes_identidade`) já tinha vindo com o S-01 |
| **Verificação** | 209 testes na API passando; type-check limpo |

O claim do paciente-fantasma passou a exigir **CPF e data de nascimento**, conferidos contra o que a recepção registrou, e parou de sobrescrever a data no UPDATE. As quatro recusas do cadastro foram unificadas numa resposta só, para que errar o palpite não revele que aquele CPF está na base e é reivindicável. Detalhe e tabela de desfechos em P-01.

Com isso fecham os dois achados que estavam acima de tudo na ordem de ataque. O topo da fila agora é infraestrutura: S-02 (backup), S-03 (banco aberto), S-04 (autenticação) e S-05 (e-mail).

### 30/07/2026 — CI (fecha o P-02)

| | |
|---|---|
| **Arquivo** | `.github/workflows/ci.yml` (o repositório não tinha nenhum workflow) |
| **Cobre** | `type-check` em `shared`/`api`/`web`, testes de `api` e `web`, build do web, `npm audit --omit=dev --audit-level=high` em `api` e `web` |
| **Verificação** | sequência inteira executada localmente na ordem do workflow, com `set -e`: passa. 209 testes na API, 52 no web |

Isto é o que impede a regressão silenciosa de tudo que foi corrigido hoje: a suíte da API cobre o claim do P-01, a trilha do S-01 e a política de senha do S-04, e até agora só rodava se alguém lembrasse.

**O YAML proposto na seção P-02 não funcionava como escrito.** Dois passos falhavam:

1. `npm audit --omit=dev --audit-level=high` na **raiz** sai com código 1 (`brace-expansion`, `js-yaml`). O `apps/mobile` declara o Expo como dependência de **produção**, então o toolchain do protótipo atravessa o `--omit=dev`. Rodando por workspace, `api` e `web` dão zero. Um gate que nasce vermelho é um gate que a equipe aprende a ignorar.
2. `npm run lint` saía com **127 — `eslint: command not found`**. O script `lint` de `apps/web` era resquício do template do Vite: não havia `eslint` em nenhum workspace nem arquivo de config — "temos lint" era falso desde o commit inicial. **ESLint foi instalado e configurado no mesmo dia** e o passo entrou no workflow; a primeira execução acusou 17 erros, três deles defeito de verdade. Ver P-02.

**`apps/mobile` está fora do CI**, por decisão do usuário (o app está parado). Não é só escolha de escopo: `npx tsc --noEmit` no mobile **falha hoje** (tipagem do `LinearGradient`), então `--workspaces` derrubaria o CI por algo que ninguém está tocando. Quando o app voltar, entram os três passos dele.

### 30/07/2026 — P-03 fechado

| | |
|---|---|
| **Código** | `apps/api/src/lib/http.ts` (novo), `apps/api/src/server.ts`, `apps/api/test/http.test.ts` (novo, 13 testes) |
| **Dependência** | `@fastify/helmet` 13.1.0 |
| **Verificação** | 222 testes na API; cabeçalhos conferidos com a API no ar; boot em produção sem `CORS_ORIGIN` derrubado |

Helmet, redação de log e CORS que falha no boot em produção em vez de liberar localhost. O que não estava no relatório: `GET /integracao/pacientes/buscar?q=…` é o typeahead da recepção, e **cada busca gravava nome ou CPF em claro no log da API** — mesmo dado que a Parte 3 quer criptografar no banco. Detalhe em P-03.

> **Nota de processo.** Não existe `supabase_migrations.schema_migrations` neste projeto — o schema nunca passou pelo CLI, foi tudo aplicado à mão. Os arquivos em `supabase/migrations/` são o registro versionado do que foi aplicado, não algo que uma ferramenta rastreia. Criar essa tabela agora faria um `db push` futuro achar que só as migrations novas estão aplicadas e tentar rodar as 8 antigas do zero. Ver P-04.

### 31/07/2026 — P-05 fechado

| | |
|---|---|
| **Código** | `apps/api/src/routes/resultados.ts`, `apps/api/src/lib/nomeArquivo.ts` (novo), `apps/api/src/routes/documentos.ts`, `apps/api/src/routes/integracao.ts`, `apps/api/test/helpers.ts` |
| **Testes** | `apps/api/test/resultados.test.ts` (novo, 9 — a rota **não tinha nenhum**), `apps/api/test/nomeArquivo.test.ts` (novo, 4) |
| **Banco** | `20260731120000_p05_unifica_trigger_atualizado_em.sql`, `20260731130000_p05_limites_bucket_laudos.sql` — **aplicadas em produção** |
| **Verificação** | 245 testes na API (era 232), type-check e lint limpos; trigger repontado testado em produção com rollback garantido |

Três coisas mudaram de fato:

1. **`resultados.ts` parou de fundir erro de banco com "não encontrado".** Era o item mais concreto da seção: `if (error || !resultado?.declaracao_url)` transformava uma falha transitória do banco em **404 mentiroso**. O paciente lia "declaração não encontrada" para um laudo que existe — e a leitura natural disso é desistir, não tentar de novo. Quem investiga também não via nada: 404 não é anomalia, então não havia sinal no log. Agora erro é 500 (com log) e ausência é 404.
2. **TTL de 3600 s → 300 s**, alinhado a `documentos.ts`. Conferido antes que o web não guarda a URL: `api.declaracao()` é chamada dentro do `onClick` e o `window.open` acontece na sequência (`LaudoPage.tsx:40`, `ExamDetailPage.tsx:98`, `WebHero.tsx:76`) — nada cacheia, então encurtar não quebra fluxo nenhum. O comentário de `documentos.ts` que citava "os 3600s de resultados.ts" como contraste foi corrigido junto; ele teria virado documentação falsa.
3. **`sanitizarNome()` deixou de ser duplicado** — virou `lib/nomeArquivo.ts`. O relatório sugeria "ao menos um teste que garanta que continuam equivalentes"; extrair custa o mesmo e torna a divergência impossível em vez de detectável depois. O argumento original ("não acoplar os dois arquivos de rota") não se aplica a um módulo de lib: nenhuma rota passa a depender da outra. O que estava em jogo não é cosmético — a remoção de `\r\n` existe para impedir injeção de header no `Content-Disposition`, e essa é a linha que não pode enfraquecer numa cópia e continuar forte na outra.

**Descoberta no meio do caminho:** o mock de Storage em `test/helpers.ts` **descartava o TTL** (`_ttl`), então nenhum teste jamais conferiu esse número. Era possível trocar 300 por 3600 em qualquer rota e a suíte inteira continuar verde. O `ttl` agora é registrado na `StorageCall`.

**As duas migrations de banco foram aplicadas em produção** no mesmo dia, autorizadas pelo usuário. Levantamento feito antes de escrevê-las, por consulta somente leitura:

- `set_updated_at()` e `set_atualizado_em()` serviam **um trigger cada** (`agendamentos` e `exam_results`), sem uso fora disso. A justificativa escrita na migration de 21/07 (*"aqui a coluna se chama atualizado_em, então o trigger precisa da sua própria função"*) é **falsa**: `set_updated_at()` também atribui `new.atualizado_em`, e nunca houve coluna `updated_at` neste schema. Ficou a de nome correto, com `search_path = ''`, o que fecha parte do S-10 para ela.
- O bucket `laudos` estava com `file_size_limit` e `allowed_mime_types` nulos e **0 objetos** — restringir não podia invalidar nada existente.

Estado depois de aplicar (lido de produção):

```
set_atualizado_em | proconfig={search_path=""} | trg_exam_results_atualizado_em -> exam_results,
                                                 trg_agendamentos_updated -> agendamentos
laudos | private | 10485760 | {application/pdf} | 0 objetos
```

**Repontar um trigger em produção pede teste de comportamento, não só de catálogo** — `pg_trigger` mostrar o vínculo não prova que a função carimba. O teste rodou dentro de `do $$ … raise exception`, que aborta a transação inteira e garante que nenhum UPDATE persiste (a Management API não tem dry-run e pode dar autocommit por statement, então `begin … rollback` solto não serviria):

```
RESULTADO || agendamentos: linha=0213ca22-… carimbou=true || exam_results: linha=nenhuma carimbou=n/a
```

Rollback conferido depois: a linha usada continua com `atualizado_em` de 27/07, 3 dias antes do teste.

**O que esse teste não cobriu:** `exam_results` está vazia, então o trigger dela não foi exercitado. O risco é baixo e vale registrar por quê — o trigger de `exam_results` **não foi repontado** (já apontava para `set_atualizado_em`); o que mudou para ele foi só o corpo da função, que é o mesmo que acabou de carimbar `agendamentos`.

**Fora de escopo por decisão anterior:** tirar `apps/mobile` do workspace (o app está parado, mesmo motivo pelo qual ficou fora do CI).

### 31/07/2026 — S-03 pela metade (SSL exigido)

| | |
|---|---|
| **Infra** | `PUT /v1/projects/{ref}/ssl-enforcement` → `{"database": true}` |
| **Código** | nenhuma mudança — não há consumidor de Postgres direto no repositório |
| **Verificação** | sondagem do protocolo Postgres antes/depois (sem enviar senha); PostgREST `206` e `/ping` de produção `200` depois de aplicar |

O servidor **passou a recusar sessão em texto puro**: o mesmo `StartupMessage` que antes recebia um desafio SASL agora recebe `ESSLREQUIRED`. `SSLRequest` segue respondendo `S`, então nenhum cliente correto notou diferença.

Duas coisas que ficaram claras no caminho e mudam a leitura do achado: sem TLS **a senha nunca esteve exposta** (SCRAM é desafio-resposta) — o que vazava era o conteúdo da sessão, CPF e laudo; e a porta que realmente importa é o **pooler IPv4** (`aws-1-us-east-2.pooler.supabase.com`), porque o host direto é só IPv6 e parece fechado de qualquer rede sem IPv6.

**`dbAllowedCidrs` continua `0.0.0.0/0` por decisão do usuário** (IP dinâmico na máquina de trabalho). Motivo e caminho de retomada registrados na seção S-03.

### 31/07/2026 — a correção de identidade passa a valer para o paciente sem conta

| | |
|---|---|
| **Banco** | `20260731140000_correcao_identidade_sem_conta.sql` — **aplicada em produção** |
| **Código** | comentários de `apps/api/src/routes/integracao.ts` e do proxy do FlowLab (`api/_lib/recepcaoAgendamento.ts`); nenhuma mudança de comportamento fora da RPC |
| **Verificação** | 245 testes na API; teste de comportamento em produção com rollback garantido |

Descoberto ao testar a tela recém-publicada: corrigir a data de nascimento de um paciente devolvia

```
400 — Paciente ainda não vinculado a uma conta: corrija direto no cadastro
```

**Não era bug, era o desenho recusando o caso** — para o fantasma o trigger de identidade não trava nada, então a correção "não precisaria" da saída de emergência. O que ninguém tinha verificado é se o destino da mensagem existia. **Não existe:** o FlowLab não tem nenhuma tela que edite paciente (zero referências), e o canal de integração do LAB-HUB não tem rota de UPDATE de paciente. A mensagem mandava o operador para lugar nenhum.

E o caso recusado era a maioria: **6 dos 8 pacientes da base não têm conta**. São os cadastros de balcão — exatamente os mais sujeitos a CPF digitado errado. A tela cobria 2 de 8, e não os que doem. O problema operacional que motivou o trabalho continuava de pé.

**Decisão (do usuário): mesma cerimônia para os dois casos.** Trocar o CPF de um fantasma não é operação menor que trocar o de quem já tem conta — é a mesma decisão um passo antes. O CPF do fantasma é o que define **quem poderá reivindicar aquele registro** no cadastro (P-01); mudá-lo entrega o histórico de uma pessoa a outra. A alternativa (edição leve, sem motivo nem documento) deixaria justamente essa troca sem registro de quem autorizou. Então a RPC perdeu só a recusa: validação, trava de concorrência, "nada a corrigir", conflito de CPF (fusão), trilha append-only e expurgo do cache de laudos seguem idênticos.

Teste de comportamento em produção, no cenário exato que falhou (mesmo CPF, nascimento diferente), dentro de `do $$ … raise exception`:

```
paciente sem conta: 81a0843e-…
cpf mudou: f  (esperado false)
nascimento: 2005-01-01 -> 2005-01-02
laudosInvalidados: 0
trilha gravada: autorizado_por=Sonda <auditoria> documento=RG nasc 2005-01-01->2005-01-02
```

Rollback conferido depois: nascimento de volta em 2005-01-01, 8 pacientes, e nenhuma linha `Sonda` na trilha.

**A ponta a ponta ficou provada de graça, e não por mim:** a trilha já tinha uma linha de 31/07 com `autorizado_por = Gabriel Silva Carneiro <tech2.laboratorio.lab@gmail.com>` e `documento_conferido = CNH`. É uma correção real, feita pela tela, com a identidade do operador vinda da **sessão** do FlowLab — que era exatamente o que faltava verificar do lado que eu não conseguia alcançar sem um login.

Confirmado depois, lendo a trilha: às 17:47 saiu a primeira correção de **paciente sem conta** (`sem_conta = true`), com CPF e nascimento alterados e a mesma autoria de sessão. As três linhas juntas cobrem o recurso inteiro — com conta e sem conta, só nascimento e CPF+nascimento.

### 31/07/2026 — P-04 fechado (ledger de migrations)

| | |
|---|---|
| **Banco** | `supabase_migrations.schema_migrations` criada e preenchida com as 14 versões (equivale a `migration repair --status applied`) |
| **Repo** | `20260731150000_p04_captura_rls_auto_enable.sql` — DDL extraído do catálogo de produção |
| **Verificação** | 14 no banco × 14 no repositório, zero divergência dos dois lados; varredura de tabelas, triggers, policies e views sem órfão |

O diagnóstico de julho estava incompleto: o ledger não estava desatualizado, **não existia**. Detalhe, incluindo por que um `db push` às cegas falharia alto em vez de destruir dado, na seção P-04.

---

# PARTE 1 — SUPABASE

## 1.1 Inventário

**Tabelas (schema `public`), todas com RLS habilitado:**

| Tabela | Linhas | Policies | Conteúdo sensível |
|---|---|---|---|
| `pacientes` | 8 | 1 (`FOR ALL`) | nome, CPF, e-mail, telefone, nascimento, sexo, convênio |
| `agendamentos` | 7 | 1 (`FOR ALL`) | posto, data/hora, exames (jsonb) |
| `resultados` | 2 | 1 (`FOR ALL`) | `paineis` (valores medidos), `resumo` clínico |
| `exam_results` | 11 | 1 (`FOR ALL`) | `result` — **laudo completo**: analitos, valores, método, CRM do médico, laboratório |
| `documentos` | 9 | 1 (`FOR ALL`) | metadados de RG/CNH/carteirinha/pedido médico |

> Estado na data da auditoria. Desde 30/07/2026 nenhuma dessas tabelas tem grant
> para `anon`/`authenticated` (as policies seguem no lugar, como segunda barreira),
> e existe uma sexta tabela: `correcoes_identidade` — trilha append-only das
> correções de CPF/nascimento, sem policy e sem grant de cliente. Ver o Registro
> de execução.

**Storage:** buckets `laudos` e `documentos`, ambos **privados** e sem policies em `storage.objects` — só o `service_role` acessa. Correto. 27 objetos. `documentos` tem limite de 10 MB e MIME allowlist; `laudos` não tem nenhum dos dois.

**Auth:** 2 usuários. Provider apenas e-mail/senha.

**Extensões:** `pgcrypto` 1.3, `supabase_vault` 0.3.1, `uuid-ossp`, `pg_stat_statements`. As duas primeiras são as que importam para a Parte 3 — **já estão instaladas**.

**PostgREST:** `db_schema = public,graphql_public`, `max_rows = 1000`.

---

## 1.2 Achados

### S-01 — `anon` e `authenticated` têm escrita total nas tabelas de paciente — ~~**CRÍTICO**~~

> **STATUS: CORRIGIDO em 30/07/2026.** Migration `20260730120000_s01_revoga_grants_e_trava_identidade.sql`,
> aplicada em produção via Management API. O texto abaixo fica como registro do
> que existia; a verificação pós-correção está no fim da seção.

**Evidência (estado anterior à correção).** Privilégios efetivos conferidos com `has_table_privilege`:

```
role            tabela         INSERT  UPDATE  DELETE  TRUNCATE
anon            pacientes        ✓       ✓       ✓        ✓
anon            resultados       ✓       ✓       ✓        ✓
anon            exam_results     ✓       ✓       ✓        ✓
anon            documentos       ✓       ✓       ✓        ✓
anon            agendamentos     ✓       ✓       ✓        ✓
authenticated   (idem em todas)  ✓       ✓       ✓        ✓
```

E as 5 policies são `FOR ALL` com `roles = {public}` — ou seja, valem para `anon` e `authenticated` igualmente, e cobrem SELECT, INSERT, UPDATE e DELETE de uma vez:

```sql
-- pacientes
using       (auth.uid() = auth_user_id)
with check  (auth.uid() = auth_user_id)
```

A `anon key` está no bundle do browser (`apps/web/src/lib/supabase.ts`), como deve ser. O que não deve é a porta que ela abre.

**Por que a RLS não segura.** A RLS restringe *quais linhas*, nunca *quais colunas*. Um paciente logado satisfaz o `with check` ao editar a própria linha — inclusive editando o `cpf`. E a leitura está de fato bloqueada (confirmei: consulta como `authenticated` sem claim retorna 0 linhas). O buraco é a **escrita**.

**Cadeia de exploração — laudo de terceiro:**

1. Paciente legítimo se cadastra e faz login no portal.
2. Do console do browser, com o cliente Supabase que a própria página já expõe:
   ```js
   await supabase.from('pacientes').update({ cpf: '<CPF da vítima>' }).eq('auth_user_id', user.id)
   ```
   O `with check` passa: a linha continua sendo dele.
3. Chama `GET /api/v1/laudos?refresh=true` na API.
4. `routes/laudos.ts:38` lê o CPF **do banco** (`select('cpf, data_nascimento, sexo')`) — o desenho está certo, o CPF nunca vem do cliente. Só que o cliente acabou de escrever esse CPF no banco.
5. `laudos/service.ts` consulta ApLIS e AOL com o CPF da vítima e devolve os laudos.
6. A guarda `conferirCpf()` (`service.ts:364`) compara o CPF do token com o CPF do laudo — e eles **batem**, porque o atacante já trocou o seu. A defesa passa por cima do ataque.

O resultado é o histórico clínico completo de qualquer pessoa que tenha exame no laboratório, a partir de um CPF — dado que no Brasil não é secreto.

**Cadeia secundária — adulteração e destruição do próprio histórico:**

```js
await supabase.from('resultados').update({ paineis: [/* valores forjados */], status: 'ready' })
await supabase.from('exam_results').delete().neq('id', '00000000-0000-0000-0000-000000000000')
await supabase.from('documentos').delete().neq('id', '...')  // deixa os bytes órfãos no bucket
```

Um laudo forjado com aparência legítima no portal do laboratório tem uso óbvio (atestado, perícia, seguro). E o `delete` em `documentos` apaga a linha mas **não** o objeto no Storage — o próprio comentário da migration `20260715120000` avisa disso.

**Sobre o TRUNCATE:** o PostgREST não expõe TRUNCATE, então não é alcançável pela API REST hoje. Mas é um privilégio que **ignora RLS por definição no Postgres** e não tem motivo para existir. Qualquer caminho SQL futuro (uma função `SECURITY DEFINER`, uma conexão direta) o torna alcançável.

**Correção.** O front-end só usa `supabase.auth` — confirmei com grep: **não há um único `.from()`, `.rpc()` ou `.storage` em `apps/web/src`**. Toda leitura de dado passa pela API com service role. Logo, esses grants não servem para nada e podem ser revogados sem quebrar nada:

```sql
-- 1. Fecha a porta. O front só precisa de auth, nunca de tabela.
revoke all privileges on all tables    in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke all privileges on all functions in schema public from anon, authenticated;

-- 2. Impede que uma tabela futura nasça aberta.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
```

Mantenha as policies como estão — defesa em profundidade custa zero aqui. Se algum dia o front precisar ler direto, conceda **só** `select` em colunas específicas e troque as policies `for all` por `for select`.

**Trava adicional (recomendada mesmo depois do revoke).** A identidade do paciente não deve mudar nem por caminho de service role, porque é ela que amarra o registro clínico:

```sql
create or replace function pacientes_bloqueia_troca_identidade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Após o claim (auth_user_id preenchido), CPF e nascimento são imutáveis.
  if old.auth_user_id is not null then
    if new.cpf is distinct from old.cpf then
      raise exception 'CPF é imutável após a vinculação da conta';
    end if;
    if new.data_nascimento is distinct from old.data_nascimento then
      raise exception 'Data de nascimento é imutável após a vinculação da conta';
    end if;
    if new.auth_user_id is distinct from old.auth_user_id then
      raise exception 'Vínculo de conta é imutável';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_pacientes_identidade
  before update on public.pacientes
  for each row execute function pacientes_bloqueia_troca_identidade();
```

Isso não quebra o `/cadastro`: lá o `auth_user_id` do fantasma é `null` no momento do UPDATE, então o trigger deixa passar. Um erro futuro no `PUT /pacientes/me` também passa a falhar barulhento em vez de silencioso.

> O trigger acima é a **proposta**. O que foi implementado difere em dois pontos:
> saiu o `security definer` (a função só lê `OLD`/`NEW`, não toca em tabela
> nenhuma, então não precisa de privilégio elevado — e assim não vira mais uma
> função privilegiada para auditar, ver S-07), e entrou a saída autorizada de
> correção descrita mais abaixo. Versão final em
> `20260730130000_correcao_identidade_paciente.sql`.

**Verificação pós-correção (30/07/2026).**

Ajuste feito em relação ao SQL proposto acima, descoberto na aplicação: `revoke ...
from anon, authenticated` **não** remove o grant ao pseudo-role `PUBLIC`, que os
dois herdam. As funções do schema tinham `=X/postgres`, então foi preciso um
`revoke execute on function public.rls_auto_enable() from public` à parte — o que
fecha também o S-07. As funções de trigger (`set_updated_at`, `set_atualizado_em`)
mantiveram o EXECUTE de PUBLIC de propósito: retornam `trigger`, o PostgREST não
expõe função de trigger como RPC, e mexer no ACL delas seria risco à toa no
caminho de DML.

Segunda descoberta: existem **duas** entradas em `pg_default_acl` para o schema
public, com grantors `postgres` e `supabase_admin`. Só a primeira é alterável por
nós (não somos membros de `supabase_admin`). Como as migrations rodam como
`postgres`, é a que vale na prática — mas fica o registro.

Privilégios efetivos depois:

```
role            SELECT  INSERT  UPDATE  DELETE  TRUNCATE   (nas 5 tabelas)
anon              ✗       ✗       ✗       ✗        ✗
authenticated     ✗       ✗       ✗       ✗        ✗
service_role      ✓       ✓       ✓       ✓        ✓        ← a API, intacta
```

```
relacl = {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}   (nas 5 tabelas)
```

Teste de ponta a ponta contra a PostgREST real, com a anon key do bundle do browser:

```
GET    /rest/v1/pacientes?select=cpf,nome  →  401  permission denied for table pacientes
PATCH  /rest/v1/pacientes  {"cpf":...}     →  401  permission denied for table pacientes
DELETE /rest/v1/exam_results               →  401  permission denied for table pacientes
```

Trigger de identidade, testado em bloco `do $$` com `raise` final para garantir
rollback (nada foi commitado — conferido depois: 2 vinculados, 6 fantasmas, zero
linhas contaminadas):

| Cenário | Esperado | Resultado |
|---|---|---|
| Trocar `cpf` de conta vinculada | bloquear | ✓ bloqueou |
| Trocar `data_nascimento` de conta vinculada | bloquear | ✓ bloqueou |
| Trocar `auth_user_id` de conta vinculada | bloquear | ✓ bloqueou |
| Editar `nome` (`PUT /pacientes/me`) | permitir | ✓ permitiu |
| Claim do fantasma (`POST /cadastro`) | permitir | ✓ permitiu (6 linhas) |

Suítes de teste: 180 testes da API e 52 do web, todos passando.

**Como revalidar a qualquer momento:**
```sql
select has_table_privilege('authenticated','public.pacientes','UPDATE');  -- false
select has_table_privilege('service_role', 'public.pacientes','UPDATE');  -- true
```

#### Saída autorizada para corrigir CPF/nascimento (30/07/2026)

Migration `20260730130000_correcao_identidade_paciente.sql`. Congelar a identidade
deixava sem solução o erro de digitação percebido depois do claim — a recepção
digita o CPF errado no balcão, a pessoa se cadastra, e alguém nota meses depois.

**A premissa que decide o desenho:** nenhum dado que o sistema guarda autoriza
essa troca. CPF antigo, nascimento antigo, e-mail, telefone, código por SMS — o
atacante do S-01 tem tudo isso, porque a conta é dele. Código por SMS prova posse
do celular atual, não titularidade do CPF novo. O que precisa ser provado é que o
**CPF novo pertence a quem pede**, e disso o banco não sabe nada. Só duas coisas
provam: um humano conferindo o documento físico, ou uma base oficial
(Receita/gov.br). E a segunda sozinha não basta — ela confirma que o trio
CPF↔nome↔nascimento é consistente, não que você é a pessoa; quem souber os três
dados da vítima passa. Serve como trava contra digitação errada, nunca como
substituto da conferência humana.

Por isso a autorização é da **recepção**, pelo canal de API key (`POST
/integracao/pacientes/:pacienteId/correcao-identidade`), nunca pelo portal.

**A exceção não é um flag solto.** Um flag global seria derrubado por qualquer bug
em qualquer rota. Ela é amarrada a uma linha de `correcoes_identidade`: o trigger
só libera se existir, na mesma transação, um registro que confira exatamente com a
mudança (paciente, CPF anterior, CPF novo, nascimento anterior, nascimento novo).
Consequência: `PUT /pacientes/me` continua sem tocar no CPF nem por bug.

Três detalhes que a operação carrega junto:

- **O cache de laudos do paciente é apagado.** As linhas de `exam_results` foram
  buscadas nos LIS com o CPF antigo (`exam_results.cpf`); mantê-las depois da troca
  exibiria o histórico de outra pessoa — o estrago do S-01 por outra porta.
- **`auth_user_id` fica imutável sem exceção.** Não é campo digitado; não existe
  typo nele, só troca de dono.
- **A trilha é append-only de verdade:** `revoke update, delete, truncate ... from
  service_role`. Nem a API reescreve a história. Cobre parte do S-08.

CPF novo que já pertence a outro cadastro devolve `23505` — esse caso é **fusão de
cadastros**, não correção, e mexe em agendamentos e documentos; não acontece aqui.

Verificação em produção (bloco `do $$` com `raise` final; nada commitado —
conferido depois: trilha 0 linhas, cache de laudos de volta a 11, nenhum CPF de
teste na base):

| Cenário | Esperado | Resultado |
|---|---|---|
| `UPDATE` cru no CPF de conta vinculada | bloquear | ✓ |
| RPC com autorização completa | aplicar | ✓ (trilha +1, CPF trocado, 11 laudos invalidados) |
| `UPDATE` cru **depois** da RPC, mesma transação | bloquear | ✓ (a GUC é fechada pela própria RPC) |
| GUC forjada com uuid aleatório | bloquear | ✓ |
| GUC apontando para correção **real**, com update diferente | bloquear | ✓ |
| RPC em paciente-fantasma | recusar | ✓ `22023` |
| RPC com CPF de outro cadastro | recusar | ✓ `23505` |

Privilégios: `anon` não lê a trilha nem executa a RPC; `service_role` executa a RPC
e só faz `INSERT` na trilha (`UPDATE`/`DELETE` = false).

Testes: 195 na API (+15 na nova rota) e 52 no web, todos passando.

---

### S-02 — Sem backup restaurável — **ALTO**

```json
{"pitr_enabled": false, "walg_enabled": true, "backups": []}
```

`walg_enabled` significa que o Supabase faz o backup físico do plano, mas **a lista de backups restauráveis está vazia**. Traduzindo o risco concreto: o `delete` em massa descrito em S-01, um `on delete cascade` disparado sem querer, ou um bug numa migration **não têm caminho de volta**.

Para dado clínico isso é grave em duas frentes ao mesmo tempo: perda de registro de saúde do paciente, e descumprimento do princípio de disponibilidade/integridade da LGPD (art. 6º, VII).

**Correção:** `pg_dump` cifrado agendado para storage externo, com **teste de restauração documentado**. Backup que nunca foi restaurado não é backup, é esperança. Três pontos decidem se isso vale como backup: cifrar antes de sair da máquina (é CPF e laudo), guardar fora do Supabase (senão um incidente leva os dois) e restaurar de verdade pelo menos uma vez.

---

### S-03 — Banco exposto à internet inteira e sem SSL obrigatório — **ALTO** → **PARCIALMENTE CORRIGIDO**

> **STATUS 31/07/2026:** SSL enforcement **ligado** — o servidor recusa conexão em
> texto puro. A restrição de CIDR segue **aberta**, por decisão do usuário: a
> máquina de trabalho tem IP dinâmico. Ver "Verificação pós-correção" no fim da
> seção.

```json
network-restrictions: {"dbAllowedCidrs": ["0.0.0.0/0"], "dbAllowedCidrsV6": ["::/0"]}
ssl-enforcement:      {"database": false}
```

Duas coisas separadas:

- **`0.0.0.0/0`** — qualquer host do planeta pode abrir conexão TCP com o banco. A senha é a única barreira, e o alvo fica exposto a força bruta e a qualquer CVE futura do Postgres/pooler.
- **SSL não obrigatório** — o servidor **aceita** conexão em texto puro. Um cliente mal configurado (script, ferramenta de BI, migração) negocia sem TLS e trafega laudo e CPF em claro pela internet.

Duas precisões que mudam a leitura da gravidade, e que valem estar escritas:

**Sem TLS, a senha não vaza.** O SCRAM é desafio-resposta — a senha não trafega, com ou sem TLS. O que trafega em claro é **tudo depois do login**: as queries e os resultados, isto é, CPF, nome, data de nascimento e laudo legíveis em qualquer ponto do caminho. E, sem TLS, não há autenticação do servidor: um atacante em posição de rede pode se passar pelo banco.

**Onde a porta realmente está.** O host direto (`db.<ref>.supabase.co`) resolve **só em IPv6** — de uma rede sem IPv6 ele é inalcançável, o que dá uma falsa sensação de fechado. O caminho IPv4 é o pooler, `aws-1-us-east-2.pooler.supabase.com:5432`, e é por ele que a exposição existe de fato. Qualquer teste que só olhe o host direto conclui errado.

**Correção:**
1. Restringir `dbAllowedCidrs` aos IPs de saída da API e da sua máquina. Se a API roda em plataforma com IP dinâmico, use o Supavisor/pooler e restrinja o que der.
2. Ligar SSL enforcement — isso só rejeita conexões inseguras; a API (via `supabase-js`, que usa HTTPS/PostgREST) não é afetada.
3. Rotacionar a senha do banco depois, já que ela esteve exposta a força bruta aberta.

#### Verificação pós-correção (31/07/2026)

Aplicado por `PUT /v1/projects/{ref}/ssl-enforcement` com `{"requestedConfig":{"database":true}}` → `{"currentConfig":{"database":true},"appliedSuccessfully":true}`.

A verificação foi uma sondagem do protocolo Postgres contra o pooler, **enviando apenas o nome de usuário — nenhuma senha**, antes e depois:

| | Resposta do servidor a um `StartupMessage` sem TLS |
|---|---|
| Antes | `R` — pediu autenticação **SASL/SCRAM**, em texto puro |
| Depois | `E` — `CXX000 M(ESSLREQUIRED) SSL connection is required for user: postgres` |

`SSLRequest` continua respondendo `S`: TLS segue oferecido, então quem conecta corretamente não notou nada. O que mudou é que o caminho inseguro deixou de existir, em vez de depender de o cliente pedir TLS por conta própria.

**Nada quebrou, e não havia como quebrar:** não há `pg` nas dependências, não há `DATABASE_URL` em lugar nenhum e o `docker-compose.yml` do VPS não consome banco — a aplicação inteira fala HTTPS/PostgREST, que não passa por aqui. Conferido depois de aplicar: PostgREST respondeu `206` com `content-range: 0-0/8` e a API de produção respondeu `200` no `/ping`.

#### Atualização de 31/07/2026 — a senha do banco é fraca, e isso reordena o achado

Para o `supabase link`, o usuário definiu uma senha **temporária e fraca** (11 caracteres, minúsculas e dígitos, com o nome do projeto), com a intenção declarada de trocá-la por uma forte em seguida. O registro fica pelo que o episódio revelou, não como acusação: **a senha do banco é trocável a qualquer momento sem impacto nenhum**, e por isso não há motivo para uma fraca sobreviver a uma sessão.

Ainda assim, o episódio **corrige uma avaliação anterior desta auditoria**. Ao explicar por que a exposição a `0.0.0.0/0` era item de "reduzir superfície" e não emergência, o argumento usado foi que a senha era aleatória e o SCRAM impede adivinhação offline. A segunda metade continua verdadeira; **a primeira era suposição minha, e não se sustenta** — a força da senha do banco nunca foi verificada nesta auditoria, só presumida.

É a lição que sobrevive ao caso concreto: com o pooler alcançável do mundo inteiro, a senha é a única barreira, e uma barreira que ninguém mediu não deveria ter entrado como premissa de um cálculo de risco. Enquanto o CIDR estiver aberto, **a força dessa senha é um controle de segurança**, e vale tratá-la como tal — inclusive as temporárias, que têm o hábito de sobreviver mais do que o previsto.

**A ordem correta agora:** rotacionar a senha vem **antes** de restringir CIDR, não depois — o passo 3 da correção original virou o passo 1. E rotacionar é barato: **nada na aplicação usa essa senha.** Não há `pg` nas dependências, não há `DATABASE_URL`, o `docker-compose.yml` do VPS não consome banco, e a API fala HTTPS/PostgREST com a `service_role` key, que é outro segredo. O único efeito colateral é ter de refazer o `supabase link` na máquina de desenvolvimento.

A senha também trafegou por uma conversa de chat, o que é motivo suficiente para trocá-la mesmo que fosse forte. Depois da troca o `supabase link` desta máquina para de funcionar — é só rodar de novo com a senha nova, e nada além disso quebra.

**O que continua aberto, e por quê.** `dbAllowedCidrs` segue `0.0.0.0/0` **por decisão do usuário**: a máquina de trabalho tem IP dinâmico, e travar a allowlist no IP de hoje faria o `supabase db push` (P-04) falhar um dia com um timeout sem explicação — o tipo de defesa que se desliga sozinha na primeira vez que atrapalha. A escolha é consciente, não esquecimento.

Se um dia isso for retomado, dois fatos poupam a investigação: (a) o fluxo de trabalho atual **já não usa a porta 5432** — todas as migrations desta auditoria foram aplicadas pela Management API por HTTPS, então dá para fechar bem apertado sem perder capacidade; (b) **não há risco de se trancar para fora** — a Management API e o painel não passam pela restrição de rede, então a reabertura é sempre possível. Falta confirmar empiricamente se a restrição alcança o pooler além do host direto; a sondagem acima é o teste pronto para isso.

---

### S-04 — Autenticação frouxa para o tipo de dado — ~~**ALTO**~~ **PARCIALMENTE CORRIGIDO**

> **STATUS 30/07/2026:** senha mínima, classes de caracteres e reautenticação na
> troca de senha aplicadas, com o zod e a UI alinhados. Seguem abertos a
> notificação de troca de senha ao titular, a exigência de MFA em ações sensíveis
> e a expiração de sessão. Ver "Verificação pós-correção" no fim da seção.

| Configuração | Valor atual | Problema |
|---|---|---|
| `password_min_length` | **6** | 6 caracteres é quebrável por força bruta offline |
| `password_required_characters` | `null` | `123456` é uma senha válida hoje |
| `security_update_password_require_reauthentication` | **false** | **quem rouba a sessão troca a senha sem saber a antiga** |
| `mfa_totp_enroll_enabled` | true | disponível, mas **não exigido** |
| `mailer_notifications_password_changed_enabled` | false → **true 31/07** | troca de senha não notifica o titular (dependia de SMTP; ver S-05) |

O item mais sério é a **reautenticação desligada**: um token vazado (XSS, dispositivo compartilhado, backup de browser) vira posse da conta, porque o atacante troca a senha sem conhecer a atual e o dono nem é avisado.

Observe que o `apps/api/src/schemas/cadastro.ts` já exige `min(8)` — mas essa validação só cobre o `POST /cadastro`. Qualquer chamada direta ao `/auth/v1/signup` do Supabase, ou o fluxo de reset de senha, cai nos 6 do servidor.

**Correção (painel Auth → Policies / Sessions):**
```
password_min_length ............................ 12
password_required_characters ................... letras + dígitos (mín.)
security_update_password_require_reauthentication  true
mailer_notifications_password_changed_enabled .. true
```
E alinhar o `min(8)` do zod para `min(12)`.

MFA por TOTP: já está habilitado no projeto. Para dado de saúde, vale oferecer no perfil e — no mínimo — exigir AAL2 em ações sensíveis (baixar laudo, trocar e-mail).

#### Verificação pós-correção (30/07/2026)

Aplicado pela Management API (`PATCH /v1/projects/{ref}/config/auth`), com a config anterior salva antes.

| Configuração | Antes | Agora | |
|---|---|---|---|
| `password_min_length` | 6 | **12** | aplicado |
| `password_required_characters` | vazio | minúscula + maiúscula + dígito | aplicado |
| `security_update_password_require_reauthentication` | false | **true** | aplicado |

A reautenticação era o item mais grave da seção e é o que efetivamente mudou: quem pega uma sessão aberta não troca mais a senha sem saber a atual.

**O que continua aberto:** a sessão não expira sozinha. O paliativo é encurtar o `jwt_exp` (hoje 3600 s) — não expira a sessão, mas reduz a janela de um access token roubado.

**Alinhamento no código** (senão o zod aceita e o Auth recusa depois, com mensagem em inglês vinda da biblioteca):

- `apps/api/src/schemas/cadastro.ts` — `min(8)` → `min(12)` + três `regex` de classe, com mensagens em português.
- `apps/web/src/lib/validators.ts` — `validarSenha` espelhando a mesma regra.
- `apps/web/src/pages/CadastroPage.tsx` — placeholder do campo.
- `apps/api/test/cadastro.test.ts` — 4 casos parametrizados de senha fraca, conferindo que a recusa é 400 e que **nenhuma** chamada ao banco acontece. Suíte da API em 209 testes.

Note que a política do servidor vale para todos os caminhos — incluindo `/auth/v1/signup` direto e o reset de senha —, enquanto o zod cobre só o `POST /cadastro`. Os dois precisam concordar, mas quem manda é o servidor.

---

### S-05 — Configuração de e-mail incompatível com produção — **ALTO** → **PARCIALMENTE CORRIGIDO**

> **STATUS 31/07/2026:** SMTP próprio, `site_url`, `uri_allow_list` e
> `REQUIRE_EMAIL_CONFIRMATION=true` aplicados, reaproveitando a conta do
> FlowLab, com os templates traduzidos. Entrega comprovada ponta a ponta e
> cadastro real verificado em produção (criado e removido). Segue aberto o
> alias `no-reply@`, que o Gmail reescreve enquanto não for verificado.

```
site_url        = 'http://localhost:3000'
uri_allow_list  = ''
smtp_host       = None
mailer_autoconfirm = false
REQUIRE_EMAIL_CONFIRMATION = false   (apps/api/.env)
```

Três consequências:

1. **Link de recuperação de senha aponta para `localhost`.** Hoje, um paciente que pede "esqueci minha senha" recebe um e-mail que não funciona. Na prática, não há recuperação de conta.
2. **Sem SMTP próprio**, o projeto usa o serviço embutido do Supabase, limitado a poucos e-mails por hora e explicitamente não destinado a produção. Ligar `REQUIRE_EMAIL_CONFIRMATION=true` sem SMTP trava o cadastro.
3. **Confirmação de e-mail desligada** (`email_confirm: !REQUIRE_EMAIL_CONFIRMATION` em `routes/cadastro.ts:49`) significa que **qualquer pessoa cria uma conta com o e-mail de outra** e já entra logada. Combinado com P-01 abaixo, é o caminho mais curto para assumir o registro de um paciente real. O `.env.example` documenta isso como decisão consciente de fase de teste — o registro aqui é para não passar batido no dia do deploy.

**Correção:** configurar SMTP (Resend/SES/Postmark), `site_url` com o domínio real, `uri_allow_list` com os domínios de redirect legítimos (incluindo previews da Vercel, se usar), e `REQUIRE_EMAIL_CONFIRMATION=true` antes de qualquer paciente real entrar.

#### Verificação pós-correção (31/07/2026) — **SMTP ligado, falta o teste de ponta a ponta**

**Nada disso exigia plano pago.** Conferido na documentação e no projeto: SMTP próprio está disponível no plano free em todos os planos, e o único item de e-mail atrás do Pro é remover a marca "Supabase" do rodapé. O projeto está no **free** (`org: labhub@laboratoriolab.com.br's Org`). Quem é bloqueado por plano é o **S-02**: no free, backup automático e PITR aparecem como "não incluído" — o que a lista vazia de `backups` já mostrava.

Reaproveitada a conta SMTP que o FlowLab já usa em produção. Onde ela estava: o `supabase/config.toml` do FlowLab tem o bloco `[auth.email.smtp]` **comentado** (é o exemplo de sendgrid que vem do CLI, não configuração real) — o SMTP de verdade é da aplicação, via nodemailer em `api/_lib/email.ts`, com as credenciais no `.env`. Google Workspace no domínio próprio.

| Configuração | Antes | Agora |
|---|---|---|
| `site_url` | `http://localhost:3000` | `https://lab-hub-site.vercel.app` |
| `uri_allow_list` | vazio | produção + previews da Vercel + `localhost:5173` |
| `smtp_host` / `smtp_port` | nulos | `smtp.gmail.com` / **587** |
| `smtp_user` | nulo | `sistemas@laboratoriolab.com.br` |
| `smtp_sender_name` | nulo | `LAB-HUB` |
| `smtp_admin_email` | nulo | `no-reply@laboratoriolab.com.br` |
| `rate_limit_email_sent` | **2/hora** | **30/hora** |
| `mailer_notifications_password_changed_enabled` | false | **true** |

Quatro decisões que valem estar escritas:

1. **Porta 587, e não os 465 do FlowLab.** As duas funcionam no Gmail. 465 é TLS implícito, que o nodemailer trata bem mas é o caminho menos exercitado no GoTrue; 587/STARTTLS é o que a documentação do Supabase exemplifica. Como o consumidor aqui é o GoTrue e não o nodemailer, seguir o caminho documentado custa nada.
2. **`rate_limit_email_sent` de 2 para 30.** Os 2/hora são o teto do serviço embutido e são o motivo real de não dar para ligar a confirmação de e-mail: o terceiro paciente a se cadastrar na mesma hora ficaria sem receber e sem entrar. 30/hora é o valor que o próprio Supabase adota quando há SMTP próprio, e cabe folgado na cota do Workspace.
3. **Nome de exibição `LAB-HUB`, não "Sistema FlowLab".** Mesma caixa e mesma credencial, nome próprio: o paciente pediu senha no LAB-HUB e precisa reconhecer o remetente. E-mail de recuperação com nome de outro sistema tem cara de phishing.
4. **`mailer_notifications_password_changed_enabled` ligado junto.** É o item que o S-04 deixou explicitamente em aberto por depender de e-mail funcionando. Sem ele, quem troca a senha de uma sessão roubada faz isso em silêncio.

**Credencial verificada sem enviar mensagem nenhuma:** conexão SMTP direta ao `smtp.gmail.com`, `STARTTLS` + `AUTH`, e desconexão antes de qualquer `MAIL FROM`. Passou nas **duas** portas (587 e 465), o que confirma que a senha de aplicativo do Workspace vale para este caminho e não só para o do FlowLab.

O teste foi assim porque a base tem **2 usuários e nenhum interno** (`select count(*) … filter (where email like '%@laboratoriolab.com.br')` → 0): disparar recuperação de senha para descobrir se o SMTP funciona significaria mandar e-mail para conta de pessoa real.

#### Teste de entrega ponta a ponta (31/07/2026) — **passou**

O endereço de teste não era usuário, e `POST /auth/v1/recover` para conta inexistente responde 200 **sem enviar nada** (o GoTrue não revela se a conta existe). O teste ingênuo não provaria nada. Foi criado um usuário descartável, disparada a recuperação real e o usuário apagado em seguida — base conferida de volta em 2 usuários, sem resíduo.

```
12:59:42  user_signedup            POST /admin/users     200   195 ms
12:59:45  user_recovery_requested  POST /recover         200   1,83 s   ←
13:00:06  user_deleted             DELETE /admin/users   200   108 ms
```

**A duração é a evidência, não o código 200.** As chamadas administrativas levaram ~100–200 ms; o `/recover` levou dez vezes mais porque nele cabe o handshake TLS e a entrega ao `smtp.gmail.com`. Falha de SMTP faria o GoTrue devolver **500** ("Error sending recovery email") e uma entrega no-op levaria milissegundos. Zero entradas de nível `error` nos logs de auth.

E-mail confirmado na caixa pelo titular do endereço.

**Dois achados que só o e-mail real mostrou:**

1. **O Gmail reescreveu o remetente.** Chegou como `LAB-HUB <sistemas@laboratoriolab.com.br>` — o nome de exibição passou, o endereço não. O `no-reply@laboratoriolab.com.br` **não** está verificado como "enviar e-mail como" na conta do Workspace; o Gmail substitui pelo endereço autenticado. A suposição registrada acima (de que o FlowLab enviar com esse remetente implicava alias verificado) **estava errada** — o FlowLab usa nodemailer, que monta o `From` por conta própria, e isso não é a mesma coisa que ter o alias liberado. A configuração segue com `no-reply@` de propósito: no dia em que o alias for verificado no Google, passa a valer sem mexer aqui.
2. **O template chega em inglês.** *"Reset your password — We received a request to reset your password."* É o padrão do Supabase, e ninguém o traduziu. Paciente brasileiro recebendo recuperação de senha em inglês tende a tratar como golpe — o que é o efeito oposto do pretendido. Vale para **todos** os templates, inclusive o de confirmação de cadastro, que passa a ser disparado a cada novo paciente agora que a confirmação está ligada. Corrigível pela mesma Management API (`mailer_subjects_*` / `mailer_templates_*_content`).

#### `REQUIRE_EMAIL_CONFIRMATION` (31/07/2026)

Ligado depois da entrega comprovada, que era a ordem certa: com ele em `true` e o SMTP quebrado, o paciente cria a conta, não recebe o e-mail e não consegue entrar.

Isto fecha o pior dos três itens do S-05 — com `false`, **qualquer pessoa criava conta com o e-mail de outra e já entrava logada**, que somado ao P-01 era o caminho mais curto para assumir o registro de um paciente real.

A rota já estava pronta para os dois modos (`routes/cadastro.ts`): `email_confirm: !REQUIRE_EMAIL_CONFIRMATION` no `createUser`, `auth.resend({ type: 'signup' })` em seguida, e `requiresEmailConfirmation` na resposta para o front decidir o que mostrar.

> **Falta um passo fora deste repositório.** A API de produção **não** roda na Vercel: é o `docker-compose.yml` num VPS, com deploy manual (`git pull && docker compose up -d --build`) e um `.env` que vive na máquina. O que foi alterado aqui é o `.env` local (dev, não versionado) e o `.env.example`. **Em produção alguém precisa editar o `.env` do VPS e reiniciar o container** — até lá, o cadastro em produção continua criando conta pré-confirmada.

#### Templates traduzidos (31/07/2026)

Oito templates passaram para português pela Management API: `confirmation`, `recovery`, `password_changed_notification`, `reauthentication`, `email_change`, `email_changed_notification`, `magic_link` e `invite`. Nome do produto: **Lab Hub**, que é o `<title>` do app — não foi inventado nome de laboratório.

Ficaram em inglês, de propósito, os cinco que **não têm como disparar** hoje: `identity_linked` / `identity_unlinked` (não há provedor OAuth), `mfa_factor_enrolled` / `unenrolled` e `phone_changed` (sem SMS) — todos com a notificação correspondente em `false`.

Três decisões de conteúdo que não são tradução literal:

1. **O nome do produto aparece no assunto e no corpo.** O `From` que sai hoje é `sistemas@laboratoriolab.com.br` (o Gmail reescreve; ver acima), então o paciente não reconhece o remetente pelo endereço. O texto precisa dizer de onde vem.
2. **Link cru embaixo do botão** em todo template com `ConfirmationURL`. Cliente de e-mail que remove o `<a>` deixaria a mensagem inútil, e o endereço visível permite conferir para onde o link aponta antes de clicar — o oposto do padrão de phishing.
3. **O template de reautenticação avisa que o código nunca é pedido por telefone, WhatsApp ou e-mail.** O código de reautenticação é o que protege a troca de senha (S-04); quem consegue esse código por engenharia social contorna a proteção inteira.

#### Verificação em produção (31/07/2026) — cadastro real, criado e removido

A API de produção **não** é a Vercel: é o `docker-compose` no VPS. Confirmado que o deploy com a flag entrou — `GET /ping` respondeu e os cabeçalhos do P-03 (`nosniff`, HSTS, `X-Frame-Options`) estavam presentes, ou seja, é o build atual.

Cadastro real contra `https://labhub.ngrok.app`, com CPF de teste conferido antes como **ausente da base** (para não cair sem querer no fluxo de reivindicação de um paciente-fantasma real):

| Verificação | Resultado |
|---|---|
| `POST /api/v1/cadastro` | **201**, `requiresEmailConfirmation: true` |
| `auth.users.email_confirmed_at` | **null** — conta criada NÃO confirmada |
| `auth.users.confirmation_sent_at` | preenchido — o e-mail saiu |
| Login **com a senha correta** | **400 `email_not_confirmed`**, sem `access_token` |

A última linha é a que fecha o achado. Antes desta mudança, esse mesmo login devolveria um token: qualquer pessoa criava conta com o e-mail de outra e entrava. Agora a senha certa não basta — é preciso provar posse do endereço.

Limpeza conferida: paciente e usuário removidos, base de volta a **2 usuários / 8 pacientes / 6 fantasmas**, e nem o endereço nem o CPF de teste retornam nada.

**O que continua em aberto:**

- **Alias `no-reply@` não verificado** (achado 1) — as respostas de paciente vão para a caixa de sistemas.
- **A caixa é compartilhada com o FlowLab.** Cota do Workspace e reputação de envio passam a ser divididas entre os dois sistemas; um pico num afeta o outro.
- **Cinco templates seguem em inglês** — inertes hoje, mas viram e-mail em inglês no dia em que MFA, OAuth ou SMS entrarem.

---

### S-06 — Dado clínico e identificadores em texto puro

Estado atual do dado sensível no banco:

| Coluna | Conteúdo | Hoje |
|---|---|---|
| `exam_results.result` (jsonb) | laudo completo: analitos, valores, unidade, método, CRM do médico, laboratório, datas | texto puro |
| `resultados.paineis` (jsonb) | valores medidos por painel | texto puro |
| `resultados.resumo` | observação clínica | texto puro |
| `pacientes.cpf` | CPF (11 dígitos, UNIQUE) | texto puro |
| `pacientes.nome` / `email` / `telefone` / `data_nascimento` | identificadores diretos | texto puro |
| `documentos.nome_arquivo` | pode conter nome da pessoa | texto puro |

Confirmei a estrutura de `exam_results.result`: array de laudos com as chaves `groups, panels, results, analitos, crm, doctor, laboratorio, material, metodo, exam_type, data_coleta, codigo_os, codigo_lis, summary…`. É o prontuário do exame, inteiro, em claro.

O Supabase já cifra **disco** (at rest) e **trânsito** (TLS). O que falta é a camada que protege contra vazamento *lógico*: um `pg_dump`, um backup baixado, uma réplica, um acesso indevido ao Studio, ou um bug de RLS futuro. É esse o pedido do projeto e ele é legítimo — **ver Parte 3**, com plano completo.

---

### S-07 — `rls_auto_enable()` é `SECURITY DEFINER` e chamável por `anon`

O advisor aponta que `public.rls_auto_enable()` é executável via `/rest/v1/rpc/rls_auto_enable` pelos roles `anon` e `authenticated`, rodando com privilégios do dono.

A função é um handler de event trigger (usa `pg_event_trigger_ddl_commands()`), então chamada fora de um event trigger ela lança erro — **não é explorável hoje**. Mas é uma função privilegiada, não versionada em `supabase/migrations/` (foi criada fora do fluxo de migration), exposta na API pública. Não custa nada fechar:

```sql
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
```

O `revoke all on all functions` de S-01 já cobre isso, mas deixo explícito porque o `public` (pseudo-role) precisa ser revogado à parte.

> **STATUS: CORRIGIDO em 30/07/2026**, junto com S-01. `proacl` de `rls_auto_enable`
> agora é `{postgres=X/postgres,service_role=X/postgres}` — sem `=X` (PUBLIC), sem
> `anon`, sem `authenticated`. O ponto de processo (função existe no banco e não no
> repositório) continua aberto — ver P-04.

**Ponto de processo:** essa função existe no banco e não existe no repositório. Vale rodar `supabase db pull` para trazer o schema real para as migrations — ver P-04.

---

### S-08 — Sem trilha de auditoria de acesso a dado de saúde

Não há tabela de log, nem trigger de auditoria, nem registro de "quem viu o laudo de quem e quando". Os logs da API (`Fastify` com pino, nível `info`) registram requisições HTTP, mas ficam onde o processo roda, sem retenção definida.

A LGPD (arts. 37 e 38) espera registro das operações de tratamento, e para dado de saúde isso é o que permite responder à pergunta que aparece quando algo dá errado: *quais registros foram acessados no incidente?* Sem trilha, a resposta é "não sabemos", e a notificação à ANPD vira genérica.

> **Parcialmente endereçado em 30/07/2026:** `correcoes_identidade` (migration
> `20260730130000`) é a primeira trilha append-only do projeto e registra quem
> autorizou a troca de CPF/nascimento, qual documento foi conferido e o valor
> anterior. Serve de modelo para o resto — mas cobre só essa operação. A leitura
> de dado clínico continua sem registro.

**Correção mínima viável:** tabela `auditoria` append-only (sem UPDATE/DELETE para ninguém além do owner), alimentada pela API nos pontos de leitura de dado sensível — `GET /laudos`, `GET /laudos/:id`, `GET /documentos/:id/url`, `GET /integracao/agendamentos/:id/documentos` — registrando `ator` (paciente ou FlowLab), `ação`, `recurso_id`, `ip`, `timestamp`. Nunca o conteúdo.

---

### S-09 — Sem retenção/expurgo, e cascade deixa arquivo órfão

A migration `20260715120000_documentos_paciente.sql` já documenta o problema com todas as letras:

> `ATENÇÃO (LGPD): o on delete cascade apaga a LINHA, não o objeto no Storage.`

O diagnóstico está certo e a rotina que ele pede não existe. Somando:

- **Não há expurgo por prazo.** Documento de identidade fica no bucket indefinidamente; a LGPD (art. 15/16) pede eliminação ao fim da finalidade. O pedido médico deixa de ter finalidade depois da coleta.
- **Não há caminho de exclusão de conta** (direito do titular, art. 18, VI).
- **Deletar um paciente pelo banco** deixa os arquivos no bucket, invisíveis e sem dono.

**Correção:** um job (Edge Function agendada ou cron na API) que (1) apaga documentos perenes sem uso há N meses e pedidos médicos de coletas já realizadas há N dias, sempre `storage.remove` **antes** do `delete` da linha; e (2) uma rotina de exclusão de conta que faça a mesma ordem. O `DELETE /documentos/:id` já implementa essa ordem corretamente — serve de modelo.

---

### S-10 — Higiene de configuração

- **`set_updated_at()` e `set_atualizado_em()` sem `search_path` fixo** (2 warnings do advisor). São triggers simples e não `SECURITY DEFINER`, então o risco real é baixo, mas o custo da correção é uma linha:
  ```sql
  alter function public.set_updated_at()     set search_path = '';
  alter function public.set_atualizado_em()  set search_path = '';
  ```
  (Aproveite para consolidar: as duas funções têm corpo **idêntico** — ambas escrevem `atualizado_em`. Uma só bastaria; ver S-11/qualidade.)

- **`anon key` no formato JWT legado** (`eyJhbGciOiJIUzI1NiIs…`). Chaves legadas não são revogáveis individualmente: vazou, só rotacionando o JWT secret do projeto inteiro, o que invalida todas as sessões. As novas chaves `publishable`/`secret` do Supabase são revogáveis e rotacionáveis isoladamente. Migrar é barato e vale — principalmente para a **service role**, que hoje é o segredo mais valioso do sistema.

- **`max_rows = 1000` no PostgREST.** Depois do revoke de S-01 isso deixa de importar para `anon`/`authenticated`, mas mantenha em mente que é o teto por request.

---

### S-11 — Performance (advisor)

| Achado | Impacto |
|---|---|
| `auth_rls_initplan` em **todas as 5 policies** | `auth.uid()` é reavaliado **por linha** em vez de uma vez por query |
| `resultados.paciente_id` sem índice | é justamente a coluna de filtro de toda consulta de resultado |
| `pacientes.auth_user_id` sem índice | é o lookup do `middlewares/auth.ts`, executado em **toda requisição autenticada** |

O segundo e o terceiro são os que doem: `agendamentos` e `documentos` ganharam índice, `resultados` e `pacientes` não. Com 8 linhas ninguém percebe; com 50 mil pacientes, todo request autenticado vira seq scan.

```sql
-- Índices faltantes
create index if not exists idx_resultados_paciente     on public.resultados (paciente_id);
create index if not exists idx_pacientes_auth_user_id  on public.pacientes  (auth_user_id);

-- auth.uid() avaliado uma vez por query, não por linha
alter policy "paciente vê só o próprio perfil" on public.pacientes
  using ((select auth.uid()) = auth_user_id)
  with check ((select auth.uid()) = auth_user_id);

alter policy "paciente vê só seus agendamentos" on public.agendamentos
  using      (paciente_id = (select id from public.pacientes where auth_user_id = (select auth.uid())))
  with check (paciente_id = (select id from public.pacientes where auth_user_id = (select auth.uid())));
-- idem para resultados, documentos e exam_results
```

---

# PARTE 2 — PROJETO

## 2.1 O que está bem feito

Vale começar por aqui porque é o que sustenta o resto e não deve ser perdido numa refatoração:

- **`pacienteId` sempre derivado do JWT**, nunca de `:id` na URL (`middlewares/auth.ts`, `pacientes.ts`, `documentos.ts`). IDOR fechado por construção — e o comentário em `routes/integracao.ts` explica por que o módulo de integração nem importa o `authenticate`, para não haver como esquecê-lo.
- **CPF nunca aceito do cliente** em `GET /laudos` (`routes/laudos.ts:31-48`), com o raciocínio documentado. O desenho está certo; o que o fura é S-01, no banco.
- **Upload validado por magic bytes** (`lib/fileType.ts`), nunca pelo `Content-Type` do cliente. Path do Storage é `{paciente_id}/{uuid}.{ext}` — sem traversal, sem colisão, sem unicode do usuário.
- **HMAC de webhook sobre o corpo cru**, com `timingSafeEqual` e guarda de comprimento (`lib/hmac.ts`). A `FLOWLAB_API_KEY` usa a mesma comparação constante.
- **Buckets privados, signed URLs com TTL curto e justificado** (300 s para o paciente, 900 s para a recepção) — com o raciocínio escrito no código.
- **`ilike` com escape de `%`, `_` e `\`** na busca da recepção, e CPF mascarado na resposta (só os 2 dígitos verificadores).
- **Rate limit por rota** (`/cadastro` 5/min, upload 10/min) além do global.
- **Compensação transacional** no upload: se o insert falha, o objeto é removido do bucket; se a remoção falha, loga com o path para reconciliar.
- **`createSignedUrls` casado por path, não por índice** — o comentário explica exatamente o bug que isso evita (documento de um paciente sob o rótulo de outro).
- **Nenhum segredo no histórico do Git.** Verifiquei: só `.env.example` está versionado, e os `.env` reais estão no `.gitignore`.
- **Nenhum acesso direto a tabela no front-end.** Zero `.from()`/`.rpc()` em `apps/web/src` — o que torna a correção de S-01 indolor.

Os comentários do código são uma forma de documentação de decisão que raramente se vê e que facilitou muito esta auditoria.

## 2.2 Achados

### P-01 — Conta de paciente é reivindicável só com o CPF — ~~**ALTO**~~

> **STATUS: CORRIGIDO em 30/07/2026.** O claim passou a exigir CPF **e** data de
> nascimento conferindo com o que a recepção registrou, com resposta única para
> as duas recusas. Ver "Verificação pós-correção" no fim desta seção.

**Onde:** `apps/api/src/routes/cadastro.ts:33-90`.

O fluxo do paciente-fantasma: a recepção do FlowLab cria uma linha em `pacientes` com nome, CPF e nascimento, sem `auth_user_id`. Depois, quem se cadastrar com aquele CPF **assume a linha** — e junto com ela os agendamentos, os documentos e (via CPF → LIS) todos os laudos daquela pessoa.

A única chave desse claim é o CPF:

```ts
const { data: existente } = await supabase
  .from('pacientes').select('id, auth_user_id').eq('cpf', cpf).maybeSingle()
if (existente?.auth_user_id) throw conflict('CPF já cadastrado')
// … existente sem auth_user_id → UPDATE reivindica a linha
```

Não há conferência de `nome` nem de `data_nascimento` — os dados enviados no cadastro **sobrescrevem** os que a recepção digitou (`nome, email, sexo, data_nascimento` no UPDATE), então nem restaria rastro da divergência.

CPF no Brasil não é segredo: aparece em nota fiscal, cadastro de loja, vazamento público. Combinado com S-05 (confirmação de e-mail desligada), o custo do ataque é: saber o CPF de alguém que fez exame ali, e clicar em "cadastrar".

Mitigante: só funciona em linha ainda não reivindicada. Mas essas são exatamente as pessoas atendidas no balcão — provavelmente a maioria da base real.

**Correção.** Exigir um segundo fator de identidade no claim, conferido contra o que a recepção registrou:

```ts
if (existente && !existente.auth_user_id) {
  // Confere contra o que a recepção digitou; não sobrescreve às cegas.
  if (existente.data_nascimento !== dataNascimento) {
    throw app.httpErrors.badRequest('Dados não conferem. Procure a recepção.')
  }
  // opcional, mais forte: comparar nome normalizado (sem acento/caixa)
}
```

Cuidado deliberado com a mensagem de erro: ela não deve distinguir "CPF não existe" de "nascimento não confere", senão vira oráculo de data de nascimento. Use a mesma resposta genérica nos dois casos.

Onde a garantia precisa ser forte (e é o caso, dado o volume de laudo exposto), o padrão é **claim assistido**: a recepção entrega um código de vinculação de uso único ao paciente presencialmente, e o cadastro exige esse código. Recomendo essa opção se o balcão puder acomodá-la; a conferência de nascimento é o piso, não o ideal.

#### Verificação pós-correção (30/07/2026)

Implementado em `apps/api/src/routes/cadastro.ts`. Três mudanças:

1. O `select` do CPF passou a trazer `data_nascimento`, e o claim só acontece se ela conferir com a enviada no cadastro.
2. `data_nascimento` **saiu** do payload do UPDATE que reivindica a linha. Já foi conferida; reenviá-la só reabriria o caminho de sobrescrever o que a recepção digitou.
3. As recusas foram unificadas em `recusarClaim()` — mesma mensagem e mesmo 409 para os quatro caminhos.

Sobre (3), o raciocínio do oráculo, porque a escolha tem custo de UX e vale estar escrita. Os desfechos possíveis são:

| CPF na base | Nascimento | Antes | Agora |
|---|---|---|---|
| não existe | — | 201, cria paciente novo | igual |
| fantasma | confere | 201, reivindica | igual |
| fantasma | não confere | 201, **reivindicava mesmo assim** | 409 genérico |
| já tem conta | — | 409 "CPF já cadastrado" | 409 genérico |

Sucesso continua distinguível de recusa — não tem como não ser, já que ele cria uma conta. O que a mensagem única compra é que **uma recusa não diz qual das duas causas ocorreu**: quem chuta um CPF não descobre se ele está na base do laboratório e ainda é reivindicável, que é exatamente a lista de alvos. Contra a força bruta na data restou o rate-limit de 5/min já existente na rota.

O custo é real: o paciente que já tem conta e tenta se cadastrar de novo não recebe mais "CPF já cadastrado". A mensagem única aponta os dois caminhos ("Esqueci minha senha" ou a recepção).

Detalhe que só ficou disponível agora: `data_nascimento` só serve como segundo fator porque o trigger `trg_pacientes_identidade` (S-01) a tornou imutável depois do vínculo. Sem ele, bastaria reivindicar e corrigir a data em seguida — a conferência não valeria nada.

Fantasma com `data_nascimento` nula cai na recusa **de propósito** (fail-closed): sem o segundo fator não há claim, e a recepção resolve. Hoje esse caso não existe — a coluna é `NOT NULL`. A guarda fica como defesa caso a restrição afrouxe.

**Exercitado ao vivo em 30/07/2026** contra a API local e o Supabase real, com um paciente-fantasma descartável criado e removido no fim (base conferida de volta em 8 pacientes / 6 fantasmas / 2 usuários):

| Passo | Envio | Resultado |
|---|---|---|
| data errada | `1988-03-22` | 409 genérico; **zero** usuário criado no Auth; fantasma intacto |
| data certa | `1988-03-21` | 201, `paciente.id` = o id do fantasma (reivindicou, não criou linha); `data_nascimento` do balcão preservada |
| repetido, já vinculado | outro e-mail | 409 com corpo **byte a byte idêntico** ao da data errada |
| `update` direto na linha vinculada | `data_nascimento` | bloqueado pelo trigger do S-01 |

A recusa vem **antes** do `createUser`: um chute errado não queima o e-mail nem deixa conta órfã no Auth. E o último passo é o elo com o S-01 — sem o trigger, bastaria reivindicar e corrigir a data em seguida.

Cobertura: `apps/api/test/cadastro.test.ts`, 10 testes — claim aceito, as três recusas, ausência de `data_nascimento` no UPDATE, e um teste que compara byte a byte as respostas de "já cadastrado" e "não confere". Suíte da API em 205 testes.

**Não** foi implementado o claim assistido por código de uso único. Continua sendo o alvo, e a conferência de nascimento continua sendo o piso.

---

### P-02 — Vulnerabilidades em dependências e ausência de CI — ~~**MÉDIO**~~ **CORRIGIDO**

> **STATUS 30/07/2026:** `npm audit fix` em `api` e `web` (zero vulnerabilidades
> nos dois) e workflow de CI criado em `.github/workflows/ci.yml`. O YAML abaixo
> era uma proposta e **falhava em dois passos** — ver "Verificação pós-correção"
> no fim da seção para o que foi de fato aplicado.

```
apps/api : 3 high   — fast-uri (host confusion), find-my-way (DDoS via HTTP/2), postcss (path traversal)
apps/web : 1 high   — postcss
raiz     : 16 total (1 low, 10 moderate, 5 high) — a maioria no toolchain do Expo
```

`find-my-way` é o roteador do Fastify e `fast-uri` entra pelo validador — as duas afetam a API em produção. **Todas têm correção disponível** (`fixAvailable: true`).

E não há **nenhum workflow de CI**: `.github/` contém só `skills/`. Não há gate rodando `npm test`, `type-check`, `lint` ou `npm audit` antes do merge. Existe uma suíte de testes decente em `apps/api/test/` (11 arquivos, incluindo `webhooks`, `documentos`, `laudosIdentidade`) que hoje só roda se alguém lembrar.

**Correção:** `npm audit fix` nos três workspaces, e um workflow mínimo:

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run type-check
      - run: npm run lint
      - run: npm test --workspaces --if-present
      - run: npm audit --omit=dev --audit-level=high
```

#### Verificação pós-correção (30/07/2026)

O workflow acima foi **testado antes de ser adotado** e dois dos seus passos falham neste repositório:

| Passo proposto | Resultado real | Como ficou |
|---|---|---|
| `npm audit --omit=dev --audit-level=high` (raiz) | **exit 1** — `brace-expansion`, `js-yaml` | rodado por workspace: `api` e `web`, ambos zero |
| `npm run lint` | **exit 127** — `eslint: command not found` | ESLint instalado e configurado; passo entrou depois (ver abaixo) |
| `npm run type-check --workspaces` | falharia — `apps/mobile` não compila | três workspaces nomeados, sem o mobile |
| `npm test --workspaces --if-present` | ok | mantido, explícito em `api` e `web` |

A raiz falha porque `apps/mobile` declara o Expo como dependência de **produção** — o `--omit=dev` não filtra o toolchain do protótipo. Não é vulnerabilidade em código que roda: é o `apps/mobile` estar no lugar errado da árvore de dependências. O P-05 já sugere tirá-lo do workspace principal justamente por isso; enquanto ele ficar, auditar por workspace é o que produz um sinal honesto.

O `lint` merece registro à parte: o script existe no `package.json` do `apps/web` desde o commit inicial e **nunca funcionou** — veio do template do Vite e ninguém instalou o ESLint. Vale saber que "temos lint" era falso.

Estado final do workflow: `type-check` (`shared`, `api`, `web`) → **lint** → testes (`api`, `web`) → build do web → `audit` (`api`, `web`), com `concurrency` cancelando runs superados. A sequência foi executada localmente na ordem do arquivo, com `set -e`.

#### ESLint — instalado em 30/07/2026

`eslint.config.mjs` na raiz (flat config, ESLint 10): `js.configs.recommended` + `typescript-eslint` recommended, mais `react-hooks` e `react-refresh` só no `apps/web`. Config único em vez de um por workspace — as regras que importam aqui valem igual nos dois lados, e duas cópias divergem.

Sem `recommendedTypeChecked`: ele precisa de um program do TypeScript por workspace e leva o lint para dezenas de segundos. O `type-check` do CI já roda o compilador de verdade; o lint cobre o que o compilador não vê.

A primeira execução acusou **17 erros e 4 avisos**. Todos foram corrigidos, e três eram defeito de verdade — não estilo:

| Achado | Onde | Por que importa |
|---|---|---|
| `preserve-caught-error` | `lib/flowlab.ts:27` | o erro de timeout era relançado **sem `cause`**: o erro original do `AbortSignal` sumia, e com ele o diagnóstico de por que o FlowLab não respondeu |
| `no-unused-vars` (write-only) | `LaudoDocumento.tsx` | `alturaFatia` era somada e reatribuída na paginação A4 e **nunca lida** — resto do cálculo de altura que sobrou do commit da paginação, tinha toda a cara de ser usada |
| directive obsoleta | `BookingPanel.tsx:60` | `eslint-disable` de `exhaustive-deps` que não suprimia nada, dando a impressão de que havia uma exceção consciente ali |

O resto era import não usado, `PADDING_FOLHA` morto, escape `\/` desnecessário em três regex de `laudos/mappers.ts` e `let dbError = null` redundante em `routes/cadastro.ts`. Nenhuma mudança de comportamento: 209 testes na API e 52 no web seguem passando.

**Duas exceções escritas na config**, ambas com o motivo no arquivo:

- `apps/api/scripts/**` — `no-explicit-any` e `no-useless-assignment` desligados. São ferramentas rodadas à mão contra ApLIS e FlowLab reais, com credenciais que não existem no ambiente de auditoria: reescrevê-las produziria mudança **não verificável** em código que não roda em produção.
- Sem `--max-warnings 0` no CI. Sobram **3 avisos** de `react-refresh/only-export-components` (`AuthField`, `LaudoSecoes`, `AuthContext` exportam constante ou hook junto do componente). Afeta hot reload em dev, não produção; virar erro forçaria uma série de arquivos novos sem ganho.

**Continua aberto:** `apps/mobile` fora do lint e do CI enquanto o app estiver parado — está nos `ignores` da config, é uma linha para tirar quando voltar.

#### Revisão do gate (31/07/2026)

Motivo da revisão: o workflow foi escrito em 30/07 e **nunca executou** — nada foi enviado ao remoto desde então (18 commits locais). Um gate que ninguém viu rodar é uma hipótese, não um gate. Rodei o arquivo passo a passo, primeiro no repositório de trabalho e depois sobre um **clone limpo com `npm ci`**, que é o que o GitHub faz.

| Passo | Repo de trabalho | Clone limpo (`npm ci`) |
|---|---|---|
| `npm ci` | — | **24 s**, lockfile em dia |
| Type-check (`shared`, `api`, `web`) | OK | OK |
| Lint | 0 erros, 3 avisos | idem |
| Testes (`api` / `web`) | 245 / 52 | 245 / 52 |
| Build do web | OK | OK |
| Auditoria (`api`, `web`) | 0 e 0 | 0 e 0 |

O clone limpo importa por um motivo específico: instalação nova não tem hoisting acumulado, então é onde **dependência usada mas não declarada** aparece. Foi o modo de falha do `pino` em 30/07 (`lib/http.ts` importava direto o que só existia como dependência transitiva do Fastify) — a declaração feita naquele dia está confirmada aqui.

**Um defeito encontrado no próprio arquivo:** o comentário no rodapé do `ci.yml` afirmava *"Sem passo de lint: … `npm run lint` falha com command not found"*. O passo de lint tinha sido acrescentado no mesmo dia, dez linhas acima. Sobrou da versão anterior do arquivo e passou a contradizer o conteúdo — o tipo de comentário que faz a próxima pessoa duvidar do que está lendo, ou pior, acreditar nele. Removido.

**Uma melhoria aplicada:** `permissions: contents: read` no topo. Sem essa declaração o `GITHUB_TOKEN` nasce com o default da organização, que pode ser escrita ampla; um job que só lê código não precisa disso, e o `postinstall` de qualquer dependência roda dentro do job. É menor privilégio no lugar de confiar que a configuração do GitHub está certa.

**Observação não corrigida:** `on: [push, pull_request]` sem filtro faz um PR de branch do próprio repositório disparar **dois runs** (o `push` e o `pull_request`), com grupos de `concurrency` diferentes, então nenhum cancela o outro. É desperdício, não defeito. A correção usual — `push: branches: [main, master]` — muda quando branch de trabalho recebe CI, e isso é decisão de fluxo, não técnica.

---

### P-03 — Cabeçalhos de segurança e redação de log — ~~**BAIXO**~~ **CORRIGIDO**

> **STATUS 30/07/2026:** os três itens aplicados — `@fastify/helmet`, redação no
> logger e CORS que falha no boot em produção. Ver "Verificação pós-correção" no
> fim da seção; a redação da query saiu **maior** do que o previsto aqui, por
> causa de um vazamento que o relatório original não tinha notado.

- **Sem `@fastify/helmet`.** Para uma API só-JSON o impacto é menor que num app que serve HTML, mas `X-Content-Type-Options: nosniff`, `Strict-Transport-Security` e `X-Frame-Options` são baratos e evitam classes inteiras de problema (sniffing de resposta, clickjacking se algum endpoint um dia servir HTML).
  ```bash
  npm i @fastify/helmet -w apps/api
  ```
  ```ts
  server.register(helmet, { contentSecurityPolicy: false })
  ```

- **Logger sem redação.** `Fastify({ logger: { level: 'info' } })` — os serializers padrão não registram headers, então o `Authorization` não vaza. Mas query strings entram no log, e os `request.log.error({ storagePath })` gravam `{paciente_id}/{uuid}` (pseudônimo, aceitável). Para dado de saúde, vale ser explícito:
  ```ts
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: ['req.headers.authorization', 'req.headers["x-api-key"]',
               'req.headers["x-webhook-signature"]', '*.cpf', '*.password', '*.email'],
    },
  })
  ```

- **Fallback de CORS.** Sem `CORS_ORIGIN`, a API libera qualquer porta de `localhost`/`127.0.0.1`. O `.env.example` já avisa que a variável é obrigatória em produção. Vale transformar o aviso em falha explícita no boot quando `NODE_ENV=production` — configuração de segurança que depende de lembrança é configuração que um dia falta.

#### Verificação pós-correção (30/07/2026)

| Item | Como ficou |
|---|---|
| Cabeçalhos | `@fastify/helmet` 13.1.0, `contentSecurityPolicy: false` (API só-JSON) |
| Logger | `redact` + serializer próprio de `req` que redige a query |
| CORS | `resolverCorsOrigin()` lança em produção quando `CORS_ORIGIN` falta ou está vazia |
| Onde | `apps/api/src/lib/http.ts` (novo), `apps/api/src/server.ts`, `apps/api/test/http.test.ts` (novo, 13 testes) |
| Verificação | 222 testes na API; API subida de verdade e cabeçalhos conferidos na resposta; boot em `NODE_ENV=production` sem `CORS_ORIGIN` derrubado |

**O achado que o relatório original não tinha visto.** A recomendação acima falava em "query strings entram no log" de forma genérica. Na prática existe um caso concreto e sério: `GET /integracao/pacientes/buscar?q=…` é o **typeahead da recepção**, e o `q` recebe nome ou CPF do paciente. O serializer padrão do Fastify grava a `url` inteira, então **cada busca no balcão escrevia um identificador de paciente em claro no log da API** — o mesmo dado que a Parte 3 quer criptografar no banco. `redact` sozinho não resolveria: os caminhos do pino não alcançam parte de uma string.

A correção foi um serializer de `req` que redige o **valor** dos params fora de uma lista curta (`download`, `refresh`, `escopo`, `tipo`, `agendamentoId`). A chave continua visível — dá para ver que houve uma busca e depurar —, o valor não. A lista é fail-closed: param novo nasce redigido sem ninguém precisar lembrar.

Confirmado com a API rodando, em par com um caso de controle — uma evidência só não distinguiria "redige o que deve" de "redige tudo", e um log cego não é melhor que um log vazado:

```
"url":"/api/v1/integracao/pacientes/buscar?q=<redigido>"   ← CPF na query, redigido
"url":"/api/v1/laudos?refresh=true"                        ← param inofensivo, intacto
```

Resposta real do `/ping`, com o servidor no ar:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
(sem Content-Security-Policy — desligado de propósito)
```

E o boot em produção sem a variável:

```
Error: CORS_ORIGIN é obrigatória em produção: defina o(s) domínio(s) do frontend separados por vírgula.
```

A lógica ficou em `lib/http.ts`, e não no `server.ts`, por um motivo prático: o `server.ts` se auto-inicia (`void start()`) e não dá para importar num teste. Sem essa extração, "falha no boot em produção" seria uma afirmação sem prova — é justamente o tipo de caminho que ninguém exercita até o dia do deploy.

**Fora do escopo desta correção:** a redação cobre o log da API. O CPF continua chegando em claro no `q` da requisição — ou seja, no log do proxy/CDN que estiver na frente, se houver. Quem for colocar um na frente precisa configurar a redação lá também.

---

### P-04 — As migrations não refletem o banco real — ~~**MÉDIO (processo)**~~ **CORRIGIDO 31/07/2026**

O projeto **não está linkado** ao CLI (`supabase link` nunca rodou; não há `supabase/config.toml`), e o banco tem pelo menos um objeto que não existe no repositório: a função `rls_auto_enable()` e seu event trigger (S-07).

Isso significa que `supabase/migrations/` **não é mais a fonte da verdade**. Recriar o ambiente do zero produz um banco diferente do de produção — o que envenena qualquer plano de disaster recovery e qualquer ambiente de staging.

**Correção:**
```bash
supabase link --project-ref rhiopafwojxujghscavi
supabase db pull            # traz o schema real para uma migration
supabase migration list     # confere o que está aplicado vs. o que está no repo
```
E, daqui em diante, toda mudança de schema entra por migration — inclusive as feitas pelo painel.

#### Verificação pós-correção (31/07/2026)

Medido antes de agir, e o diagnóstico de julho estava **incompleto**:

```
supabase_migrations.schema_migrations  →  NÃO EXISTIA
migrations no repositório              →  13
```

Não era um ledger desatualizado: **ele não existia**. As 13 migrations entraram por SQL direto (painel e Management API), e o banco não tinha registro de nenhuma. Um `supabase db push` enxergaria as 13 como pendentes e tentaria reaplicar tudo num banco que já tinha tudo.

**Qual seria o estrago, de verdade** — vale a distinção entre "destrutivo" e "barulhento":

| | |
|---|---|
| `drop table` / `truncate` no nível da migration | **nenhum** |
| `delete from` | só dentro de corpo de função (tempo de execução, não de aplicação) |
| `create table` sem `if not exists` | **5 migrations** |

O push morreria no primeiro `create table` com *relation already exists*, antes de tocar em dado. A armadilha era **menos perigosa do que esta auditoria supunha** — falha alto em vez de corromper em silêncio. O prejuízo real era o outro: ambiente recriado ≠ produção.

**O que foi feito, sem CLI e sem a senha do banco** (o `link` exige as duas):

1. **Ledger criado e preenchido** pela Management API — `supabase_migrations.schema_migrations` com as 14 versões marcadas como aplicadas. É o equivalente exato a `supabase migration repair --status applied` em cada uma. Escreve numa tabela de controle nova; não toca em dado nenhum.
2. **Órfãos capturados** em `20260731150000_p04_captura_rls_auto_enable.sql`, com o DDL extraído do catálogo de produção (`pg_get_functiondef` + `pg_event_trigger`), não reescrito de memória.

Estado final, conferido lendo o banco e o diretório:

```
registradas no banco : 14
no repositório       : 14
só no banco          : nenhuma
só no repositório    : nenhuma
```

Varredura do resto do schema para não sobrar órfão: **6 tabelas** (`pacientes`, `agendamentos`, `resultados`, `documentos`, `exam_results`, `correcoes_identidade`), **3 triggers**, **5 policies**, **0 views** — tudo criado por migration do repositório.

**Duas ressalvas honestas:**

- `create event trigger` exige papel com privilégio de superusuário. No ambiente local (`supabase start`) roda; contra projeto hospedado, o `postgres` do CLI pode não ter o direito. Em produção isso não é problema, porque os dois objetos já existem e a migration nasce marcada como aplicada — mas está escrito no cabeçalho dela para quem for recriar um ambiente hospedado.
- ~~O `supabase link` continua sem rodar~~ — **feito no mesmo dia**, depois que o usuário forneceu a senha do banco. O `supabase migration list` confirma o ledger construído à mão, e essa é a validação mais forte possível: quem julga não sou eu, é a própria ferramenta que reclamaria da divergência.

```
local            remote           time
20260626120000   20260626120000   2026-06-26 12:00:00
…                …                …
20260731150000   20260731150000   2026-07-31 15:00:00
```

As 14 com `local == remote`, nenhuma linha só de um lado. O `supabase/.temp/` que o `link` cria entrou no `.gitignore`: guarda estado de sessão por máquina, não pertence ao repositório.

`supabase db diff`/`db pull` não rodaram — exigem Docker para o shadow database, indisponível nesta máquina. A varredura manual de tabelas, triggers, policies e views cobre o mesmo terreno para objetos; o que ela não pegaria é diferença fina de *default* ou *constraint*, que fica para quando houver Docker.

---

### P-05 — Observações de qualidade (não-segurança) — **CORRIGIDO (código) 31/07/2026**

> **STATUS 31/07/2026:** os cinco itens acionáveis estão fechados — três em
> código, dois em banco (migrations aplicadas em produção). O sexto segue fora
> de escopo por decisão anterior. Ver "Verificação pós-correção" no fim da seção.

- ~~**`resultados.ts` funde erro de banco com "não encontrado"**~~ **CORRIGIDO.** (`maybeSingle` sem checar `error` separadamente) — o próprio `documentos.ts` comentava isso como defeito conhecido de `resultados.ts:31`. Uma falha transitória do banco virava 404 mentiroso. Correção de 3 linhas, no padrão que `documentos.ts` já usa.
- ~~**TTL de signed URL inconsistente**~~ **CORRIGIDO.** 300 s em `documentos.ts`, 900 s em `integracao.ts` (ambos justificados por escrito), mas **3600 s** em `resultados.ts:38` sem justificativa. Uma URL de laudo válida por uma hora sobrevive a histórico de browser e link compartilhado por engano. Alinhado para 300 s.
- ~~**`sanitizarNome()` está duplicada**~~ **CORRIGIDO.** Estava em `routes/documentos.ts` e `routes/integracao.ts`, com o comentário explicando que foi mantida local "para não acoplar os dois arquivos". Virou `lib/nomeArquivo.ts` — em vez do teste de equivalência que este relatório sugeria, que detectaria a divergência em vez de impedi-la.
- **`set_updated_at()` e `set_atualizado_em()` têm corpo idêntico** — ambas atribuem `new.atualizado_em`. A segunda foi criada porque a primeira "era de `agendamentos`", mas as duas escrevem a mesma coluna. Uma função só serve as duas tabelas; a duplicata é manutenção dobrada para zero ganho. → **CORRIGIDO**, migration `20260731120000`.
- **Bucket `laudos` sem `file_size_limit` nem `allowed_mime_types`**, ao contrário de `documentos`. Só o `service_role` escreve nele, então o risco é baixo, mas a assimetria não tem razão de ser. → **CORRIGIDO**, migration `20260731130000`.
- **`apps/mobile` é protótipo com mocks** (`src/mocks/exams.ts`), sem cliente Supabase e sem chamada de API. Não é superfície de ataque hoje, mas é a origem da maior parte dos 16 avisos de `npm audit` (toolchain do Expo). Se o app está parado, considere movê-lo para fora do workspace principal para não poluir a auditoria do que está em produção. → **fora de escopo** enquanto o mobile estiver parado (mesma decisão que o tirou do CI).

#### Verificação pós-correção (31/07/2026)

| Item | Antes | Agora |
|---|---|---|
| Falha de banco em `GET /resultados/:id/declaracao` | 404 "Declaração não encontrada" | 500 "Falha ao carregar resultado", com log |
| TTL da signed URL de declaração | 3600 s | **300 s** |
| `sanitizarNome()` | 2 cópias | 1, em `lib/nomeArquivo.ts` |
| Testes de `routes/resultados.ts` | **nenhum** | 9 |
| TTL registrado pelo mock de Storage | descartado (`_ttl`) | `StorageCall.ttl` |

Suíte da API em **245 testes**. As duas colunas do meio da tabela acima existiam sem nenhum teste cobrindo a rota — daí o arquivo novo cobrir também os caminhos que já estavam corretos (filtro por `paciente_id` do token, 401 sem token, falha ao assinar).

Três notas que valem mais que os diffs:

1. **O 404 mentiroso era pior do que "erro trocado".** 404 é resposta esperada: não vira alerta, não vira anomalia no log, e o paciente que o recebe conclui que o laudo dele não existe. Uma indisponibilidade do banco se apresentava como ausência de documento, para os dois lados ao mesmo tempo.
2. **Os 404 continuam indistinguíveis entre si de propósito** — id inexistente, id de outro paciente e resultado sem PDF devolvem a mesma frase. Separar contaria a quem o id pertence. Há teste fixando isso, para que a próxima pessoa não "melhore" a mensagem.
3. **O mock de Storage descartava o TTL.** Nenhum teste do repositório jamais conferiu esse valor em nenhuma rota: dava para trocar 300 por 3600 em `documentos.ts` e a suíte continuar verde. Corrigido no helper, não só onde o P-05 apontava.

### P-06 — A `FLOWLAB_API_KEY` de produção é um valor de exemplo — **ALTO**

Achado em 31/07/2026, ao verificar a tela de correção de identidade. **Verificado ao vivo:** a API de produção (`labhub.ngrok.app`) aceita `x-api-key: flowAPIKey1234567890`. Não é um segredo aleatório — é uma string de desenvolvimento, do tipo que se adivinha ou que sobra em print, chat e tutorial.

O que essa chave abre, sozinha, sem nenhum JWT:

| Rota | O que dá para fazer |
|---|---|
| `GET /integracao/pacientes/buscar?q=` | listar pacientes por nome — devolve `id`, nome, data de nascimento e CPF mascarado |
| `POST /integracao/pacientes/:id/correcao-identidade` | **reescrever CPF e data de nascimento de qualquer paciente** |
| `GET /integracao/agendamentos/:id/documentos` | ler os documentos do paciente (RG/CNH/carteirinha/pedido) |
| `POST /integracao/agendamentos/:id/documentos` | enviar documento no cadastro de um paciente |
| `POST /integracao/agendamentos` | criar agendamento |

As duas primeiras linhas se encadeiam: a busca entrega o `id`, e a correção aceita esse `id`. **Isso reabre exatamente o que S-01 e P-01 fecharam** — a diferença é que agora o caminho não é o portal do paciente, é o canal de integração. O trigger `trg_pacientes_identidade` não protege daqui, porque a RPC de correção é justamente a saída autorizada que ele deixou aberta.

A severidade subiu **hoje**: antes de a rota de correção existir, a chave dava leitura de PII e escrita de agendamento. Agora dá escrita de identidade.

O que não é o caso, e vale registrar para não superestimar: a string **não está no histórico de nenhum dos dois repositórios** (conferido com `git log -S` em `flowlab` e `LAB-HUB`; os dois são públicos no GitHub, e o `.env.example` de cada um traz placeholder, não o valor). O risco é a fraqueza do valor, não uma publicação.

**Correção — rotacionar para um segredo aleatório.** A chave é compartilhada, então a troca precisa ser simultânea em quatro lugares, ou a integração cai:

1. Vercel do FlowLab (`FLOWLAB_API_KEY`, **Production e Preview**)
2. `.env` da API do LAB-HUB **no VPS** (mudar o local não muda produção — ver a topologia)
3. Segredo `flowlab_api_key` no Vault do Supabase de produção do FlowLab
4. `FLOWLAB_API_KEY` do `.env` local de quem desenvolve

Enquanto não rotaciona, o mitigante que existe é o rate limit de 10/min na rota de correção — que reduz o volume, não o acesso.

> **Rotação dispensada por decisão do usuário em 31/07/2026.** Fica registrado
> para quem ler depois: o achado não foi refutado, foi aceito. O que muda o
> cálculo, se um dia for retomado, é que a simultaneidade nos quatro lugares
> **não é obrigatória** — bastaria a API do LAB-HUB aceitar duas chaves durante
> uma janela de transição (`FLOWLAB_API_KEY` e `FLOWLAB_API_KEY_ANTERIOR`, ambas
> na mesma comparação de tempo constante de `middlewares/apiKey.ts`), e aí a
> troca vira quatro passos independentes, sem queda nenhuma da integração.

---

# PARTE 3 — Plano de criptografia dos dados do paciente

Esta é a parte que você pediu explicitamente. Antes do "como", dois esclarecimentos que mudam o desenho.

## 3.1 O que criptografia resolve e o que não resolve

**Já existe hoje, de graça:** o Supabase cifra o disco (AES-256 at rest) e todo tráfego da API (TLS). Se o cenário de risco é "roubaram o datacenter", já está coberto.

**O que a criptografia de coluna acrescenta** — proteção contra vazamento *lógico*:
- `pg_dump` ou backup baixado por alguém
- réplica de leitura, ambiente de staging populado com dado real
- acesso indevido ao Supabase Studio (colaborador, credencial vazada)
- consulta ampla demais por um role mal configurado — **exatamente o cenário de S-01**
- bug futuro de RLS

**O que ela NÃO resolve:**
- **S-01 e P-01.** Nos dois, o atacante está autenticado e a aplicação decifra o dado para ele voluntariamente. Criptografar não muda nada. Por isso o revoke de grants vem antes.
- Comprometimento do servidor da API — quem tem a chave lê tudo.

**O custo real, para decidir com os olhos abertos:**
- **Perder a chave = perder os dados.** Não há recuperação. A chave precisa de backup separado do backup do banco, e testado.
- **Coluna cifrada não é pesquisável.** Acaba `ilike`, `order by`, `between`. Isso tem consequência concreta neste projeto — ver 3.4.
- Cada valor cresce ~40 bytes (IV + tag) mais o overhead de base64.

## 3.2 Decisão: onde mora a chave

| Abordagem | Chave onde | Protege contra dump? | Custo |
|---|---|---|---|
| **A. Aplicação (AES-256-GCM em Node)** | env/KMS da API, **fora do Postgres** | **Sim, totalmente** | médio: toca mappers e repositórios |
| **B. `pgcrypto` com chave em tabela** | dentro do próprio banco | **Não** — dump leva chave e dado | baixo |
| **C. Supabase Vault (`pgsodium`)** | root key fora da camada SQL, gerida pelo Supabase | Sim para `pg_dump` | baixo-médio; amarra ao Supabase |

**Recomendo A** para o dado clínico, porque é a única em que um dump do banco — inclusive o que S-01 permitiria — sai **inútil**. B está descartada: chave e cadeado na mesma gaveta. C é aceitável se a prioridade for velocidade de implementação, e pode conviver com A.

Boa notícia: `pgcrypto` e `supabase_vault` **já estão instalados** no projeto, então nenhuma das três exige provisionamento novo.

## 3.3 Desenho proposto (abordagem A)

**Envelope do valor cifrado** — string única, autodescritiva, versionada para permitir rotação:

```
v1:k1:<iv_b64>:<tag_b64>:<ciphertext_b64>
 │   └── id da chave (permite rotacionar sem re-cifrar tudo de uma vez)
 └────── versão do formato
```

**AAD (Additional Authenticated Data) = `` `${tabela}:${coluna}:${id_da_linha}` ``.** Detalhe que costuma ser esquecido e importa muito: sem AAD, alguém com escrita no banco pode **mover** o ciphertext do laudo de A para a linha de B — a decifragem funciona e o dado aparece sob o dono errado. Com AAD, a autenticação do GCM falha.

```ts
// apps/api/src/lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'node:crypto'

const CHAVES: Record<string, Buffer> = {
  k1: Buffer.from(requireEnv('PII_KEY_K1'), 'base64'),  // 32 bytes
}
const CHAVE_ATUAL = 'k1'
const PEPPER = Buffer.from(requireEnv('PII_BLIND_INDEX_PEPPER'), 'base64')

export function cifrar(texto: string, aad: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', CHAVES[CHAVE_ATUAL], iv)
  c.setAAD(Buffer.from(aad))
  const ct = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  return `v1:${CHAVE_ATUAL}:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${ct.toString('base64')}`
}

export function decifrar(envelope: string, aad: string): string {
  const [v, keyId, iv, tag, ct] = envelope.split(':')
  if (v !== 'v1') throw new Error('Envelope de criptografia desconhecido')
  const chave = CHAVES[keyId]
  if (!chave) throw new Error(`Chave ${keyId} indisponível`)
  const d = createDecipheriv('aes-256-gcm', chave, Buffer.from(iv, 'base64'))
  d.setAAD(Buffer.from(aad))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8')
}

// Blind index: permite buscar por igualdade sem guardar o valor em claro.
// Pepper SEPARADO da chave de cifra, de propósito: comprometer um não entrega o outro.
export function blindIndex(valor: string): string {
  return createHmac('sha256', PEPPER).update(valor.replace(/\D/g, '')).digest('hex')
}
```

**Por que blind index e não hash simples no CPF:** o espaço de CPFs válidos é pequeno (~10¹¹) e enumerável — um `sha256(cpf)` sem segredo é quebrado por força bruta em minutos. O HMAC com pepper fora do banco fecha isso.

## 3.4 Coluna a coluna — e onde dói

| Coluna | Como é usada hoje | Plano |
|---|---|---|
| `exam_results.result` | só leitura/escrita inteira, nunca filtrada | **Cifrar.** Zero atrito. Prioridade máxima — é o laudo completo |
| `resultados.paineis`, `.resumo` | idem | **Cifrar.** Zero atrito |
| `pacientes.cpf` | só `.eq()` (cadastro, integração, laudos) + UNIQUE | **Cifrar** + coluna `cpf_bidx` UNIQUE com o blind index. Todo `.eq('cpf', x)` vira `.eq('cpf_bidx', blindIndex(x))` |
| `pacientes.telefone` | lido para enviar ao FlowLab | **Cifrar.** Zero atrito |
| `pacientes.email` | lido para exibir | **Cifrar.** (o e-mail canônico vive em `auth.users`, gerido pelo Supabase) |
| `pacientes.data_nascimento` | `select` em `/laudos`, exibido na busca da recepção | **Cifrar** — mas ver P-01: se o claim passar a conferir nascimento, a conferência vira comparação de blind index |
| **`pacientes.nome`** | **`ilike('nome', '%termo%')`** em `/integracao/pacientes/buscar` | **Conflito real — decidir. Ver abaixo** |
| `documentos.nome_arquivo` | exibição e `Content-Disposition` | **Cifrar.** Zero atrito |

**Cuidado novo, criado pela correção do S-01.** O trigger `trg_pacientes_identidade` e a RPC `corrigir_identidade_paciente()` comparam `cpf` e `data_nascimento` por igualdade — entre `old`/`new` e contra as colunas de `correcoes_identidade`. AES-GCM usa IV aleatório, então **cifrar o mesmo CPF duas vezes dá ciphertexts diferentes**, e toda comparação de igualdade passa a mentir: `new.cpf is distinct from old.cpf` viraria verdadeiro em qualquer `UPDATE`, bloqueando até troca de nome. Ao cifrar essas duas colunas é obrigatório migrar as comparações para o **blind index** (determinístico) e guardar `cpf_bidx`/`nascimento_bidx` na trilha em vez do valor. Sem isso a criptografia quebra o `PUT /pacientes/me` e o claim do `POST /cadastro` de uma vez.

**O conflito do `nome`.** `GET /integracao/pacientes/buscar` é o typeahead da recepção e faz busca parcial por nome. Coluna cifrada não suporta `ilike`. Três saídas:

1. **Buscar por CPF em vez de nome** (recomendada). O operador tem o CPF do paciente em mãos no balcão — é o documento que a pessoa apresenta. Vira `.eq('cpf_bidx', blindIndex(cpf))`, exato, mais rápido, e **elimina a enumeração da base** que o `ilike` permite hoje (`q` de 2 caracteres devolve 8 pacientes; iterar o alfabeto varre o cadastro).
2. **Decifrar e filtrar na API.** Funciona com a base atual (8 pacientes), não escala. Descarte.
3. **Deixar `nome` em claro.** Custo: um dump ainda liga nome a laudo (se o `paciente_id` correlacionar). Aceitável só se (1) for inviável operacionalmente.

Minha recomendação é (1): resolve o conflito **e** fecha a enumeração de cadastro, de graça.

## 3.5 Migração sem downtime

Nunca cifre com um `UPDATE` grande e um deploy só — se algo falhar no meio, sobra base ilegível.

```
1. Migration: adiciona colunas nullable  cpf_enc, nome_enc, …, cpf_bidx
               (mantém as antigas intactas)
2. Deploy A:  escrita DUPLA (claro + cifrado); leitura ainda do claro
               → a partir daqui, todo dado novo já nasce cifrado
3. Backfill:  script em lotes que preenche as colunas _enc das linhas antigas
               (idempotente, re-executável, com log de progresso)
4. Verificação: count(*) where cpf is not null and cpf_enc is null  →  0
5. Deploy B:  leitura passa para as colunas cifradas
6. Observar em produção (dias, não horas)
7. Migration: cria UNIQUE em cpf_bidx, DROP das colunas em claro,
               DROP do unique antigo em cpf
```

Os passos 2→5 são reversíveis: dá para voltar o deploy a qualquer momento porque o dado em claro ainda existe. Só o passo 7 é definitivo.

Onde encaixar no código atual, sem espalhar: `apps/api/src/lib/mappers.ts` já é o ponto único de conversão linha-do-banco → objeto de domínio (`toPaciente`, `toDocumento`). Cifrar/decifrar ali e no `laudos/repository.ts` cobre quase tudo, porque nenhuma rota monta o objeto na mão.

## 3.6 Gestão da chave — a parte que costuma falhar

- **Geração:** `openssl rand -base64 32` (32 bytes = AES-256). Uma chave por ambiente. **Nunca** a mesma em dev e produção.
- **Onde vive:** variável de ambiente da API, injetada pela plataforma (Vercel/Railway/Fly). Nunca no repositório, nunca no Supabase.
- **Backup:** cofre separado do backup do banco (1Password/Bitwarden/AWS Secrets Manager). **Se o backup da chave ficar junto do backup do banco, você não ganhou nada.**
- **Rotação:** o `keyId` no envelope permite adicionar `k2` como chave de escrita mantendo `k1` só para leitura, e re-cifrar em background. Sem janela de indisponibilidade.
- **Teste de recuperação:** restaure um dump em ambiente isolado, aplique a chave do cofre e confirme que decifra. Faça isso **antes** de precisar.

---

# Plano de ação priorizado

### Agora (risco ativo em produção)

| | Ação | Onde | Status |
|---|---|---|---|
| 1 | `revoke all` de `anon`/`authenticated` nas tabelas + `alter default privileges` | SQL — S-01 | **feito 30/07** |
| 2 | Trigger que torna `cpf`/`data_nascimento`/`auth_user_id` imutáveis pós-claim | SQL — S-01 | **feito 30/07** |
| 3 | Saída autorizada de correção (RPC + trilha + rota da recepção) | SQL + `routes/integracao.ts` — S-01 | **feito 30/07** |
| 4 | Tela no FlowLab que consome `POST /integracao/pacientes/:id/correcao-identidade` | FlowLab | **feito 30/07** (e2e validado; falta aplicar no FlowLab de produção) |
| 5 | Conferir `data_nascimento` no claim do paciente-fantasma (erro genérico) | `routes/cadastro.ts` — P-01 | **feito 30/07** |
| 6 | `npm audit fix` nos três workspaces | P-02 | **feito 30/07** (raiz desfeita — ver registro) |

Depois de (1), reconfira: `select has_table_privilege('authenticated','public.pacientes','UPDATE')` deve retornar `false`.

### Esta semana (antes de qualquer paciente real)

| | Ação | Onde |
|---|---|---|
| 6.5 | ~~Rotacionar a `FLOWLAB_API_KEY`~~ — **dispensado pelo usuário 31/07** (achado aceito, não refutado) | P-06 |
| 7 | `pg_dump` cifrado agendado + **teste de restauração** | S-02 |
| 8 | ~~Ligar SSL enforcement~~ — **feito 31/07**. `dbAllowedCidrs` mantido aberto (IP dinâmico); rotação de senha pendente | S-03 |
| 9 | ~~Senha mín. 12 + reautenticação~~ — **feito 30/07** | S-04 |
| 10 | ~~SMTP próprio, `site_url` real, `uri_allow_list`, `REQUIRE_EMAIL_CONFIRMATION=true`~~ — **feito 31/07**, templates em português e verificado em produção | S-05 |
| 11 | ~~Realinhar migrations com o banco real~~ — **feito 31/07** (ledger criado + órfãos capturados, sem CLI); `supabase link` segue pendente, exige a senha do banco | P-04 |
| 12 | ~~Workflow de CI com `type-check`, `lint`, `test`, `audit --audit-level=high`~~ — **feito 30/07** (ESLint instalado e configurado no mesmo dia) | P-02 |

### Este mês

| | Ação | Onde |
|---|---|---|
| 13 | Criptografia de coluna, começando por `exam_results.result` e `resultados.paineis` | Parte 3 |
| 14 | Trocar o typeahead da recepção de nome para CPF (blind index) | §3.4 |
| 15 | Estender a trilha append-only aos pontos de leitura de dado sensível | S-08 |
| 16 | Rotina de expurgo (`storage.remove` **antes** do `delete`) + exclusão de conta | S-09 |
| 17 | ~~`@fastify/helmet` + `redact` no logger + CORS obrigatório em produção~~ — **feito 30/07** | P-03 |
| 18 | Índices faltantes + `(select auth.uid())` nas 5 policies | S-11 |
| 19 | Migrar `anon key` e service role para o formato de chave revogável | S-10 |
| 20 | `search_path = ''` nas funções (parcial: falta `rls_auto_enable`); ~~unificar `set_updated_at`/`set_atualizado_em`~~ — **feito 31/07** | S-10 / P-05 |
| 21 | ~~Alinhar TTL de signed URL em `resultados.ts` (3600 s → 300 s)~~ — **feito 31/07**, junto com o 404 mentiroso e a duplicata de `sanitizarNome` | P-05 |
| 22 | ~~Limites do bucket `laudos` (10 MB + `application/pdf`)~~ — **feito 31/07** | P-05 |

---

## Anexo — como reproduzir a verificação

```bash
TOKEN=$(cat ~/.supabase/access-token)
REF=rhiopafwojxujghscavi
API="https://api.supabase.com/v1/projects/$REF"

# Advisors nativos (linter de segurança e performance)
curl -s -H "Authorization: Bearer $TOKEN" "$API/advisors/security"    | jq '.lints[] | {level,name,detail}'
curl -s -H "Authorization: Bearer $TOKEN" "$API/advisors/performance" | jq '.lints[] | {level,name,detail}'

# Postura de rede, TLS, backup e auth
curl -s -H "Authorization: Bearer $TOKEN" "$API/network-restrictions"
curl -s -H "Authorization: Bearer $TOKEN" "$API/ssl-enforcement"
curl -s -H "Authorization: Bearer $TOKEN" "$API/database/backups"
curl -s -H "Authorization: Bearer $TOKEN" "$API/config/auth" | jq '{password_min_length, password_required_characters, security_update_password_require_reauthentication, site_url}'

# Privilégios efetivos — o achado central (S-01)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select r.rolname, t.tab, has_table_privilege(r.rolname,'\''public.'\''||t.tab,'\''UPDATE'\'') as upd from (values ('\''anon'\''),('\''authenticated'\'')) r(rolname), (values ('\''pacientes'\''),('\''resultados'\''),('\''exam_results'\'')) t(tab)"}' \
  "$API/database/query"
```

> O endpoint `/database/query` executa SQL arbitrário em **produção** e não tem dry-run. Todas as consultas de **auditoria** acima são de leitura. As correções do Registro de execução foram aplicadas por esse mesmo endpoint, com autorização explícita; os testes de comportamento que precisavam escrever foram feitos em bloco `do $$ ... raise exception` — o `raise` final aborta a transação inteira, então nada é commitado aconteça o que acontecer. Nunca confie em `begin ... rollback` avulso aqui.
