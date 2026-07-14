-- Migration: Convênio do paciente (operadora + plano)
-- Adiciona duas colunas opcionais em `pacientes` para exibir o convênio real
-- no ProfilePage. Ambas nullable: paciente sem convênio fica com NULL e a UI
-- mostra "Não informado". Ref.: docs/melhorias.md (#13, campo Convênio).

alter table pacientes
  add column if not exists convenio_operadora text,
  add column if not exists convenio_plano     text;
