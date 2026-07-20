-- Migration: paciente-fantasma (pré-cadastro pela recepção do FlowLab)
-- A recepção do FlowLab pode criar um agendamento para alguém que ainda não tem
-- conta no app. Nesse caso gravamos uma linha "fantasma" em `pacientes` só com
-- nome/cpf/data_nascimento (sem auth_user_id), que o paciente reivindica depois
-- ao se cadastrar com o MESMO CPF (o /cadastro anexa o auth à linha existente).
--
-- Para isso, `email` e `sexo` deixam de ser obrigatórios: o fantasma nasce sem
-- eles e o /cadastro os preenche no momento do claim. `auth_user_id` já é
-- nullable desde o init. `cpf` continua NOT NULL + UNIQUE (é a chave do claim).
--
-- Idempotente: DROP NOT NULL é no-op se a coluna já for nullable.

alter table pacientes alter column email drop not null;
alter table pacientes alter column sexo  drop not null;
