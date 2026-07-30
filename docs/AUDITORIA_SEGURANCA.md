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
| P-01 | Reivindicação de paciente-fantasma só por CPF, sem segundo fator de identidade | **ALTO** |
| S-02 | Sem PITR e sem backup listado — perda de dado clínico é irreversível | **ALTO** |
| S-03 | Banco aberto a `0.0.0.0/0` e SSL não obrigatório na conexão Postgres | **ALTO** |
| S-04 | Política de senha fraca (mín. 6, sem HIBP), sessão sem expiração, troca de senha sem reautenticação, MFA não exigido | **ALTO** |
| S-05 | `site_url` = `localhost:3000`, sem SMTP próprio, confirmação de e-mail desligada | **ALTO** |
| S-06 | Dados clínicos (`exam_results.result`, `resultados.paineis`) e identificadores em texto puro | **MÉDIO** → ver Parte 3 |
| P-02 | 4 vulnerabilidades `high` em dependências de produção; sem CI e sem gate de auditoria | **MÉDIO** |
| S-07 | `rls_auto_enable()` é `SECURITY DEFINER` e executável por `anon` via RPC | **MÉDIO** |
| S-08 | Sem trilha de auditoria de acesso a dado de saúde (LGPD art. 37/38) | **MÉDIO** |
| S-09 | Sem política de retenção/expurgo; `on delete cascade` deixa arquivos órfãos no Storage | **MÉDIO** |
| P-03 | API sem cabeçalhos de segurança (helmet) e sem redação de PII nos logs | **BAIXO** |
| S-10 | Funções sem `search_path` fixo; `anon key` no formato JWT legado (não revogável) | **BAIXO** |
| S-11 | RLS reavalia `auth.uid()` por linha; FKs sem índice de cobertura | **PERF** |

**Ordem de ataque recomendada:** ~~S-01~~ (feito) → **P-01** → S-02/S-03/S-04/S-05 → criptografia (Parte 3) → o resto.

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

**O que isso NÃO resolveu:** P-01 continua aberto — quem souber o CPF de um paciente-fantasma ainda assume a linha dele no cadastro. O trigger tornou `data_nascimento` confiável (imutável pós-claim), que era a peça que faltava para a correção do P-01 valer alguma coisa. É o próximo da fila.

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

Falta para valer em produção: aplicar a migration de permissão no FlowLab e testar a ponta a ponta contra esta API.

> **Nota de processo.** Não existe `supabase_migrations.schema_migrations` neste projeto — o schema nunca passou pelo CLI, foi tudo aplicado à mão. Os arquivos em `supabase/migrations/` são o registro versionado do que foi aplicado, não algo que uma ferramenta rastreia. Criar essa tabela agora faria um `db push` futuro achar que só as migrations novas estão aplicadas e tentar rodar as 8 antigas do zero. Ver P-04.

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

### S-02 — Sem PITR e sem backup — **ALTO**

```json
{"pitr_enabled": false, "walg_enabled": true, "backups": []}
```

`walg_enabled` significa que o Supabase faz o backup físico gerenciado do plano, mas **a lista de backups restauráveis está vazia** e não há Point-in-Time Recovery. Traduzindo o risco concreto: o `delete` em massa descrito em S-01, um `on delete cascade` disparado sem querer, ou um bug numa migration **não têm caminho de volta**. Não existe "restaurar para 10 minutos atrás".

Para dado clínico isso é grave em duas frentes ao mesmo tempo: perda de registro de saúde do paciente, e descumprimento do princípio de disponibilidade/integridade da LGPD (art. 6º, VII).

**Correção:** habilitar PITR (exige plano Pro+) e, independentemente disso, um `pg_dump` cifrado agendado para storage externo, com **teste de restauração documentado**. Backup que nunca foi restaurado não é backup, é esperança.

---

### S-03 — Banco exposto à internet inteira e sem SSL obrigatório — **ALTO**

```json
network-restrictions: {"dbAllowedCidrs": ["0.0.0.0/0"], "dbAllowedCidrsV6": ["::/0"]}
ssl-enforcement:      {"database": false}
```

Duas coisas separadas:

- **`0.0.0.0/0`** — qualquer host do planeta pode abrir conexão TCP com `db.rhiopafwojxujghscavi.supabase.co:5432`. A senha é a única barreira, e o alvo fica exposto a força bruta e a qualquer CVE futura do Postgres/pooler.
- **SSL não obrigatório** — o servidor **aceita** conexão em texto puro. Um cliente mal configurado (script, ferramenta de BI, migração) negocia sem TLS e trafega laudo e CPF em claro pela internet.

**Correção:**
1. Restringir `dbAllowedCidrs` aos IPs de saída da API e da sua máquina. Se a API roda em plataforma com IP dinâmico, use o Supavisor/pooler e restrinja o que der.
2. Ligar SSL enforcement — isso só rejeita conexões inseguras; a API (via `supabase-js`, que usa HTTPS/PostgREST) não é afetada.
3. Rotacionar a senha do banco depois, já que ela esteve exposta a força bruta aberta.

---

### S-04 — Autenticação frouxa para o tipo de dado — **ALTO**

| Configuração | Valor atual | Problema |
|---|---|---|
| `password_min_length` | **6** | 6 caracteres é quebrável por força bruta offline |
| `password_required_characters` | `null` | `123456` é uma senha válida hoje |
| `password_hibp_enabled` | **false** | senha vazada em breach conhecida é aceita |
| `security_captcha_enabled` | **false** | login e signup sem proteção contra automação |
| `security_update_password_require_reauthentication` | **false** | **quem rouba a sessão troca a senha sem saber a antiga** |
| `sessions_timebox` | **0** | sessão nunca expira |
| `sessions_inactivity_timeout` | **0** | sessão esquecida em desktop compartilhado vale para sempre |
| `mfa_totp_enroll_enabled` | true | disponível, mas **não exigido** |
| `mailer_notifications_password_changed_enabled` | false | troca de senha não notifica o titular |

O item mais sério é a combinação **reautenticação desligada + sessão eterna**: um token vazado (XSS, dispositivo compartilhado, backup de browser) vira posse permanente da conta, porque o atacante troca a senha sem conhecer a atual e o dono nem é avisado.

Observe que o `apps/api/src/schemas/cadastro.ts` já exige `min(8)` — mas essa validação só cobre o `POST /cadastro`. Qualquer chamada direta ao `/auth/v1/signup` do Supabase, ou o fluxo de reset de senha, cai nos 6 do servidor.

**Correção (painel Auth → Policies / Sessions):**
```
password_min_length ............................ 12
password_required_characters ................... letras + dígitos (mín.)
password_hibp_enabled .......................... true
security_captcha_enabled ....................... true (hCaptcha/Turnstile)
security_update_password_require_reauthentication  true
sessions_inactivity_timeout .................... 1800   (30 min)
sessions_timebox ............................... 43200  (12 h)
mailer_notifications_password_changed_enabled .. true
```
E alinhar o `min(8)` do zod para `min(12)`.

MFA por TOTP: já está habilitado no projeto. Para dado de saúde, vale oferecer no perfil e — no mínimo — exigir AAL2 em ações sensíveis (baixar laudo, trocar e-mail).

---

### S-05 — Configuração de e-mail incompatível com produção — **ALTO**

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

### P-01 — Conta de paciente é reivindicável só com o CPF — **ALTO**

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

---

### P-02 — Vulnerabilidades em dependências e ausência de CI — **MÉDIO**

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

---

### P-03 — Cabeçalhos de segurança e redação de log — **BAIXO**

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

---

### P-04 — As migrations não refletem o banco real — **MÉDIO (processo)**

O projeto **não está linkado** ao CLI (`supabase link` nunca rodou; não há `supabase/config.toml`), e o banco tem pelo menos um objeto que não existe no repositório: a função `rls_auto_enable()` e seu event trigger (S-07).

Isso significa que `supabase/migrations/` **não é mais a fonte da verdade**. Recriar o ambiente do zero produz um banco diferente do de produção — o que envenena qualquer plano de disaster recovery e qualquer ambiente de staging.

**Correção:**
```bash
supabase link --project-ref rhiopafwojxujghscavi
supabase db pull            # traz o schema real para uma migration
supabase migration list     # confere o que está aplicado vs. o que está no repo
```
E, daqui em diante, toda mudança de schema entra por migration — inclusive as feitas pelo painel.

---

### P-05 — Observações de qualidade (não-segurança)

- **`set_updated_at()` e `set_atualizado_em()` têm corpo idêntico** — ambas atribuem `new.atualizado_em`. A segunda foi criada porque a primeira "era de `agendamentos`", mas as duas escrevem a mesma coluna. Uma função só serve as duas tabelas; a duplicata é manutenção dobrada para zero ganho.
- **`sanitizarNome()` está duplicada** em `routes/documentos.ts` e `routes/integracao.ts`, com o comentário explicando que foi mantida local "para não acoplar os dois arquivos". É uma escolha defensável, mas as duas cópias precisam mudar juntas se a regra mudar — vale ao menos um teste que garanta que continuam equivalentes.
- **`apps/mobile` é protótipo com mocks** (`src/mocks/exams.ts`), sem cliente Supabase e sem chamada de API. Não é superfície de ataque hoje, mas é a origem da maior parte dos 16 avisos de `npm audit` (toolchain do Expo). Se o app está parado, considere movê-lo para fora do workspace principal para não poluir a auditoria do que está em produção.
- **`resultados.ts` funde erro de banco com "não encontrado"** (`maybeSingle` sem checar `error` separadamente) — o próprio `documentos.ts` comenta isso como defeito conhecido de `resultados.ts:31`. Uma falha transitória do banco vira 404 mentiroso. Correção de 3 linhas, no padrão que `documentos.ts` já usa.
- **TTL de signed URL inconsistente**: 300 s em `documentos.ts`, 900 s em `integracao.ts` (ambos justificados por escrito), mas **3600 s** em `resultados.ts:38` sem justificativa. Uma URL de laudo válida por uma hora sobrevive a histórico de browser e link compartilhado por engano. Alinhe para 300 s salvo motivo documentado.
- **Bucket `laudos` sem `file_size_limit` nem `allowed_mime_types`**, ao contrário de `documentos`. Só o `service_role` escreve nele, então o risco é baixo, mas a assimetria não tem razão de ser.

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
| 4 | Tela no FlowLab que consome `POST /integracao/pacientes/:id/correcao-identidade` | FlowLab | **feito 30/07** (falta migration de permissão + e2e) |
| 5 | Conferir `data_nascimento` no claim do paciente-fantasma (erro genérico) | `routes/cadastro.ts` — P-01 | aberto |
| 6 | `npm audit fix` nos três workspaces | P-02 | aberto |

Depois de (1), reconfira: `select has_table_privilege('authenticated','public.pacientes','UPDATE')` deve retornar `false`.

### Esta semana (antes de qualquer paciente real)

| | Ação | Onde |
|---|---|---|
| 7 | Habilitar PITR + `pg_dump` cifrado agendado + **teste de restauração** | S-02 |
| 8 | Restringir `dbAllowedCidrs`; ligar SSL enforcement; rotacionar senha do banco | S-03 |
| 9 | Senha mín. 12 + HIBP + captcha + reautenticação + timeout de sessão | S-04 |
| 10 | SMTP próprio, `site_url` real, `uri_allow_list`, `REQUIRE_EMAIL_CONFIRMATION=true` | S-05 |
| 11 | `supabase link` + `db pull` — realinhar migrations com o banco real | P-04 |
| 12 | Workflow de CI com `type-check`, `lint`, `test`, `audit --audit-level=high` | P-02 |

### Este mês

| | Ação | Onde |
|---|---|---|
| 13 | Criptografia de coluna, começando por `exam_results.result` e `resultados.paineis` | Parte 3 |
| 14 | Trocar o typeahead da recepção de nome para CPF (blind index) | §3.4 |
| 15 | Estender a trilha append-only aos pontos de leitura de dado sensível | S-08 |
| 16 | Rotina de expurgo (`storage.remove` **antes** do `delete`) + exclusão de conta | S-09 |
| 17 | `@fastify/helmet` + `redact` no logger + CORS obrigatório em produção | P-03 |
| 18 | Índices faltantes + `(select auth.uid())` nas 5 policies | S-11 |
| 19 | Migrar `anon key` e service role para o formato de chave revogável | S-10 |
| 20 | `search_path = ''` nas funções; unificar `set_updated_at`/`set_atualizado_em` | S-10 / P-05 |
| 21 | Alinhar TTL de signed URL em `resultados.ts` (3600 s → 300 s) | P-05 |

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
curl -s -H "Authorization: Bearer $TOKEN" "$API/config/auth" | jq '{password_min_length, password_hibp_enabled, sessions_timebox, site_url}'

# Privilégios efetivos — o achado central (S-01)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select r.rolname, t.tab, has_table_privilege(r.rolname,'\''public.'\''||t.tab,'\''UPDATE'\'') as upd from (values ('\''anon'\''),('\''authenticated'\'')) r(rolname), (values ('\''pacientes'\''),('\''resultados'\''),('\''exam_results'\'')) t(tab)"}' \
  "$API/database/query"
```

> O endpoint `/database/query` executa SQL arbitrário em **produção** e não tem dry-run. Todas as consultas de **auditoria** acima são de leitura. As correções do Registro de execução foram aplicadas por esse mesmo endpoint, com autorização explícita; os testes de comportamento que precisavam escrever foram feitos em bloco `do $$ ... raise exception` — o `raise` final aborta a transação inteira, então nada é commitado aconteça o que acontecer. Nunca confie em `begin ... rollback` avulso aqui.
