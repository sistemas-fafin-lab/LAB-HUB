# Desenho · Verificação em duas etapas por e-mail (PV2-26, D6)

Status: aprovado (D6 = opcional, ligada pelo paciente em Configurações).

## O que o Supabase oferece

`@supabase/supabase-js` 2.108.2 tem MFA nativo só para TOTP e telefone; não há fator por e-mail. O segundo passo usa o código de uso único por e-mail do Supabase Auth (`signInWithOtp` + `verifyOtp` com `type: 'email'`).

O código, sozinho, abre uma sessão no Supabase. Por isso quem exige as duas etapas é a API, e não a tela.

## Tabelas e colunas

- `pacientes.dois_fatores_email boolean not null default false`. Só a API altera, e só depois de um código válido.
- `sessoes_dois_fatores`: uma linha por sessão do Supabase (`session_id` do JWT).
  - Colunas: `session_id uuid pk`, `paciente_id uuid → pacientes on delete cascade`, `verificada_em timestamptz null`, `enviado_em timestamptz null`, `tentativas int not null default 0` e `criada_em`.
  - RLS habilitada, sem policy e sem grant para `anon` e `authenticated`; a API usa a chave secreta.
  - Expurgo: a cada envio, a API apaga as linhas com mais de 30 dias. Uma sessão viva há mais de 30 dias pede o código de novo, o que é aceitável.

## Rotas

Todas em `/api/v1/auth/dois-fatores` e com o preHandler `authenticateParcial`, que valida o token mas não exige a segunda etapa.

| Rota | O que faz |
|---|---|
| `GET /` | `{ ativa, pendente, enviadoEm }` da sessão atual. |
| `POST /enviar { finalidade }` | Pede ao Supabase o código para o e-mail da conta (`shouldCreateUser: false`) e grava `enviado_em` com `tentativas = 0`. Aceita 1 envio por minuto por sessão; o próprio Supabase também limita. |
| `POST /verificar { codigo }` | `verifyOtp`; encerra a sessão que a verificação cria (`admin.signOut(jwt, 'local')`); marca `verificada_em` da sessão **atual**. |
| `POST /preferencia { ativa, codigo }` | Confere o código e liga ou desliga. Ao ligar, a sessão atual já fica verificada (o paciente acabou de provar o e-mail). |

Regras de envio por finalidade:

- **`login`:** a sessão precisa ter `amr` com `password` (entrou pela senha).
- **`confirmacao`** (ligar ou desligar, e excluir a conta): a sessão precisa estar liberada (verificação desligada ou sessão já verificada).

Limites:

- 5 tentativas por código; a sexta recebe 429 `TENTATIVAS_ESGOTADAS` até um novo envio.
- Código errado ou vencido responde 400 `CODIGO_INVALIDO` e conta uma tentativa.

## `authenticate` (todas as rotas de dados)

Depois de resolver o paciente:

- se `dois_fatores_email` estiver ligado e a sessão não estiver verificada, responde 403 `{ codigo: 'DOIS_FATORES_PENDENTE' }`;
- a sessão só conta como verificada se o `amr` do token tiver `password`. A sessão aberta só pelo código (`amr = otp`) nunca é liberada, nem com uma linha verificada.

`DELETE /pacientes/me`: com a verificação ligada, exige `{ codigo }` no corpo e confere antes de excluir.

## Clientes do Supabase no servidor

`verifyOtp` e `signInWithOtp` rodam num **cliente novo por chamada**, sem guardar sessão. Se rodassem no cliente compartilhado (chave secreta), a sessão criada pela verificação passaria a ser usada nas consultas ao banco no lugar da chave secreta: as rotas seguintes leriam o banco como esse usuário.

## Web

1. Login com senha → sessão A → o Portal consulta `GET /auth/dois-fatores`.
2. Se estiver `pendente`, mostra a tela do código na moldura da entrada, sem mudar a URL. O shell não monta.
3. A tela envia o código ao abrir. Se já houve envio há menos de 60 s (recarga), só mostra a contagem.
4. "Verificar e entrar": `POST /verificar` dentro de "Preparando seus resultados"; em seguida, as boas-vindas.
5. "Voltar": `signOut` e volta ao login com a senha vazia.
6. O 403 `DOIS_FATORES_PENDENTE` de qualquer chamada leva à tela do código, e não à caixa de sessão expirada.
7. Configurações: `DS.Switch` na linha "Verificação em duas etapas"; ligar e desligar abrem a caixa "Confirme com o código".
8. Excluir a conta com a verificação ligada: a caixa de exclusão pede o código.
9. Nova senha pelo link de recuperação: com a verificação ligada, depois de salvar, `signOut` e volta ao login normal (senha e código).
10. Trocar a senha (PV2-22) confere a senha atual num cliente à parte, e por isso não troca a sessão já verificada.

## Riscos

- **O e-mail é o fator e também é o caminho de recuperação.** Quem controla o e-mail pode pedir "Esqueci minha senha", criar uma senha nova e passar pelo código. A verificação protege contra senha vazada ou repetida, não contra e-mail invadido. Isso é o limite de um segundo fator por e-mail; um TOTP resolveria.
- **A entrega depende do SMTP.** O SMTP padrão do Supabase tem limite baixo de envios; sem SMTP próprio, os códigos podem não chegar.
- **`amr` e `session_id` vêm do JWT.** São lidos só depois de `auth.getUser(token)` aceitar o token.
- **Recarga na tela do código:** um novo `POST /enviar` dentro de 60 s recebe 429. Por isso a tela consulta `enviadoEm` antes de enviar.

## Configuração no painel do Supabase (para o time)

1. Authentication → Email Templates → **Magic Link**:
   - corpo em pt-BR com `{{ .Token }}` (o código de 6 dígitos);
   - sem o link, ou com o link como alternativa: o portal só usa o código.
2. Authentication → Providers → Email: **Email OTP Expiration = 600** (10 minutos) e **Email OTP Length = 6**.
3. Authentication → SMTP Settings: SMTP próprio. Ajuste também o **Rate limit for sending emails**.
4. Authentication → Providers → Email: ligar **Secure email change** e **Secure password change**. Sem elas, a sessão aberta só pela senha (ainda sem o código) consegue trocar a senha ou o e-mail direto no Auth, sem passar pela API.
5. Rodar a migration `20261116120000_pv2_26_dois_fatores_email.sql`.

## Ajustes depois da revisão

- **Senha recente:** o código de entrada só é enviado e conferido até 30 minutos depois da senha (o `timestamp` de `password` no `amr`).
- **Limite de tentativas:** a tentativa é reservada com um update condicional (`tentativas = n`) antes de conferir. Pedidos em paralelo não passam do limite de 5.
- **Sem verificação ligada:** `finalidade: 'login'` recusa o envio.
- **"Voltar" da tela do código:** encerra só esta sessão (`scope: 'local'`). O "Sair" do portal continua encerrando todas, como antes.

## Ajustes da segunda revisão

1. **Sem beco sem saída.** Uma sessão pendente que não consegue fazer a etapa (senha com mais de 30 min, link de recuperação) recebe `ENTRE_DE_NOVO`, e o GET devolve `entrarDeNovo`. O web encerra só essa sessão e volta ao login com um aviso. Ligar a verificação numa sessão sem senha também recusa com `ENTRE_DE_NOVO`, antes de gastar o código.
2. **`usada_em`.** A coluna nova é renovada no máximo uma vez por dia. O expurgo conta a partir dela e roda sem segurar a resposta do envio.
3. **Gravações conferidas.** Toda gravação é conferida; se falhar, a API responde 500. Consumir o código e marcar a sessão como verificada viraram uma gravação só.
4. **Limite por conta.** A tabela `bloqueios_dois_fatores` guarda os códigos errados da conta: com 10 erros na mesma hora, a conta não envia nem confere código, mesmo trocando de sessão.
5. **Campo do código.** Cada dígito fica na sua posição, e o apagar funciona também no teclado do Android.
6. **Contagem.** Começa em "1:00".
7. **Regra única.** A regra de "sessão liberada" fica só em `situacaoDaSessao`.

## Pendências conhecidas

- **Transição repetida no login com a verificação ligada:** "Preparando seus resultados" aparece também na etapa da senha. O login não sabe antes se haverá código.
- **Recarga na tela do código:** o portal aparece por um instante, até a API responder. A API recusa os dados nesse meio-tempo.
- **Admin:** as rotas `/admin/*` (consulta por CPF) não passam por esta verificação.

