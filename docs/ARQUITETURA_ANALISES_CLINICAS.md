# Arquitetura e Requisitos — Módulo Análises Clínicas

> Plano de implementação integrado entre **LAB-HUB** e **FlowLab**
> Criado em: Junho/2026 · Baseado em: [FLUXO.md](./FLUXO.md) e [ANALISES_CLINICAS.md](./ANALISES_CLINICAS.md)

---

## 1. Divisão de Responsabilidades

A divisão é clara e imutável:

| Sistema | Papel | Usuário |
|---------|-------|---------|
| **LAB-HUB** | Plataforma do **paciente** — agendamento de coleta e acompanhamento de resultados | Paciente |
| **FlowLab** | Módulo **Análises Clínicas** — todo o fluxo operacional interno do laboratório | Operadores, Analistas, Gestores |

> **Regra**: nenhuma tela operacional de laboratório vive no LAB-HUB.
> O LAB-HUB é um portal do paciente. O FlowLab executa o laboratório.

---

## 2. Fluxo Correto por Sistema

### LAB-HUB — Fluxo do Paciente

```
Paciente
  1. Criar conta / Login (opcional)
  2. Solicitar agendamento
  3. Escolher local/posto e data/hora
  4. Confirmar agendamento
        │
        └──► POST /api/v1/agendamentos  ──► FlowLab recebe via API REST

  5. Relatório de agendamentos / coletas [view]
  6. Visualizar resultados / baixar declaração
        │
        └──◄ GET /api/v1/resultados/:id  ◄── FlowLab disponibiliza via API REST
```

### FlowLab — Módulo Análises Clínicas (Fluxo Operacional)

```
Operação interna
  1. Receber agendamento via API REST (origem: LAB-HUB)
  2. Registrar agendamento e mapear por local/posto
  3. Check-in no posto / Conferir pedido e guia
  4. Coleta realizada com sucesso?
     ├─ NÃO → Registrar motivo de falha
     │         ├─ Reagendar ou encerrar
     │         ├─ Notificar paciente (recoleta)
     │         └─ Abrir recoleta → Relatório de recoletas
     └─ SIM → Registrar coleta + insumos usados/desperdiçados
               ├─ Receber insumos no subdepartamento (assinatura)
               └─ Precisa de recoleta?
                  ├─ SIM → Abrir recoleta → Notificar paciente
                  └─ NÃO → Encaminhar amostras → Acompanhar prazos
                             └─ Cultura necessária?
                                ├─ SIM → Acompanhar etapas e prazos
                                └─ NÃO → Temperatura/equipamento OK?
                                          ├─ FORA → Gerar alerta, ajustar
                                          └─ OK   → Liberar resultados
                                                     ├─ Emitir declaração ao paciente
                                                     ├─ Disponibilizar via API REST ──► LAB-HUB
                                                     └─ Atualizar dashboard gerencial

Estoque Departamental (dentro do FlowLab)
  1. Receber insumos no subdepartamento + assinatura no recebimento
  2. Produto existe no estoque principal?
     ├─ SIM → Controlar vencimentos, quantitativos e estoque mínimo
     └─ NÃO → Gerar alerta: estoque mínimo / vencimento
  3. Alertas alimentam o dashboard gerencial
```

---

## 3. Diagrama de Arquitetura da Integração

```
┌─────────────────────────────────────────────────────┐
│                     LAB-HUB                         │
│                                                     │
│  ┌─────────────────┐    ┌───────────────────────┐  │
│  │  apps/web       │    │  apps/mobile          │  │
│  │  Portal do      │    │  Portal do paciente   │  │
│  │  Paciente       │    │  (mobile)             │  │
│  └────────┬────────┘    └──────────┬────────────┘  │
│           └──────────┬─────────────┘               │
│                      │                             │
│           ┌──────────▼──────────┐                  │
│           │    apps/api         │                  │
│           │    Fastify :3333    │                  │
│           │  • POST /agendamentos  (recebe paciente)│
│           │  • GET  /resultados    (serve paciente) │
│           └──────────┬──────────┘                  │
│                      │                             │
│           ┌──────────▼──────────┐                  │
│           │  Supabase LAB-HUB   │                  │
│           │  agendamentos       │                  │
│           │  pacientes          │                  │
│           │  resultados (view)  │                  │
│           └─────────────────────┘                  │
└─────────────────────┬───────────────────────────────┘
                      │
          ① POST agendamento (paciente confirmou)
          ② POST resultado   (FlowLab liberou)
                      │
┌─────────────────────▼───────────────────────────────┐
│                    FLOWLAB                          │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │        Módulo: Análises Clínicas             │  │
│  │  • Recepção de agendamentos                  │  │
│  │  • Painel de coletas / check-in              │  │
│  │  • Gestão de recoletas                       │  │
│  │  • Fila de análises + prazos                 │  │
│  │  • Acompanhamento de culturas                │  │
│  │  • Monitor de temperatura/equipamentos       │  │
│  │  • Liberação de resultados + declaração      │  │
│  │  • Dashboard gerencial (KPIs)                │  │
│  └───────────────────┬──────────────────────────┘  │
│                      │                             │
│  ┌───────────────────▼──────────────────────────┐  │
│  │        Módulo: Estoque Departamental         │  │
│  │  (extensão do módulo de Inventário existente)│  │
│  │  • Subdepartamento de insumos clínicos       │  │
│  │  • Assinatura no recebimento                 │  │
│  │  • Estoque mínimo + vencimentos              │  │
│  │  • Alertas → dashboard gerencial             │  │
│  └───────────────────┬──────────────────────────┘  │
│                      │                             │
│           ┌──────────▼──────────┐                  │
│           │  Supabase FlowLab   │                  │
│           │  (PostgreSQL + RLS) │                  │
│           └──────────┬──────────┘                  │
│                      │                             │
│           ┌──────────▼──────────┐                  │
│           │  WA-HA (WhatsApp)   │                  │
│           │  Notif. paciente:   │                  │
│           │  • recoleta         │                  │
│           │  • resultado dispon.│                  │
│           └─────────────────────┘                  │
└─────────────────────────────────────────────────────┘
```

**① Fluxo de Agendamento** (LAB-HUB → FlowLab):
```
Paciente confirma no LAB-HUB
  └─► LAB-HUB apps/api  POST → FlowLab Edge Function
        └─► FlowLab registra e mapeia por posto
```

**② Fluxo de Resultado** (FlowLab → LAB-HUB):
```
Operador libera resultado no FlowLab
  └─► FlowLab chama POST → LAB-HUB apps/api /webhooks/resultados
        └─► Paciente visualiza no portal
```

---

## 4. O que Implementar — LAB-HUB

### 4.1 `apps/web` e `apps/mobile` — Telas do Paciente

As páginas já existem. O trabalho é conectá-las à API real:

| Página existente | Ajuste necessário |
|-----------------|-------------------|
| `SchedulePage` | Conectar ao `POST /api/v1/agendamentos` real — listar postos, datas disponíveis |
| `HomePage` | Exibir resumo real de agendamentos e último resultado |
| `ResultsPage` | Buscar resultados via `GET /api/v1/pacientes/:id/resultados` |
| `ExamDetailPage` | Detalhe real do exame com status de liberação |
| `LaudoPage` | Exibir/baixar declaração PDF do Supabase Storage |

### 4.2 `apps/api` (Fastify) — Endpoints do Portal do Paciente

O `apps/api` do LAB-HUB é uma **camada fina** — recebe do paciente e repassa ao FlowLab, ou recebe do FlowLab e armazena para o paciente consultar:

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/v1/agendamentos` | Paciente cria agendamento → repassa ao FlowLab |
| `GET` | `/api/v1/agendamentos/:pacienteId` | Paciente lista seus agendamentos |
| `GET` | `/api/v1/resultados/:pacienteId` | Paciente lista seus resultados |
| `GET` | `/api/v1/resultados/:id/declaracao` | Baixar declaração PDF |
| `POST` | `/api/v1/webhooks/resultados` | FlowLab entrega resultado liberado |

### 4.3 Banco de Dados (Supabase LAB-HUB) — Tabelas Necessárias

```
┌──────────────────┐     ┌────────────────────┐
│    pacientes     │     │   agendamentos     │
├──────────────────┤     ├────────────────────┤
│ id (PK)          │────▶│ id (PK)            │
│ nome             │     │ paciente_id        │
│ email            │     │ local_posto        │
│ telefone         │     │ data_hora          │
│ auth_user_id     │     │ status             │
└──────────────────┘     │ flowlab_id (ref)   │
                          │ criado_em          │
                          └────────────────────┘

┌──────────────────────┐
│  resultados          │
├──────────────────────┤
│ id (PK)              │
│ paciente_id          │
│ agendamento_id       │
│ laudo_url            │
│ declaracao_url       │
│ liberado_em          │
│ flowlab_analise_id   │  ← referência ao ID no FlowLab
└──────────────────────┘
```

---

## 5. O que Implementar — FlowLab

### 5.1 Novo Módulo: Análises Clínicas (`src/modules/analises-clinicas/`)

Seguindo a mesma estrutura modular dos módulos `quotations` e `messaging` já existentes:

```
src/modules/analises-clinicas/
├── index.ts
├── types/
│   └── index.ts               # Agendamento, Coleta, Análise, Cultura, Resultado...
├── hooks/
│   ├── useAgendamentos.ts
│   ├── useColetas.ts
│   ├── useAnalises.ts
│   └── useEstoqueDepartamental.ts
├── services/
│   ├── AgendamentoService.ts   # Recebe agendamento do LAB-HUB via Edge Function
│   ├── ColetaService.ts        # Registra coleta + baixa de insumos
│   ├── ResultadoService.ts     # Libera resultado + envia ao LAB-HUB
│   └── NotificacaoService.ts   # Usa MessagingService existente (WhatsApp)
└── components/
    ├── AgendamentosPage.tsx             # Lista agendamentos recebidos, mapeados por posto
    ├── PainelColetasPage.tsx            # Check-in + registro de coleta
    ├── RecoletasPage.tsx                # Gestão de recoletas abertas
    ├── AnalisesEmAndamentoPage.tsx      # Fila de análises + prazos de liberação
    ├── CulturasPage.tsx                 # Acompanhamento de etapas de cultura
    ├── MonitorTemperaturaPage.tsx       # Leituras de equipamentos + alertas
    ├── LiberacaoResultadosPage.tsx      # Revisão e liberação de laudos
    ├── EstoqueDepartamentalPage.tsx     # Insumos do subdepartamento
    └── DashboardAnalisesPage.tsx        # KPIs: SLAs, recoletas, culturas, desperdício
```

### 5.2 Novos Endpoints no FlowLab (Supabase Edge Functions)

| Edge Function | Direção | Descrição |
|--------------|---------|-----------|
| `receive-agendamento` | LAB-HUB → FlowLab | Recebe agendamento confirmado pelo paciente |
| `deliver-resultado` | FlowLab → LAB-HUB | Envia resultado liberado ao portal do paciente |
| `send-notification` | FlowLab → WA-HA | Notifica paciente (recoleta / resultado disponível) |

### 5.3 Estoque Departamental — Extensão do Módulo de Inventário Existente

O módulo de inventário já existe no FlowLab. Extensões necessárias:

| Item | Tipo | Descrição |
|------|------|-----------|
| Subdepartamento `ANALISES_CLINICAS` | Config | Adicionar ao enum `Department` |
| Categoria `insumos_clinicos` | Config | Nova categoria em `products` |
| Assinatura no recebimento | Feature | Campo `receiver_signature` já existe em `Request` — adaptar para entrada de insumos |
| Alerta de estoque mínimo | Feature | `ExpirationMonitor` existente — adicionar filtro por `insumos_clinicos` |
| Rastreabilidade por coleta | Feature | `stock_movements.reason` referenciando o ID da coleta |

### 5.4 Novas Rotas no SPA (React Router)

| Rota | Componente | Permissão |
|------|------------|-----------|
| `/analises-clinicas` | DashboardAnalisesPage | `canViewAnalisesClinicas` |
| `/analises-clinicas/agendamentos` | AgendamentosPage | `canViewAnalisesClinicas` |
| `/analises-clinicas/coletas` | PainelColetasPage | `canManageColetas` |
| `/analises-clinicas/recoletas` | RecoletasPage | `canManageColetas` |
| `/analises-clinicas/analises` | AnalisesEmAndamentoPage | `canViewAnalisesClinicas` |
| `/analises-clinicas/culturas` | CulturasPage | `canViewAnalisesClinicas` |
| `/analises-clinicas/temperatura` | MonitorTemperaturaPage | `canViewAnalisesClinicas` |
| `/analises-clinicas/resultados` | LiberacaoResultadosPage | `canLiberarResultados` |
| `/analises-clinicas/estoque` | EstoqueDepartamentalPage | `canManageProducts` |

### 5.5 Permissões — Adições à Matriz Existente

| Permissão | Admin | Operator | Requester | Analista (novo role) |
|-----------|:-----:|:--------:|:---------:|:--------------------:|
| `canViewAnalisesClinicas` | ✅ | ✅ | ❌ | ✅ |
| `canManageColetas` | ✅ | ✅ | ❌ | ✅ |
| `canLiberarResultados` | ✅ | ❌ | ❌ | ✅ |
| `canViewDashboardAnalisesClinicas` | ✅ | ✅ | ❌ | ✅ |

### 5.6 Templates WhatsApp a Criar

| Código | Gatilho | Variáveis |
|--------|---------|-----------|
| `ac_agendamento_confirmado` | Agendamento recebido pelo lab | `{{nome}}`, `{{data}}`, `{{posto}}` |
| `ac_recoleta` | Recoleta aberta | `{{nome}}`, `{{data}}`, `{{posto}}` |
| `ac_resultado_disponivel` | Resultado liberado | `{{nome}}`, `{{link}}` |

---

## 6. Modelo de Dados — Novas Tabelas (Supabase FlowLab)

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ ac_agendamentos  │     │   ac_coletas     │     │  ac_recoletas    │
├──────────────────┤     ├──────────────────┤     ├──────────────────┤
│ id (PK)          │────▶│ id (PK)          │────▶│ id (PK)          │
│ labhub_id        │     │ agendamento_id   │     │ coleta_id        │
│ paciente_nome    │     │ operador_id      │     │ motivo           │
│ paciente_tel     │     │ status           │     │ status           │
│ local_posto      │     │ falha_motivo     │     │ notificado_em    │
│ data_hora        │     │ realizada_em     │     │ criado_em        │
│ status           │     │ criado_em        │     └──────────────────┘
│ recebido_em      │     └────────┬─────────┘
└──────────────────┘              │
              ┌───────────────────┼──────────────────┐
              ▼                   ▼                  ▼
┌──────────────────┐  ┌─────────────────┐  ┌──────────────────────┐
│ ac_coleta_insumos│  │  ac_analises    │  │  ac_temperaturas     │
├──────────────────┤  ├─────────────────┤  ├──────────────────────┤
│ id (PK)          │  │ id (PK)         │  │ id (PK)              │
│ coleta_id        │  │ coleta_id       │  │ equipamento_id       │
│ product_id  ─────┼─▶│ status          │  │ valor_celsius        │
│ (products FK)    │  │ cultura_nec.    │  │ status (ok/alerta)   │
│ qtd_usada        │  │ prazo_liberacao │  │ alerta_gerado        │
│ desperdicado     │  │ liberado_em     │  │ registrado_em        │
└──────────────────┘  └────────┬────────┘  └──────────────────────┘
                                │
                ┌───────────────┴──────────────┐
                ▼                              ▼
┌──────────────────────┐          ┌──────────────────────┐
│    ac_culturas       │          │    ac_resultados     │
├──────────────────────┤          ├──────────────────────┤
│ id (PK)              │          │ id (PK)              │
│ analise_id           │          │ analise_id           │
│ etapa_atual          │          │ laudo_url            │
│ total_etapas         │          │ declaracao_url       │
│ prazo_horas          │          │ liberado_por         │
│ concluido            │          │ liberado_em          │
│ atualizado_em        │          │ entregue_ao_labhub   │
└──────────────────────┘          └──────────────────────┘

┌──────────────────────┐
│  ac_equipamentos     │
├──────────────────────┤
│ id (PK)              │
│ nome                 │
│ tipo                 │
│ local_posto          │
│ temp_min_celsius     │
│ temp_max_celsius     │
│ ativo                │
└──────────────────────┘
```

> **Prefixo `ac_`** em todas as tabelas para isolar o módulo dentro do Supabase do FlowLab.
> `ac_coleta_insumos.product_id` referencia a tabela `products` existente — a baixa de estoque é feita diretamente em `stock_movements`.

---

## 7. Contratos de API REST

### 7.1 LAB-HUB → FlowLab (agendamento confirmado)

```http
POST https://flowlab.supabase.co/functions/v1/receive-agendamento
Authorization: Bearer <FLOWLAB_API_KEY>
Content-Type: application/json

{
  "labhubId": "uuid",
  "pacienteNome": "João Silva",
  "pacienteTelefone": "+5511999999999",
  "localPosto": "Unidade Centro",
  "dataHora": "2026-06-10T09:00:00Z"
}
```

### 7.2 FlowLab → LAB-HUB (resultado liberado)

```http
POST https://labhub-api/api/v1/webhooks/resultados
X-Webhook-Signature: <HMAC-SHA256>
Content-Type: application/json

{
  "agendamentoLabhubId": "uuid",
  "laudoUrl": "https://storage.supabase.co/...",
  "declaracaoUrl": "https://storage.supabase.co/...",
  "liberadoEm": "2026-06-11T14:30:00Z"
}
```

---

## 8. Requisitos Funcionais

### LAB-HUB (portal do paciente)

| # | Requisito |
|---|-----------|
| RF-L1 | Paciente cria conta ou faz login (opcional) |
| RF-L2 | Paciente solicita agendamento escolhendo posto e data/hora disponíveis |
| RF-L3 | Agendamento confirmado é enviado ao FlowLab via API REST |
| RF-L4 | Paciente visualiza relatório de seus agendamentos e status |
| RF-L5 | Paciente visualiza resultados disponibilizados pelo FlowLab |
| RF-L6 | Paciente baixa declaração padrão quando resultado liberado |

### FlowLab — Módulo Análises Clínicas

| # | Requisito |
|---|-----------|
| RF-F1 | Receber e registrar agendamentos vindos do LAB-HUB, mapeados por local/posto |
| RF-F2 | Operador realiza check-in do paciente e confere pedido/guia |
| RF-F3 | Registrar coleta com sucesso ou falha (motivo obrigatório em falha) |
| RF-F4 | Registrar insumos utilizados e desperdiçados por coleta |
| RF-F5 | Baixa automática em `stock_movements` ao registrar insumos da coleta |
| RF-F6 | Abrir recoleta em caso de falha ou resultado inválido |
| RF-F7 | Notificar paciente via WhatsApp ao abrir recoleta e ao liberar resultado |
| RF-F8 | Encaminhar amostras para análise com prazo de liberação |
| RF-F9 | Registrar e acompanhar etapas de cultura quando necessário |
| RF-F10 | Registrar leituras de temperatura de equipamentos |
| RF-F11 | Gerar alerta quando temperatura/equipamento fora do padrão |
| RF-F12 | Liberar resultado com upload de laudo PDF e geração de declaração |
| RF-F13 | Enviar resultado ao LAB-HUB via API REST ao liberar |
| RF-F14 | Receber insumos no subdepartamento com assinatura no recebimento |
| RF-F15 | Controlar vencimentos, quantitativos e estoque mínimo de insumos clínicos |
| RF-F16 | Alertas de estoque mínimo/vencimento alimentam o dashboard gerencial |
| RF-F17 | Dashboard com KPIs: SLAs, recoletas, culturas, desperdício, produtividade por operador/posto |

---

## 9. Requisitos Técnicos

### LAB-HUB `apps/api`
- [ ] Fastify com `@fastify/sensible` + `zod` para validação de schema
- [ ] Autenticação JWT (tokens do Supabase LAB-HUB)
- [ ] Validação de assinatura HMAC-SHA256 nos webhooks recebidos do FlowLab
- [ ] Rate limiting no endpoint `POST /agendamentos`

### FlowLab
- [ ] Edge Functions em Deno/TypeScript para os contratos REST externos
- [ ] RLS habilitado em todas as tabelas `ac_*`
- [ ] Triggers para `updated_at` automático nas novas tabelas
- [ ] Índices em `ac_agendamentos(data_hora, local_posto)` e `ac_coletas(agendamento_id)`
- [ ] Migration separada para cada tabela nova (prefixo `ac_`)

### Segurança
- [ ] `FLOWLAB_API_KEY` e `LABHUB_WEBHOOK_SECRET` nunca expostos no frontend
- [ ] Dados pessoais do paciente (nome, telefone) não logados
- [ ] Comunicação entre sistemas apenas server-to-server

---

## 10. Variáveis de Ambiente

### LAB-HUB (`apps/api/.env`)
```env
# Supabase LAB-HUB
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# FlowLab Integration
FLOWLAB_EDGE_FUNCTION_URL=https://yyy.supabase.co/functions/v1
FLOWLAB_API_KEY=<chave-de-acesso>

# Segurança webhooks
FLOWLAB_WEBHOOK_SECRET=<hmac-secret-compartilhado>

PORT=3333
HOST=0.0.0.0
```

### FlowLab (`.env`)
```env
# LAB-HUB Integration
LABHUB_API_URL=http://localhost:3333
LABHUB_API_KEY=<chave-de-acesso>
LABHUB_WEBHOOK_SECRET=<hmac-secret-compartilhado>
```

---

## 11. Fases de Implementação

### Fase 1 — Fundação de Dados (FlowLab)
- [ ] Migrations das tabelas `ac_*` no Supabase FlowLab
- [ ] Adicionar `ANALISES_CLINICAS` ao enum `Department`
- [ ] Adicionar categoria `insumos_clinicos` aos produtos
- [ ] Adicionar permissão `canViewAnalisesClinicas` e role `analista`

### Fase 2 — Integração de Agendamento
- [ ] Edge Function `receive-agendamento` no FlowLab
- [ ] Endpoint `POST /api/v1/agendamentos` no LAB-HUB (`apps/api`)
- [ ] Conectar `SchedulePage` do LAB-HUB ao endpoint real
- [ ] Tela `AgendamentosPage` no FlowLab (lista por posto/data)

### Fase 3 — Fluxo de Coleta (FlowLab)
- [ ] `PainelColetasPage` — check-in + registro de coleta
- [ ] Registro de insumos + baixa automática em `stock_movements`
- [ ] `RecoletasPage` — gestão de recoletas abertas
- [ ] Notificação WhatsApp `ac_recoleta` via `MessagingService` existente

### Fase 4 — Análise, Cultura e Temperatura (FlowLab)
- [ ] `AnalisesEmAndamentoPage` — fila + prazos
- [ ] `CulturasPage` — etapas e prazos de cultura
- [ ] `MonitorTemperaturaPage` — leituras + alertas de equipamentos

### Fase 5 — Resultados e Integração de Retorno
- [ ] `LiberacaoResultadosPage` — upload de laudo + geração de declaração
- [ ] Edge Function `deliver-resultado` no FlowLab
- [ ] Endpoint `POST /api/v1/webhooks/resultados` no LAB-HUB
- [ ] Conectar `ResultsPage` e `LaudoPage` do LAB-HUB ao endpoint real
- [ ] Notificação WhatsApp `ac_resultado_disponivel`

### Fase 6 — Estoque Departamental e Dashboard (FlowLab)
- [ ] `EstoqueDepartamentalPage` — recebimento com assinatura, controle de insumos
- [ ] Alertas de estoque mínimo/vencimento para insumos clínicos
- [ ] `DashboardAnalisesPage` — KPIs completos
- [ ] Widget de análises clínicas no Dashboard principal do FlowLab

---

*Documento gerado com base em [FLUXO.md](./FLUXO.md) e [ANALISES_CLINICAS.md](./ANALISES_CLINICAS.md)*
