-- Migration: trilha de auditoria de ACESSO a dado de saúde
-- Ref.: docs/AUDITORIA_SEGURANCA.md § S-08 (LGPD arts. 37 e 38)
--
-- O QUE FALTAVA
-- O projeto já tinha duas trilhas append-only, mas as duas registram ESCRITA:
-- `correcoes_identidade` (20260730130000) guarda quem autorizou trocar um CPF, e
-- `exclusoes_conta` (20260731170000) guarda quem pediu exclusão. Nenhuma delas
-- responde a pergunta que aparece quando um segredo vaza: *quais registros de
-- quais pacientes foram LIDOS, por quem e quando?* Sem isso a notificação à
-- ANPD é obrigada a dizer "não sabemos", e "não sabemos" na prática significa
-- notificar todo mundo.
--
-- O QUE ENTRA AQUI
-- Uma linha por leitura de dado sensível que de fato foi ENTREGUE ao cliente.
-- Só metadado: quem, o quê, qual recurso, de quem era o dado, de qual IP e
-- quando. Nunca o conteúdo — uma trilha que copia o laudo para poder auditar o
-- laudo dobra a superfície de vazamento em vez de reduzi-la. É também por isso
-- que o termo digitado na busca da recepção NÃO é gravado: ele carrega nome ou
-- CPF, e a trilha viraria mais um lugar com PII em claro.
--
-- SEM FOREIGN KEY, DE PROPÓSITO
-- Mesma lição de 20260803120000, e ela custou caro: `exclusoes_conta` nasceu com
-- `on delete cascade` para `pacientes` e a trilha evaporou junto com 6 pacientes
-- apagados — o caso em que ela MAIS importava era exatamente o caso em que ela
-- sumia. Uma trilha não registra uma relação viva; registra um fato histórico,
-- que continua verdadeiro depois que o outro lado deixa de existir. `ator_id` e
-- `titular_id` ficam como valores opacos.
--
-- Isso também é o que reconcilia a trilha com o direito de exclusão do titular
-- (LGPD art. 18 VI): depois que a conta é excluída, `pacientes` está anonimizada
-- e o UUID que sobra aqui não identifica pessoa nenhuma — identifica um registro
-- que não existe mais. O `ip` é o campo que ainda é dado pessoal, e é o que
-- justifica a política de retenção discutida no fim deste arquivo.

create table if not exists public.auditoria_acesso (
  id           uuid primary key default gen_random_uuid(),
  ocorrido_em  timestamptz not null default now(),

  -- Quem pediu. Dois canais e só dois: o portal (JWT de paciente) e o FlowLab
  -- (API key). O check existe para que um canal novo — uma futura área
  -- administrativa, por exemplo — não entre na trilha como string solta sem
  -- alguém decidir o que ele significa.
  ator_tipo    text not null check (ator_tipo in ('paciente', 'flowlab')),
  ator_id      uuid,           -- pacientes.id quando ator_tipo='paciente'; null p/ o FlowLab,
                               -- que é um sistema e não uma pessoa (ver P-06)

  -- De quem era o dado. Quase sempre igual a `ator_id` no canal do portal — o
  -- paciente lendo o próprio laudo —, e é justamente por isso que a coluna vale:
  -- a linha em que os dois DIFEREM num acesso de portal é o alarme.
  titular_id   uuid,

  acao         text not null,  -- 'laudos.listar', 'laudos.ler', 'documento.url', ...
  recurso_tipo text,           -- 'exam_result' | 'documento' | 'resultado' | 'agendamento'
  recurso_id   text,           -- id do recurso quando a leitura é de UM; null em listagem
  quantidade   integer,        -- quantos registros a resposta expôs (listagens)

  -- Endereço de origem, já resolvido pelo X-Forwarded-For do túnel (a API só é
  -- alcançada através dele; ver TRUST_PROXY_HOPS em apps/api/.env.example).
  -- `inet` e não `text`: o tipo recusa lixo na entrada e habilita consulta por
  -- faixa — "o que mais saiu deste /24 naquela madrugada?" é a pergunta de
  -- incidente. Nulo quando não dá para determinar; a API valida antes de gravar.
  ip           inet
);

comment on table public.auditoria_acesso is
  'Trilha append-only de LEITURA de dado sensível (LGPD arts. 37/38). Só metadado, '
  'nunca conteúdo. Sem foreign key de propósito: precisa sobreviver ao delete do '
  'paciente que testemunha. Ver auditoria § S-08.';

comment on column public.auditoria_acesso.titular_id is
  'Paciente dono do dado lido. Diferente de ator_id num acesso de portal = anomalia.';

comment on column public.auditoria_acesso.quantidade is
  'Registros expostos na resposta. Em listagem é o que substitui recurso_id: os ids '
  'de laudo são sorteados a cada mapeamento (ver laudos/service.ts) e gravá-los não '
  'apontaria para nada estável.';

-- =====================================================================
-- Índices — moldados nas três perguntas de incidente
-- =====================================================================

-- "O que aconteceu com o paciente X?" — a pergunta do titular exercendo o
-- art. 18, e a do jurídico montando a notificação.
create index if not exists idx_auditoria_acesso_titular
  on public.auditoria_acesso (titular_id, ocorrido_em desc);

-- "O que este ator andou lendo?" — a pergunta quando a suspeita é a conta ou a
-- chave de integração, não o paciente.
create index if not exists idx_auditoria_acesso_ator
  on public.auditoria_acesso (ator_tipo, ator_id, ocorrido_em desc);

-- "O que saiu entre 02:00 e 04:00 daquele dia?" — a varredura por janela, que é
-- por onde a investigação começa quando ainda não se sabe quem foi.
create index if not exists idx_auditoria_acesso_ocorrido
  on public.auditoria_acesso (ocorrido_em desc);

-- =====================================================================
-- Append-only DE VERDADE
-- =====================================================================

alter table public.auditoria_acesso enable row level security;
-- Sem policy, de propósito: `anon` e `authenticated` não têm grant nenhum em
-- `public` desde o S-01 (20260730120000), e a API fala pelo service_role, que
-- ignora RLS. Trilha de auditoria não é dado de portal — o paciente não lê a
-- própria trilha, e muito menos a dos outros.

-- Nem a API reescreve a história. O INSERT fica; UPDATE/DELETE/TRUNCATE saem.
-- Este é o ponto inteiro da tabela: uma trilha que o processo comprometido pode
-- editar não prova nada, porque o primeiro movimento de quem entrou é apagar a
-- linha que registra que ele entrou.
revoke update, delete, truncate on public.auditoria_acesso from service_role;

-- =====================================================================
-- RETENÇÃO — decisão em aberto, deliberadamente NÃO automatizada aqui
-- =====================================================================
-- O `ip` é dado pessoal, então guardar a trilha para sempre troca um problema de
-- auditoria por um de minimização (LGPD art. 6º III). Mas o expurgo automático
-- não entra nesta migration por um motivo específico: o DELETE está revogado
-- acima, e criar a exceção que permite apagar linha da trilha é exatamente o
-- privilégio que a tabela existe para negar. Quando a retenção for definida, o
-- caminho correto é uma rotina com papel próprio (não o service_role da API),
-- e a decisão sobre o prazo — 6 meses cobre o ciclo típico de descoberta de
-- incidente — precisa ser registrada junto. Ver o § S-08 da auditoria.
