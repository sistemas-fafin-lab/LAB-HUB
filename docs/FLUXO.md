PROMPT:
Sistema de analises clinicas:

Ideia principal:
Ter um sistema que centraliza o processo de análises clínicas desde o agendamento de coleta pelo paciente e mapeamento desses agendamentos por local de origem, até a finalização do processo, acompanhamento de insumos via estoque interno (vencimentos, quantitativos e estoque mínimo), dashboard gerencial com indicativos, controle de recoleta, acompanhamento de prazos de liberação de coletas realizadas, acompanhamento de culturas, equipamentos e temperaturas e acompanhamento assíduo do processo de coleta (insumos utilizados, desperdiçados e visão histórica por pacientes)

Para isso, construiremos um sistema CRUD em React com arquitetura  compartilhada entre dois projetos: Lab Hub e Flow-lab.

A idéia é que no labhub só tenha a parte do fluxo do paciente, onde ele pode realizar o agendamento e o acompanhamento deste.

A partir daí, todo o fluxo interno de coleta e análises clínicas será executado dentro do FlowLab num módulo separado para Análises clínicas, componentizado e conectado com o sistema de agendamentos do lab hub via API Rest.

Anotações da reunião com detalhamento simplificado de requisitos funcionais:

Controle de estoque departamental:
-Ter um estoque de subdepartamento
-Assinatura ao receber pelo posto de coleta
-Saber se o produto existe no estoque principal

Agenda de coletas: Solução Sistema de Agendamento e Coletas
Relatório: Solução Sistema de Agendamento e Coletas
Controle de Insumos: Solução Estoque departamental
Estoque mínimo: Solução Estoque departamental

Controle de temperatura: Sistema de Agendamento e Coletas
Controle de Cultura: Sistema de Agendamentos e Coletas

Entrega de declaração:
Emitir um modelo de declaração padrão para o paciente:

Relatório de Re-coletas: Sistema de Agendamento e Coletas

Dashboard, trazendo indicativos de análises clínicas, não só de estoque.

FLUXO PASSO A PASSO:

Fluxo de Agendamento, Coleta e Gestão de Insumos
(Laboratório)
SOP (por sistema) ? Fluxo Operacional de Agendamento, Coleta, Análise e
Gestão de Insumos
Lab Hub (Paciente)
1. Início (Paciente).
2. Criar conta / Login (opcional) (Paciente).
3. Solicitar agendamento (Paciente).
4. Escolher local/posto e data/hora (Paciente).
5. Confirmar agendamento (Paciente).
6. Relatório de agendamentos / coletas (view) (Paciente).
7. Visualizar resultados / baixar declaração (Paciente).
FlowLab (Operação interna / Módulo Análises Clínicas)
1. Registrar agendamento e mapear por local (Operação interna).
2. Enviar agendamento via API REST ao posto (Integração ? origem FlowLab;
destino Posto/recebedor).
3. Receber agendamento via API REST (Integração ? origem FlowLab;
destino Posto/recebedor).
4. Check-in no posto / Conferir pedido e guia (Operação interna no posto).
5. Coleta realizada com sucesso?
5.1. Se Não: Registrar motivo de falha.
5.1.1. Reagendar ou encerrar.
5.1.2. Notificar paciente (recoleta).
5.1.3. Abrir recoleta.
5.2. Se Sim: Emitir declaração padrão ao paciente.
6. Registrar coleta; Registrar insumos usados/desperdiçados.
7. Precisa de recoleta?
7.1. Se Sim: Abrir recoleta; Notificar paciente (recoleta); Registrar no
relatório de recoletas.
7.2. Se Não: Encaminhar amostras para análise; Acompanhar prazos de
liberação.
8. Cultura necessária?
8.1. Se Sim: Acompanhar cultura: etapas e prazos.
8.2. Se Não: seguir.
9. Temperatura / equipamento fora do padrão?
9.1. Se Fora do padrão: Gerar alerta e ajustar processo.
9.2. Se OK: Liberar resultados.
10. Disponibilizar resultados via API REST (Integração ? origem FlowLab;
destino Lab Hub).
11. Liberar resultados (Operação interna).
12. Atualizar dashboard gerencial (indicativos, SLAs, desperdício,
produtividade, culturas, recoletas).
Estoque Departamental (FlowLab)
1. Receber insumos no subdepartamento; Assinatura no recebimento.
2. Produto existe no estoque principal?
2.1. Se Sim: Controlar vencimentos, quantitativos e estoque mínimo.
2.2. Se Não: Gerar alerta: estoque mínimo / vencimento.
3. Gerar alerta: estoque mínimo / vencimento (Integração ? também alimenta
dashboard gerencial do FlowLab).
4. Atualizar dashboard gerencial (Integração ? duplicado com FlowLab para
rastreabilidade).
Observações de integração (duplicadas conforme combinado)
- API REST (FlowLab ? Posto/recebedor): envio e recebimento de
agendamento.
- API REST (FlowLab ? Lab Hub): disponibilização de resultados.
- Dashboard gerencial: atualizado por FlowLab e também por
alertas/relatórios de estoque/recoletas.
