# Plano de Implementação — LAB-HUB · Portal do Paciente

> Escopo: **apenas o LAB-HUB**. O módulo operacional de Análises Clínicas reside no FlowLab — ver o plano correspondente em `flowlab/docs/PLANO_FLOWLAB_ANALISES_CLINICAS.md`.
> Baseado em: `./ARQUITETURA_ANALISES_CLINICAS.md`, `./FLUXO.md` e `./ANALISES_CLINICAS.md`
> Criado em: Junho/2026

---

## Estado Atual do Projeto

| App | O que existe | O que falta |
|-----|-------------|-------------|
| `apps/web` | Todas as páginas criadas com **mock data** | Conectar à API real, auth |
| `apps/mobile` | Todas as telas criadas com **mock data** | Conectar à API real, auth |
| `apps/api` | Fastify com apenas `/ping` | Tudo: rotas, Supabase, auth, webhook |
| `packages/shared` | Package vazio | Tipos de domínio compartilhados |
| Supabase LAB-HUB | Sem tabelas de domínio | Criar `pacientes`, `agendamentos`, `resultados` |

---

## Papéis e Limites

O LAB-HUB é um **portal do paciente**. Nenhuma tela operacional de laboratório vive aqui.

```
Paciente → LAB-HUB (agendamento + resultados)
                └─► API REST ◄──► FlowLab (toda operação interna)
```

---

## Decisões de Design e Desvios do Contrato Original

> Estas decisões foram tomadas após verificar o código real do LAB-HUB contra os docs. Ajustam o que está em `ARQUITETURA_ANALISES_CLINICAS.md`.

| # | Decisão | Motivo |
|---|---------|--------|
| **D1** | **Resultado carrega painéis estruturados** (`paineis jsonb`), não só PDF. O contrato FlowLab→LAB-HUB (doc 7.2) é ampliado para incluir os marcadores. | A UI já existente (`WebHero.tsx`, `LaudoPage.tsx`, `ResultsPage.tsx`) renderiza painéis marcador-a-marcador (nome, valor, ref, status, trend) — **não exibe PDF**. Manter a UI pronta. `laudo_url`/`declaracao_url` ficam como PDF **opcional**. |
| **D2** | **Dependentes adiados.** Modelo `pacientes` 1:1 com `auth_user_id` nesta fase. | O switcher de dependentes do `Topbar.tsx:33` permanece como mock/visual até uma fase futura. Evita complexidade de RLS de responsável agora. |
| **D3** | **Postos e catálogo de exames são dados de referência do FlowLab** (o gerente os mantém lá, em runtime) — não viram enum nem tabela própria do LAB-HUB. **Decidido: proxy em tempo real.** O `apps/api` consulta a disponibilidade sob demanda; o agendamento grava `posto_flowlab_id` + `posto_nome` (snapshot). | Enum/tabela local exigiria migration/sync a cada mudança do gerente. Proxy mantém sempre atualizado e sem duplicação. Depende de uma Edge Function de consulta no FlowLab (dependência da Fase 4). |
| **D4** | **GET deriva do JWT**, sem `:pacienteId` na URL (diverge do doc 4.2). | Evita IDOR — o paciente só acessa o próprio `pacienteId` resolvido a partir do token. |

---

## Fase 1 — Banco de Dados (Supabase LAB-HUB)

**Objetivo:** criar as tabelas de domínio e configurar segurança.

### Migrations a criar

**Tipos enumerados** — criar **antes** das tabelas. Aqui entram só os conjuntos **fechados, donos do app** (mudam apenas com deploy). Postos, exames e categorias **não** são enums — são dados de referência do FlowLab (ver nota após a tabela `resultados`).
```sql
-- Sexo biológico — usado para as faixas de referência dos exames
create type sexo as enum ('M', 'F');

-- Status de liberação do resultado (ciclo de vida definido no app)
create type resultado_status as enum ('analyzing', 'ready');
```

**`pacientes`** — (D2: modelo 1:1 simples, dependentes adiados para fase futura)
```sql
create table pacientes (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid references auth.users(id) on delete cascade,
  nome            text not null,
  email           text not null,
  cpf             text not null unique check (cpf ~ '^\d{11}$'),  -- só dígitos; normalizar/validar na API
  sexo            sexo not null,                                   -- enum: M | F
  data_nascimento date not null,
  telefone        text,
  criado_em       timestamptz default now()
);
alter table pacientes enable row level security;
create policy "paciente vê só o próprio perfil"
  on pacientes for all using (auth.uid() = auth_user_id);
```
> Quando dependentes entrarem (fase futura), adicionar `responsavel_auth_user_id` + policy permitindo o responsável ler/escrever as linhas dos seus dependentes. O switcher do `Topbar.tsx` já está pronto para consumir isso.

**`agendamentos`**
```sql
create table agendamentos (
  id           uuid primary key default gen_random_uuid(),
  paciente_id  uuid not null references pacientes(id) on delete cascade,
  posto_flowlab_id uuid not null,  -- id canônico do posto no FlowLab (dono do dado)
  posto_nome   text not null,      -- snapshot do nome p/ exibição e histórico
  data_hora    timestamptz not null,
  status       text not null default 'pendente',  -- pendente | confirmado | cancelado | realizado
  flowlab_id   uuid,           -- referência ao ID no FlowLab (preenchido após sync)
  criado_em    timestamptz default now(),
  atualizado_em timestamptz default now()
);
alter table agendamentos enable row level security;
create policy "paciente vê só seus agendamentos"
  on agendamentos for all using (
    paciente_id = (select id from pacientes where auth_user_id = auth.uid())
  );
create index idx_agendamentos_paciente on agendamentos(paciente_id);
create index idx_agendamentos_data on agendamentos(data_hora, posto_flowlab_id);
```

**`resultados`** — (D1: carrega painéis estruturados; PDF é opcional)
```sql
create table resultados (
  id                  uuid primary key default gen_random_uuid(),
  paciente_id         uuid not null references pacientes(id) on delete cascade,
  agendamento_id      uuid references agendamentos(id),
  exame_nome          text not null,          -- snapshot vindo do webhook FlowLab (ex.: "Hemograma Completo")
  categoria           text,                   -- snapshot vindo do webhook FlowLab (ex.: "Sangue")
  exame_flowlab_id    uuid,                   -- (opcional) id do exame no catálogo do FlowLab
  status              resultado_status not null default 'analyzing',  -- enum: analyzing | ready
  resumo              text,                   -- observações clínicas
  paineis             jsonb not null default '[]',  -- [{nome,valor,unidade,ref,ok,trend}]
  laudo_url           text,                   -- PDF opcional (D1)
  declaracao_url      text,                   -- PDF opcional (D1)
  liberado_em         timestamptz,
  flowlab_analise_id  uuid,    -- referência ao ID no FlowLab
  criado_em           timestamptz default now()
);
alter table resultados enable row level security;
create policy "paciente vê só seus resultados"
  on resultados for all using (
    paciente_id = (select id from pacientes where auth_user_id = auth.uid())
  );
```
> A forma de `paineis` espelha o tipo `ExamPanel` já usado em `apps/web` (`WebHero.tsx:4`): `{ nome, valor, unidade, ref, ok, trend[] }`. Assim `ResultsPage`/`ExamDetailPage`/`LaudoPage` continuam funcionando sem reescrita da renderização.

> **Postos e exames são dados de referência do FlowLab, não enums.** O gerente cria/edita postos e o catálogo de exames no FlowLab, em runtime — por isso não viram enum no LAB-HUB (enum exigiria migration a cada mudança). Padrão adotado: **proxy + snapshot**. A lista de postos para a tela de agendamento vem ao vivo do FlowLab (D3 — `GET /api/v1/postos/disponibilidade` faz proxy da Edge Function `get-disponibilidade`); o agendamento grava `posto_flowlab_id` + `posto_nome` (snapshot). Os resultados chegam pelo webhook do FlowLab já com `exame_nome`/`categoria` como texto (snapshot do que foi medido — um resultado não deve "mudar de nome" retroativamente).
>
> **Reflexo nas fases seguintes (já aplicado):** Fase 3 (`packages/shared`) — `sexo`/`status` como *union types*, `Agendamento` com `postoFlowlabId` + `postoNome`, e `Paciente` com `cpf`/`sexo`/`dataNascimento`. Fase 2 — Zod de `POST /agendamentos` valida `postoFlowlabId: z.string().uuid()`; a rota `postos.ts` faz proxy de `get-disponibilidade` e a API grava o snapshot do nome ao criar o agendamento.

**Storage bucket para PDFs (laudo/declaração)**
```sql
-- Bucket privado; URLs assinadas geradas sob demanda pela API
insert into storage.buckets (id, name, public) values ('laudos', 'laudos', false);
-- Policy: leitura apenas via service role (a API gera signed URL após checar o dono)
```

**Trigger `updated_at` em `agendamentos`**
```sql
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end; $$;

create trigger trg_agendamentos_updated
  before update on agendamentos
  for each row execute procedure set_updated_at();
```

### Variáveis de ambiente (`apps/api/.env`)
```env
SUPABASE_URL=https://<projeto>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

FLOWLAB_EDGE_FUNCTION_URL=https://<flowlab-projeto>.supabase.co/functions/v1
FLOWLAB_API_KEY=<chave-de-acesso>

FLOWLAB_WEBHOOK_SECRET=<hmac-secret-compartilhado>

PORT=3333
HOST=0.0.0.0
```

> `FLOWLAB_API_KEY` e `FLOWLAB_WEBHOOK_SECRET` nunca expostos no frontend.

---

## Fase 2 — `apps/api` · Infraestrutura do Servidor

**Objetivo:** transformar o servidor Fastify de "só /ping" para uma API funcional.

### Dependências a instalar
```bash
cd apps/api
npm install @fastify/sensible @fastify/rate-limit @supabase/supabase-js zod dotenv
npm install --save-dev @types/node
```

### Estrutura de arquivos a criar

```
apps/api/src/
├── server.ts                 # já existe — atualizar com plugins e rotas
├── lib/
│   ├── supabase.ts           # cliente Supabase com service role
│   ├── hmac.ts               # validação de assinatura HMAC-SHA256
│   └── flowlab.ts            # cliente server-to-server p/ Edge Functions do FlowLab
├── middlewares/
│   └── auth.ts               # verifica JWT Supabase e injeta pacienteId
├── routes/
│   ├── agendamentos.ts       # POST e GET /api/v1/agendamentos
│   ├── postos.ts             # GET /api/v1/postos/disponibilidade (proxy FlowLab)
│   ├── resultados.ts         # GET /api/v1/resultados
│   └── webhooks.ts           # POST /api/v1/webhooks/resultados
└── schemas/
    ├── agendamento.ts        # Zod schema para validação
    └── resultado.ts
```

### Detalhamento dos arquivos

**`src/lib/supabase.ts`**
```typescript
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
export { supabase }
```

**`src/lib/hmac.ts`** — valida assinatura do webhook FlowLab
```typescript
import { createHmac, timingSafeEqual } from 'node:crypto'
export function verifyHmac(body: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}
```

**`src/lib/flowlab.ts`** — cliente das Edge Functions do FlowLab (server-to-server)
```typescript
import type { AgendamentoPayloadFlowLab } from '@lab-hub/shared'

const BASE = process.env.FLOWLAB_EDGE_FUNCTION_URL!
const API_KEY = process.env.FLOWLAB_API_KEY!

// Chamada genérica a uma Edge Function do FlowLab
async function call<T>(fn: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/${fn}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,   // FLOWLAB_API_KEY — nunca exposto no front
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    throw new Error(`FlowLab ${fn}: ${res.status} ${await res.text()}`)
  }
  return res.json() as Promise<T>
}

export interface PostoDisponivel {
  id: string          // → posto_flowlab_id
  nome: string        // → posto_nome (snapshot)
  endereco: string
  slots: string[]     // horários ISO 8601 disponíveis
}

export interface ReceiveAgendamentoResposta {
  flowlabId: string   // id do agendamento criado no FlowLab
}

export const flowlab = {
  getDisponibilidade: () =>
    call<PostoDisponivel[]>('get-disponibilidade'),

  receiveAgendamento: (payload: AgendamentoPayloadFlowLab) =>
    call<ReceiveAgendamentoResposta>('receive-agendamento', payload),
}
```
> Centraliza toda a comunicação server-to-server com o FlowLab. `postos.ts` usa `flowlab.getDisponibilidade()`; `agendamentos.ts` valida o `postoFlowlabId`/horário contra essa lista (pegando o `nome` p/ o snapshot) e chama `flowlab.receiveAgendamento()` para obter o `flowlabId`.

**`src/middlewares/auth.ts`** — decodifica JWT e carrega `pacienteId`
```typescript
// Verifica o token via Supabase Auth e busca paciente_id na tabela pacientes
// Injeta request.pacienteId para uso nas rotas
```

**`src/routes/agendamentos.ts`** — endpoints:

| Método | Rota | Ação |
|--------|------|------|
| `POST` | `/api/v1/agendamentos` | Valida `postoFlowlabId` contra a disponibilidade do FlowLab → insere em `agendamentos` (com `posto_nome` snapshot) → chama Edge Function `receive-agendamento` |
| `GET` | `/api/v1/agendamentos` | Lista agendamentos do paciente autenticado |

Schema Zod para `POST /agendamentos`:
```typescript
const criarAgendamentoSchema = z.object({
  postoFlowlabId: z.string().uuid(),   // id do posto escolhido (vem da lista proxy do FlowLab)
  dataHora: z.string().datetime(),
})
```
> O cliente envia só o `postoFlowlabId`. A rota confirma o posto/horário contra a disponibilidade do FlowLab (`get-disponibilidade`), obtém o nome e grava `posto_flowlab_id` + `posto_nome` (snapshot) em `agendamentos`.

**`src/routes/postos.ts`** — proxy de disponibilidade (D3):

| Método | Rota | Ação |
|--------|------|------|
| `GET` | `/api/v1/postos/disponibilidade` | Faz proxy da Edge Function `get-disponibilidade` do FlowLab — lista postos/horários ativos. O front usa essa lista para o paciente escolher antes do `POST /agendamentos`. |

**`src/routes/resultados.ts`** — endpoints:

| Método | Rota | Ação |
|--------|------|------|
| `GET` | `/api/v1/resultados` | Lista resultados do paciente |
| `GET` | `/api/v1/resultados/:id/declaracao` | Retorna URL assinada do PDF no Supabase Storage |

**`src/routes/webhooks.ts`** — endpoint de retorno do FlowLab:

| Método | Rota | Ação |
|--------|------|------|
| `POST` | `/api/v1/webhooks/resultados` | Valida HMAC-SHA256 → insere em `resultados` |

Payload esperado do FlowLab (D1 — agora inclui painéis estruturados):
```typescript
{
  agendamentoLabhubId: string  // UUID do agendamento no LAB-HUB
  exameNome: string            // ex.: "Hemograma Completo"
  categoria?: string
  resumo?: string
  paineis: Array<{             // marcadores estruturados (renderizados na UI)
    nome: string
    valor: string
    unidade: string
    ref: string
    ok: boolean
    trend?: number[]
  }>
  laudoUrl?: string            // PDF opcional
  declaracaoUrl?: string       // PDF opcional
  liberadoEm: string           // ISO 8601
}
```

**`src/server.ts`** — atualizar para registrar todos os plugins e rotas:
```typescript
import Fastify from 'fastify'
import sensible from '@fastify/sensible'
import 'dotenv/config'
import { agendamentosRoutes } from './routes/agendamentos'
import { postosRoutes } from './routes/postos'
import { resultadosRoutes } from './routes/resultados'
import { webhooksRoutes } from './routes/webhooks'

const server = Fastify({ logger: { level: 'info' } })
server.register(sensible)
server.register(agendamentosRoutes, { prefix: '/api/v1' })
server.register(postosRoutes,       { prefix: '/api/v1' })
server.register(resultadosRoutes,   { prefix: '/api/v1' })
server.register(webhooksRoutes,     { prefix: '/api/v1' })

server.get('/ping', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))
```

### Rate limiting
Adicionar `@fastify/rate-limit` no `POST /agendamentos` (máx. 5 req/min por IP) para evitar spam de agendamentos.

---

## Fase 3 — `packages/shared` · Tipos Compartilhados

**Objetivo:** centralizar tipos de domínio usados por `apps/web`, `apps/mobile` e `apps/api`.

### Arquivo `packages/shared/src/index.ts`

```typescript
export type AgendamentoStatus = 'pendente' | 'confirmado' | 'cancelado' | 'realizado'

export interface Agendamento {
  id: string
  pacienteId: string
  postoFlowlabId: string   // id canônico do posto no FlowLab
  postoNome: string        // snapshot do nome p/ exibição
  dataHora: string         // ISO 8601
  status: AgendamentoStatus
  flowlabId?: string
  criadoEm: string
}

// Marcador individual — espelha ExamPanel de apps/web (WebHero.tsx:4)
export interface PainelResultado {
  nome: string
  valor: string
  unidade: string
  ref: string
  ok: boolean
  trend?: number[]
}

export type ResultadoStatus = 'analyzing' | 'ready'

export interface Resultado {
  id: string
  pacienteId: string
  agendamentoId?: string
  exameNome: string
  categoria?: string
  status: ResultadoStatus
  resumo?: string
  paineis: PainelResultado[]   // D1: dados estruturados, não só PDF
  laudoUrl?: string            // PDF opcional
  declaracaoUrl?: string       // PDF opcional
  liberadoEm?: string
  flowlabAnaliseId?: string
}

export type Sexo = 'M' | 'F'

export interface Paciente {
  id: string
  authUserId: string
  nome: string
  email: string
  cpf: string              // só dígitos (11 chars)
  sexo: Sexo
  dataNascimento: string   // ISO date (YYYY-MM-DD)
  telefone?: string
}

// Payload enviado ao FlowLab
export interface AgendamentoPayloadFlowLab {
  labhubId: string
  pacienteNome: string
  pacienteTelefone: string
  postoFlowlabId: string
  dataHora: string
}

// Payload recebido do FlowLab via webhook (D1)
export interface ResultadoWebhookPayload {
  agendamentoLabhubId: string
  exameNome: string
  categoria?: string
  resumo?: string
  paineis: PainelResultado[]
  laudoUrl?: string
  declaracaoUrl?: string
  liberadoEm: string
}
```

> **tsconfig estrito** (`tsconfig.base.json:11-12`): `exactOptionalPropertyTypes` e `noUncheckedIndexedAccess` estão ligados. Props opcionais (`categoria?`, `trend?`) não aceitam atribuição de `undefined` explícito, e acesso a arrays/índices retorna `T | undefined`. Escrever os tipos e os acessos com isso em mente desde o início.

> **Tipos `Exam` divergentes:** `apps/web` (`WebHero.tsx`) e `apps/mobile` (`mocks/exams.ts`) têm cada um seu próprio tipo `Exam`, e eles **diferem** (web tem `category`/`trend[]`/`value`+`unit` separados; mobile tem `short`/`collected`/`address`/`value` concatenado). Ao migrar para `Resultado`/`PainelResultado` compartilhado, prever um adaptador por app em vez de assumir um tipo único drop-in.

---

## Fase 4 — `apps/web` · Conectar às Páginas Reais

**Objetivo:** substituir os mocks de cada página por chamadas à API real.

### `src/lib/api.ts` — cliente HTTP a criar

```typescript
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3333'

async function get<T>(path: string, token: string): Promise<T> { ... }
async function post<T>(path: string, body: unknown, token: string): Promise<T> { ... }

export const api = { get, post }
```

### Páginas a atualizar

| Arquivo | Mudança |
|---------|---------|
| `src/pages/SchedulePage.tsx` | Substituir `SLOTS` hardcoded. A disponibilidade **vem do FlowLab** (D3): `apps/api` expõe `GET /api/v1/postos/disponibilidade` que faz proxy de uma Edge Function do FlowLab. Confirmar via `POST /api/v1/agendamentos`. **Dependência externa — ver D3 e a seção de disponibilidade de postos na Fase 6.** |
| `src/pages/HomePage.tsx` | Buscar últimos agendamentos e último resultado via API no mount |
| `src/pages/ResultsPage.tsx` | Substituir `WEB_EXAMS` mock por `GET /api/v1/resultados` (mapear `Resultado`→`Exam` da UI) |
| `src/pages/ExamDetailPage.tsx` | Receber dados reais via props/context em vez do objeto mock |
| `src/pages/LaudoPage.tsx` | **Manter** a renderização HTML estruturada por painéis (D1) — não vira viewer de PDF. Alimentar com `paineis[]` reais. Botão "Baixar PDF" usa `declaracaoUrl` se presente; "Imprimir" segue via `window.print()` |

### Autenticação

- Integrar `@supabase/supabase-js` no `apps/web`
- Criar `src/lib/supabase.ts` com `createClient` usando `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
- Criar `src/pages/LoginPage.tsx` com `supabase.auth.signInWithOtp` (magic link) ou senha
- Guardar o token JWT no contexto React e passá-lo em todos os requests à API

Variáveis de ambiente (`apps/web/.env`):
```env
VITE_API_URL=http://localhost:3333
VITE_SUPABASE_URL=https://<projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

### Rota de Login no `App.tsx`

O `App.tsx` atual usa estado local para navegação. Adicionar:
```typescript
// Antes de renderizar qualquer rota, checar se há sessão Supabase
// Se não, renderizar LoginPage
// Se sim, renderizar o shell normal
```

---

## Fase 5 — `apps/mobile` · Conectar às Telas Reais

**Objetivo:** mesma lógica da Fase 4, mas para React Native / Expo.

### Arquivos a criar/atualizar

| Arquivo | Mudança |
|---------|---------|
| `src/lib/api.ts` | Mesmo cliente HTTP (pode ser importado de `packages/shared` ou duplicado) |
| `src/lib/supabase.ts` | `createClient` com `@supabase/supabase-js` + `AsyncStorage` |
| `src/screens/ScheduleScreen.tsx` | Trocar mock por API real — listar postos, confirmar agendamento |
| `src/screens/HomeScreen.tsx` | Buscar agendamentos e resultados recentes |
| `src/screens/ResultsScreen.tsx` | Trocar `MOBILE_EXAMS` mock por resultados reais |
| `src/screens/ExamDetailScreen.tsx` | Dados reais do resultado selecionado |
| `src/screens/ProfileScreen.tsx` | Carregar perfil real do paciente + opção de logout |

### Dependências a instalar
```bash
cd apps/mobile
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage
```

---

## Fase 6 — Integração com FlowLab

**Objetivo:** garantir que a comunicação entre os dois sistemas funcione de ponta a ponta.

### Fluxo de Agendamento (LAB-HUB → FlowLab)

```
Paciente confirma no apps/web ou apps/mobile
  └─► POST /api/v1/agendamentos (apps/api)
        ├─ Insere em tabela agendamentos (status: pendente)
        └─► POST FlowLab Edge Function receive-agendamento
              └─ FlowLab retorna flowlabId
                   └─ Update agendamentos.flowlab_id + status: confirmado
```

### Fluxo de Resultado (FlowLab → LAB-HUB)

```
Operador libera resultado no FlowLab
  └─► POST /api/v1/webhooks/resultados (apps/api)
        ├─ Valida HMAC-SHA256 (X-Webhook-Signature)
        ├─ Insere em tabela resultados
        └─ Paciente visualiza em ResultsPage / ResultsScreen
```

### ✅ Decidido — disponibilidade de postos (D3): proxy em tempo real

O `SchedulePage` lista postos e horários, mas **essa informação pertence ao FlowLab** (dono das unidades e da agenda). **Decisão: proxy em tempo real** — `apps/api` expõe `GET /api/v1/postos/disponibilidade` fazendo proxy da Edge Function `get-disponibilidade` do FlowLab. O LAB-HUB **não** mantém tabela de postos nem enum; o agendamento persiste apenas `posto_flowlab_id` + `posto_nome` (snapshot). Alternativa descartada por ora: espelho local (exigiria sync e pode ficar stale).

> Dependência externa: a Edge Function `get-disponibilidade` precisa existir no FlowLab. Enquanto não estiver pronta, `SchedulePage` segue com os `SLOTS` mock para destravar o resto da Fase 4.

### Checklist de integração

- [ ] `FLOWLAB_EDGE_FUNCTION_URL` configurado no `apps/api/.env`
- [ ] `FLOWLAB_API_KEY` configurado e testado com a Edge Function
- [ ] **Confirmar o header de auth das Edge Functions do FlowLab** — `Authorization: Bearer <FLOWLAB_API_KEY>` e/ou header `apikey` (ajuste de uma linha em `lib/flowlab.ts`)
- [ ] `FLOWLAB_WEBHOOK_SECRET` igual no LAB-HUB e no FlowLab
- [x] **Fonte de disponibilidade de postos (D3): proxy em tempo real** (decidido) — FlowLab expõe `get-disponibilidade`; `apps/api` faz proxy
- [ ] Webhook de resultado entrega `paineis[]` estruturados (D1), não só URLs de PDF
- [ ] Testar fluxo completo em dev: criar agendamento → verificar recepção no FlowLab → liberar resultado → verificar recebimento no LAB-HUB

---

## Resumo das Fases

| Fase | Escopo | Entrega |
|------|--------|---------|
| **1** ✅ | Supabase LAB-HUB | Enums `sexo`/`resultado_status` + migrations das 3 tabelas (`pacientes` com `cpf`/`sexo`/`data_nascimento`; `agendamentos` com `posto_flowlab_id`+`posto_nome`; `resultados` com `paineis jsonb`) + RLS + índices + bucket `laudos` |
| **2** ✅ | `apps/api` | Servidor Fastify completo com todos os endpoints (rotas retornam os tipos camelCase de `@lab-hub/shared` via `lib/mappers.ts`) |
| **3** ✅ | `packages/shared` | Tipos de domínio exportados para todos os apps (inclui `PostoDisponivel`) |
| **4** ✅ | `apps/web` | Páginas conectadas à API real + auth Supabase (login por senha, gate de sessão, logout) |
| **5** | `apps/mobile` | Telas conectadas à API real + auth Supabase |
| **6** | Integração | Fluxo de ponta a ponta LAB-HUB ↔ FlowLab validado |

---

## Arquivos a Criar/Modificar por App

### `apps/api`
- `src/server.ts` — atualizar (registrar plugins e rotas)
- `src/lib/supabase.ts` — **criar**
- `src/lib/hmac.ts` — **criar**
- `src/lib/flowlab.ts` — **criar** (cliente das Edge Functions do FlowLab)
- `src/middlewares/auth.ts` — **criar**
- `src/routes/cadastro.ts` — **criar** (auto-cadastro: `admin.createUser` + insert em `pacientes`, com rollback)
- `src/routes/agendamentos.ts` — **criar**
- `src/routes/postos.ts` — **criar** (proxy `get-disponibilidade` do FlowLab)
- `src/routes/resultados.ts` — **criar**
- `src/routes/webhooks.ts` — **criar**
- `src/lib/mappers.ts` — **criar** (linhas snake_case → tipos camelCase de `@lab-hub/shared`)
- `src/schemas/cadastro.ts` — **criar**
- `src/schemas/agendamento.ts` — **criar**
- `src/schemas/resultado.ts` — **criar**
- `.env` — **criar** (baseado nas variáveis listadas na Fase 2)
- `package.json` — adicionar `@fastify/sensible`, `@fastify/rate-limit`, `@supabase/supabase-js`, `zod`, `dotenv`

### `packages/shared`
- `src/index.ts` — atualizar (adicionar tipos de domínio)

### `apps/web`
- `src/lib/api.ts` — **criar** (cliente HTTP + JWT do Supabase)
- `src/lib/supabase.ts` — **criar**
- `src/lib/AuthContext.tsx` — **criar** (`AuthProvider`/`useAuth`)
- `src/lib/mappers.ts` — **criar** (`Resultado`→`Exam`)
- `src/lib/useResultados.ts` — **criar** (hook de listagem)
- `src/pages/LoginPage.tsx` — **criar**
- `src/pages/CadastroPage.tsx` — **criar** (auto-cadastro self-service)
- `src/pages/AuthGate.tsx` — **criar** (alterna login/cadastro sem sessão)
- `src/pages/SchedulePage.tsx` — atualizar (conectar API)
- `src/pages/HomePage.tsx` — atualizar (conectar API)
- `src/pages/ResultsPage.tsx` — atualizar (conectar API)
- `src/pages/ExamDetailPage.tsx` — atualizar (dados reais + download)
- `src/pages/LaudoPage.tsx` — atualizar (URL real do PDF)
- `src/pages/ProfilePage.tsx` — atualizar (logout)
- `src/App.tsx` — atualizar (guarda de auth + AuthGate)
- `.env` — **criar**
- `package.json` — adicionar `@supabase/supabase-js`

### `apps/mobile`
- `src/lib/api.ts` — **criar**
- `src/lib/supabase.ts` — **criar**
- `src/screens/ScheduleScreen.tsx` — atualizar
- `src/screens/HomeScreen.tsx` — atualizar
- `src/screens/ResultsScreen.tsx` — atualizar
- `src/screens/ExamDetailScreen.tsx` — atualizar
- `src/screens/ProfileScreen.tsx` — atualizar (auth + logout)

---

## Requisitos Técnicos

- [ ] `apps/api` — Fastify com `@fastify/sensible` + Zod para validação de schema
- [ ] `apps/api` — autenticação JWT via token Supabase LAB-HUB
- [ ] `apps/api` — validação de assinatura HMAC-SHA256 nos webhooks recebidos do FlowLab
- [ ] `apps/api` — rate limiting no `POST /agendamentos`
- [ ] RLS habilitado em todas as tabelas (`pacientes`, `agendamentos`, `resultados`)
- [ ] Dados pessoais do paciente (nome, telefone) não logados
- [ ] Comunicação com FlowLab apenas server-to-server (nunca do frontend)

---

*Referências: `./ARQUITETURA_ANALISES_CLINICAS.md` · `./FLUXO.md` · `./ANALISES_CLINICAS.md` · Plano do FlowLab: `flowlab/docs/PLANO_FLOWLAB_ANALISES_CLINICAS.md`*
