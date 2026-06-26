# Analise de Codigo — LAB-HUB Fase 4

> **Escopo:** `apps/api`, `apps/web`, `packages/shared`  
> **Base de comparacao:** `docs/PLANO_ANALISES_CLINICAS.md` (Fases 1-4)  
> **Data da revisao:** Junho/2026  
> **Status do projeto:** Codigo implementado ate a Fase 4 (web conectado a API real + auth). Fases 5 (mobile) e 6 (integracao ponta-a-ponta) ainda nao iniciadas.

---

## Como usar este documento

Os itens estao organizados por **severidade** e numerados sequencialmente para referencia em commits ou tasks.  
Cada item contem:

- **Local:** arquivo(s) e linha(s) afetados  
- **Problema:** o que esta errado ou inconsistente  
- **Impacto:** como isso se manifesta em runtime  
- **Referencia ao plano:** secao/doc de origem  
- **Sugestao de correcao:** snippet ou estrategia recomendada  
- **Status:** pendente / em andamento / resolvido

---

## 🔴 Criticos — impedem o funcionamento da Fase 4

### 1. Service role key exposta no frontend (`apps/web/.env`)

| | |
|---|---|
| **Arquivos** | `apps/web/.env` |
| **Linhas** | `VITE_SUPABASE_ANON_KEY=eyJhbG...` |
| **O que o plano diz** | Fase 4: *Criar `src/lib/supabase.ts` com `createClient` usando `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`* |
| **O que esta no codigo** | A `VITE_SUPABASE_ANON_KEY` carrega uma JWT cujo payload contem `"role":"service_role"`. |

#### Problema
A chave `service_role` **burla completamente o RLS** do Supabase. Como essa variavel e prefixada com `VITE_`, ela e embutida no bundle do browser durante o build. Qualquer usuario consegue extrair a chave via DevTools -> Network / Sources e executar operacoes diretas no Supabase como superusuario (ler, escrever e deletar qualquer registro de qualquer tabela).

#### Impacto
- Seguranca comprometida: IDOR trivial, acesso a dados de outros pacientes, exclusao de agendamentos/resultados.  
- As politicas RLS (`pacientes`, `agendamentos`, `resultados`) tornam-se inuteis porque o cliente do browser usa service role.

#### Sugestao de correcao
1. No dashboard do Supabase, va em **Project Settings -> API**.
2. Copie a chave publica (`anon key`, a secao *anon / public*).
3. Substitua o valor no `apps/web/.env`.
4. **Nunca** commitar `.env` real (o `.gitignore` ja esta correto).
5. Rotacionar a service_role_key atual, pois ela pode ter sido exposta em builds anteriores.

```env
# apps/web/.env
VITE_SUPABASE_URL=https://<projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...<chave_anon_publica>
```

> **Regra de ouro:** `service_role` so no `apps/api/.env`. `anon` so no `apps/web/.env`.

---

### 2. Parser JSON global como `string` quebra todos os POSTs da API

| | |
|---|---|
| **Arquivos** | `apps/api/src/routes/webhooks.ts` |
| **Linhas** | 11-17 |
| **O que o plano diz** | Fase 2: *`POST /api/v1/webhooks/resultados` — Valida HMAC-SHA256 -> insere em `resultados`* |
| **O que esta no codigo** | `app.addContentTypeParser('application/json', { parseAs: 'string' }, ...)` registrado no escopo da instancia Fastify. |

#### Problema
No Fastify, `addContentTypeParser` e **global** para a instancia do servidor. Como `webhooksRoutes` e registrado no mesmo `server` com prefixo `/api/v1`, todas as rotas POST (`/cadastro`, `/agendamentos`) passam a receber `request.body` como `string` em vez de objeto JavaScript. O `zod.safeParse(request.body)` espera um objeto; ao receber uma string, o schema de agendamento (`{ postoFlowlabId, dataHora }`) falha com erro de tipo (`Expected object, received string`).

#### Impacto
- `POST /api/v1/cadastro` -> sempre retorna 400 (bad request).  
- `POST /api/v1/agendamentos` -> sempre retorna 400.  
- O unico POST que funcionaria seria o webhook, porque ele manualmente faz `JSON.parse(rawBody)`.

#### Sugestao de correcao
Nao substituir o parser JSON global. Em vez disso, capture o raw body **apenas na rota do webhook**. A estrategia mais simples sem plugin externo e usar o hook `preParsing` na rota especifica:

```typescript
// apps/api/src/routes/webhooks.ts
app.post(
  '/webhooks/resultados',
  {
    preParsing: async (request, reply, payload) => {
      let raw = ''
      for await (const chunk of payload) {
        raw += chunk
      }
      // Guarda o raw para uso posterior na rota
      ;(request as any).rawBody = raw
      // Retorna o payload original para que o parser padrao continue
      return payload
    },
  },
  async (request, reply) => {
    const rawBody = (request as any).rawBody as string
    const signature = request.headers['x-webhook-signature']
    if (typeof signature !== 'string' || !verifyHmac(rawBody, signature, WEBHOOK_SECRET)) {
      throw app.httpErrors.unauthorized('Assinatura invalida')
    }
    // ... restante da logica
  },
)
```

> **Acao recomendada:** Remover o `addContentTypeParser` de `webhooks.ts` **imediatamente** e adotar a estrategia acima.

---

### 3. CORS nao configurado na API

| | |
|---|---|
| **Arquivos** | `apps/api/src/server.ts` |
| **Linhas** | 1-36 |
| **O que o plano diz** | Fase 2: servidor Fastify funcional com plugins |
| **O que esta no codigo** | Registro de `sensible` e `rateLimit`, mas **sem CORS**. |

#### Problema
O `apps/web` roda em `http://localhost:5173` (Vite dev server) e faz `fetch` para `http://localhost:3333` (API). Browsers modernos bloqueiam requisicoes cross-origin quando o servidor nao envia os headers `Access-Control-Allow-Origin` adequados.

#### Impacto
- Todas as chamadas da web para a API falham com erro de CORS no console do browser.  
- A aplicacao web fica inutilizavel em ambiente de desenvolvimento.

#### Sugestao de correcao

```bash
cd apps/api
npm install @fastify/cors
```

```typescript
// apps/api/src/server.ts
import cors from '@fastify/cors'

// ... apos criar o server
await server.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
})
```

> Em producao, restrinja `origin` para o dominio exato do frontend.

---

## 🟡 Medios — bugs de logica ou inconsistencias com o plano

### 4. Cadastro cria usuario sempre como `email_confirm: false`, mas frontend tenta login automatico

| | |
|---|---|
| **Arquivos** | `apps/api/src/routes/cadastro.ts:30`, `apps/web/src/pages/CadastroPage.tsx:96` |
| **O que o plano diz** | Fase 2: toggle `REQUIRE_EMAIL_CONFIRMATION` para alternar entre fluxo de confirmacao (prod) e login direto (dev). |
| **O que esta no codigo** | Backend usa `email_confirm: false` **fixo**, independente do flag. Frontend, quando `requiresEmailConfirmation === false`, chama `supabase.auth.signInWithPassword`. |

#### Problema
Em modo dev (`REQUIRE_EMAIL_CONFIRMATION=false`), o backend cria o usuario no Auth como **nao confirmado** (`email_confirm: false`). O Supabase, por padrao, exige confirmacao de e-mail para permitir login por senha. O `signInWithPassword` do frontend falha com erro do tipo *Email not confirmed*.

#### Impacto
- Fluxo de cadastro em dev parece quebrado: conta e criada, mas o login automatico falha.  
- O usuario precisa confirmar e-mail mesmo em ambiente de testes, atrasando o desenvolvimento.

#### Sugestao de correcao

```typescript
// apps/api/src/routes/cadastro.ts
const { data: created, error: authError } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: !REQUIRE_EMAIL_CONFIRMATION, // confirma automaticamente em dev
})
```

Isso alinha o estado do usuario no Auth com o comportamento esperado pelo frontend.

---

### 5. `AuthContext` nao trata rejeicao de `getSession()`

| | |
|---|---|
| **Arquivos** | `apps/web/src/lib/AuthContext.tsx:20-22` |
| **O que o plano diz** | Fase 4: auth gate funcional |
| **O que esta no codigo** | `void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })` |

#### Problema
A Promise `getSession()` pode rejeitar (ex.: `localStorage` corrompido, erro de parsing do JWT armazenado). Como nao ha `.catch()` nem `.finally()`, se a Promise rejeitar, `setLoading(false)` **nunca** e chamado.

#### Impacto
- Tela trava eternamente em "Carregando...".  
- O usuario precisa limpar cache/localStorage manualmente para recuperar.

#### Sugestao de correcao

```typescript
// apps/web/src/lib/AuthContext.tsx
useEffect(() => {
  let cancelled = false

  supabase.auth.getSession()
    .then(({ data }) => {
      if (!cancelled) setSession(data.session)
    })
    .catch(() => {
      if (!cancelled) setSession(null)
    })
    .finally(() => {
      if (!cancelled) setLoading(false)
    })

  const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
    if (!cancelled) setSession(s)
  })

  return () => {
    cancelled = true
    sub.subscription.unsubscribe()
  }
}, [])
```

> Nota: tambem adicionei um `cancelled` flag para evitar setState apos unmount.

---

### 6. Webhook de resultado nao e idempotente

| | |
|---|---|
| **Arquivos** | `apps/api/src/routes/webhooks.ts:50-61` |
| **O que o plano diz** | Fase 2: endpoint de retorno do FlowLab |
| **O que esta no codigo** | `supabase.from('resultados').insert({...})` sem verificacao previa. |

#### Problema
Webhooks sao intrinsecamente **at-least-once delivery**. O FlowLab (ou qualquer sistema externo) pode reenviar o mesmo payload por retry de rede, timeout, ou reconexao. O codigo atual sempre executa `insert`, criando duplicatas no banco.

#### Impacto
- Resultados duplicados para o mesmo agendamento + exame.  
- Paciente ve multiplas entradas identicas na lista de resultados.

#### Sugestao de correcao

Adicionar verificacao de existencia antes do insert:

```typescript
// apps/api/src/routes/webhooks.ts
const { data: existing } = await supabase
  .from('resultados')
  .select('id')
  .eq('agendamento_id', agendamento.id)
  .eq('exame_nome', payload.exameNome)
  .maybeSingle()

if (existing) {
  return reply.send({ ok: true, idempotency: 'ignored' })
}

const { error } = await supabase.from('resultados').insert({ ... })
// ...
```

Ou, alternativamente, usar `upsert` com uma chave unica composta (`agendamento_id, exame_nome`):

```sql
-- migration adicional
alter table resultados add constraint uq_resultado_agendamento_exame
  unique (agendamento_id, exame_nome);
```

```typescript
await supabase.from('resultados').upsert({ ... }, { onConflict: 'agendamento_id,exame_nome' })
```

---

### 7. `HomePage` busca apenas resultados, nao agendamentos

| | |
|---|---|
| **Arquivos** | `apps/web/src/pages/HomePage.tsx` |
| **O que o plano diz** | Fase 4: *Buscar ultimos agendamentos e ultimo resultado via API no mount* |
| **O que esta no codigo** | Usa apenas `useResultados()`. Cards "Proximos passos" e "Acompanhamento" sao mocks hardcoded (`TRACKING_ITEMS`, `NEXT_STEPS`). |

#### Problema
A Home nao reflete o estado real do paciente. Mesmo que exista um agendamento confirmado para amanha, a tela continua mostrando *Proxima recomendada: 06 Mai* (mock) em vez da data real. O card de acompanhamento tambem nao tem fonte de dados.

#### Impacto
- Experiencia inconsistente: usuario agenda coleta, mas a Home nao reflete.  
- Dados de acompanhamento (`Colesterol LDL`, `Vitamina D`) sao ficticios.

#### Sugestao de correcao

Criar um hook `useAgendamentos`:

```typescript
// apps/web/src/lib/useAgendamentos.ts
import { useEffect, useState } from 'react'
import type { Agendamento } from '@lab-hub/shared'
import { api } from './api'

export function useAgendamentos() {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api.get<Agendamento[]>('/agendamentos')
      .then((data) => { if (alive) { setAgendamentos(data); setError(null) } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Erro') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return { agendamentos, loading, error }
}
```

E consumir na `HomePage`:

```typescript
const { agendamentos } = useAgendamentos()
const proximoAgendamento = agendamentos
  .filter((a) => new Date(a.dataHora) > new Date())
  .sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime())[0]
```

Substituir o card "Proximos passos" para mostrar o agendamento real ou um CTA para agendar.

---

### 8. Botao "Baixar PDF" no `WebHero` esta sem acao

| | |
|---|---|
| **Arquivos** | `apps/web/src/components/shared/WebHero.tsx:64-66` |
| **O que o plano diz** | Fase 4: *Botao 'Baixar PDF' usa `declaracaoUrl` se presente* |
| **O que esta no codigo** | `<button ...>Baixar PDF</button>` sem `onClick`. |

#### Problema
O componente `WebHero` recebe o objeto `Exam` completo, incluindo `declaracaoUrl`. No entanto, o botao de download esta apenas como elemento visual, sem handler.

#### Impacto
- Usuario clica em "Baixar PDF" no hero e nada acontece.  
- Inconsistencia com `ExamDetailPage`, onde o mesmo botao funciona.

#### Sugestao de correcao

Reaproveitar o mesmo padrao do `ExamDetailPage`:

```typescript
// apps/web/src/components/shared/WebHero.tsx
import { api } from '../../lib/api'

// dentro do componente:
const handleDownload = async () => {
  if (!exam.declaracaoUrl) return
  try {
    const { url } = await api.declaracao(exam.id)
    window.open(url, '_blank', 'noopener')
  } catch {
    /* sem declaracao disponivel */
  }
}

// no JSX:
<button
  onClick={() => void handleDownload()}
  className="..."
>
  <WIcon name="download" ... />Baixar PDF
</button>
```

---

### 9. `LaudoPage` exibe dados fixos do paciente

| | |
|---|---|
| **Arquivos** | `apps/web/src/pages/LaudoPage.tsx:82-83` |
| **O que o plano diz** | Fase 4: laudo renderizado com dados reais de paineis (D1). |
| **O que esta no codigo** | Nome "Joao Madeiro", CPF mascarado fixo, data de nascimento fixa "12/03/1989", sexo "M". |

#### Problema
O laudo e um documento oficial. Exibir dados de outro paciente (ou dados ficticios) para qualquer usuario logado e inaceitavel em producao.

#### Impacto
- Laudo incorreto gerado para qualquer paciente que nao seja "Joao Madeiro".  
- Risco regulatorio e de privacidade (impressao/distribuicao de documento com dados errados).

#### Sugestao de correcao

**Opcao A — Rapida (minima viabilidade):**  
Criar endpoint `GET /api/v1/pacientes/me` na API que retorna os dados do paciente autenticado (derivado do JWT, D4). Consumir no frontend e injetar no `LaudoPage`.

**API:**

```typescript
// apps/api/src/routes/pacientes.ts (novo arquivo)
app.get('/pacientes/me', { preHandler: authenticate }, async (request) => {
  const { data, error } = await supabase
    .from('pacientes')
    .select('*')
    .eq('id', request.pacienteId)
    .single()
  if (error || !data) throw app.httpErrors.notFound()
  return toPaciente(data)
})
```

**Web:**

```typescript
// apps/web/src/lib/usePaciente.ts
export function usePaciente() { /* similar a useResultados */ }
```

**Opcao B — Adiar:**  
Se isso nao for prioritario para a Fase 4, documentar como debito tecnico para a proxima iteracao. Mas recomendo fortemente a Opcao A, pois e pouco codigo e elimina um risco serio.

---

### 10. `declaracaoUrl` no schema do webhook aceita qualquer string

| | |
|---|---|
| **Arquivos** | `apps/api/src/schemas/resultado.ts:21` |
| **O que o plano diz** | Fase 2: webhook recebe `declaracaoUrl?: string` (PDF opcional) |
| **O que esta no codigo** | `declaracaoUrl: z.string().optional()` — aceita qualquer string. |

#### Problema
O codigo consome `declaracaoUrl` assim:

```typescript
await supabase.storage.from('laudos').createSignedUrl(resultado.declaracao_url as string, 3600)
```

A funcao `createSignedUrl` espera um **path relativo** dentro do bucket (ex.: `resultados/uuid/declaracao.pdf`). Se o FlowLab enviar uma URL completa (`https://...supabase.co/storage/v1/object/public/...`), a funcao falha ou gera uma URL assinada invalida.

#### Impacto
- Falha silenciosa no download de declaracoes se o contrato com o FlowLab divergir.  
- Dificuldade de debug porque o erro so aparece em runtime durante a integracao (Fase 6).

#### Sugestao de correcao

Padronize o contrato com o FlowLab **agora**, antes da Fase 6:

1. **Se `declaracaoUrl` for um path no bucket:**
   - Valide que nao e uma URL absoluta:
   ```typescript
   declaracaoUrl: z.string().refine((s) => !s.startsWith('http'), {
     message: 'declaracaoUrl deve ser um path relativo, nao uma URL completa',
   }).optional()
   ```

2. **Se o FlowLab enviar URL completa:**
   - Normalize no backend extraindo o path:
   ```typescript
   const bucketPath = payload.declaracaoUrl
     ? new URL(payload.declaracaoUrl).pathname.replace('/storage/v1/object/public/laudos/', '')
     : null
   ```

Registre essa decisao no contrato da Fase 6 para evitar surpresas.

---

## 🟢 Leves — melhorias rapidas e debitos tecnicos

### 11. `useEffect` sem array de dependencias no `App.tsx`

| | |
|---|---|
| **Arquivos** | `apps/web/src/App.tsx:41-44` |
| **Problema** | `lucide.createIcons` e chamado apos **cada** render, nao so no mount. |
| **Impacto** | Reflows desnecessarios, potencial de performance ruim em telas complexas. |
| **Sugestao** | Adicionar array vazio: `useEffect(() => { ... }, [])` |

---

### 12. Rate limit global muito permissivo

| | |
|---|---|
| **Arquivos** | `apps/api/src/server.ts:14` |
| **O que o plano diz** | Fase 2: rate limit estrito no `POST /agendamentos` (5/min). |
| **O que esta no codigo** | Rate limit global de 100 req/min + rate limit por rota no cadastro (5/min) e agendamentos (5/min). |
| **Problema** | O global de 100/min e OK para dev, mas nao e necessario e pode mascarar abusos em outras rotas. |
| **Sugestao** | Remover o global (`server.register(rateLimit, { max: 100, ... })`) e deixar apenas os limites granulares por rota. Se precisar de um fallback seguro, use algo como 600/min (10/s) como protecao basica, nao 100/min que pode bloquear batch legitimo do frontend. |

---

### 13. `ProfilePage` 100% mock

| | |
|---|---|
| **Arquivos** | `apps/web/src/pages/ProfilePage.tsx` |
| **Problema** | Todos os campos (CPF, email, telefone, convenio) sao valores fixos hardcoded. |
| **Impacto** | Tela visualmente funcional, mas nao reflete o paciente logado. |
| **Sugestao** | Consumir `usePaciente` (mesmo hook sugerido no item 9) para preencher os dados reais. Como o plano (D2) adiou dependentes, o switcher de perfil pode permanecer mock. |

---

### 14. `api.ts` do web nao expoe metodo generico para DELETE/PUT/PATCH

| | |
|---|---|
| **Arquivos** | `apps/web/src/lib/api.ts` |
| **Problema** | O cliente exporta apenas `get` e `post`. Se futuras features precisarem de `PUT` (atualizar perfil) ou `DELETE` (cancelar agendamento), sera necessario refatorar. |
| **Impacto** | Baixo — nao quebra nada agora. |
| **Sugestao** | Generalizar:
```typescript
export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  declaracao: (resultadoId: string) => request<{ url: string }>(`/resultados/${resultadoId}/declaracao`),
}
```

---

### 15. `dotenv` versao incorreta no `package.json` da API

| | |
|---|---|
| **Arquivos** | `apps/api/package.json` |
| **Problema** | `"dotenv": "^17.4.2"` — a ultima versao do `dotenv` e `16.x`. A versao `17` nao existe no npm registry. |
| **Impacto** | `npm install` pode falhar ou instalar uma versao inesperada. Verifique se o lockfile (`package-lock.json` ou outro) esta correto. |
| **Sugestao** | Corrigir para `"dotenv": "^16.4.5"` (ou a ultima 16.x disponivel). |

---

## ✅ O que esta realmente OK na Fase 4

A lista abaixo confirma que a arquitetura e a maioria dos contratos estao corretos. Use como checklist de confianca:

| Item | Arquivo(s) | Avaliacao |
|------|------------|-----------|
| Tipos compartilhados (`@lab-hub/shared`) | `packages/shared/src/index.ts` | ✅ Completo e alinhado com o plano (D1, D3). |
| Mappers snake_case -> camelCase | `apps/api/src/lib/mappers.ts` | ✅ Implementado para todas as entidades. |
| Auth flow (login/cadastro/logout) | `AuthContext.tsx`, `LoginPage.tsx`, `CadastroPage.tsx` | ✅ Estrutura correta, gate funcional. |
| `AuthGate` alternando login/cadastro | `pages/AuthGate.tsx` | ✅ Simples e efetivo. |
| Cliente HTTP com JWT | `apps/web/src/lib/api.ts` | ✅ Anexa token automaticamente. |
| Supabase client no browser | `apps/web/src/lib/supabase.ts` | ✅ Configuracao correta (persistSession, autoRefreshToken). |
| Supabase client service role na API | `apps/api/src/lib/supabase.ts` | ✅ `persistSession: false`, chave isolada. |
| Middleware de auth (JWT -> pacienteId) | `apps/api/src/middlewares/auth.ts` | ✅ D4 implementado corretamente. |
| Validacao HMAC no webhook | `apps/api/src/lib/hmac.ts` | ✅ `timingSafeEqual` com checagem de tamanho. |
| Cliente FlowLab server-to-server | `apps/api/src/lib/flowlab.ts` | ✅ Centralizado, API_KEY nunca exposto. |
| Schema Zod de cadastro | `apps/api/src/schemas/cadastro.ts` | ✅ CPF normalizado, validacoes presentes. |
| Schema Zod de agendamento | `apps/api/src/schemas/agendamento.ts` | ✅ Alinhado com o plano. |
| Schema Zod de resultado (webhook) | `apps/api/src/schemas/resultado.ts` | ✅ Estrutura correta (paineis estruturados). |
| Rota de cadastro com rollback | `apps/api/src/routes/cadastro.ts` | ✅ `deleteUser` em caso de falha no insert. |
| Rota de agendamentos (POST/GET) | `apps/api/src/routes/agendamentos.ts` | ✅ Valida disponibilidade, snapshot do nome, notifica FlowLab. |
| Rota de postos (proxy) | `apps/api/src/routes/postos.ts` | ✅ D3 implementado. |
| Rota de resultados (GET + signed URL) | `apps/api/src/routes/resultados.ts` | ✅ Lista + geracao de URL assinada. |
| `SchedulePage` consumindo API real | `apps/web/src/pages/SchedulePage.tsx` | ✅ Lista postos, confirma agendamento, remove slot local. |
| `ResultsPage` + `ExamDetailPage` reais | `apps/web/src/pages/ResultsPage.tsx`, `ExamDetailPage.tsx` | ✅ Mapeamento `Resultado`->`Exam`, filtros, busca. |
| `useResultados` hook | `apps/web/src/lib/useResultados.ts` | ✅ Abort-safe (`alive` flag), tratamento de erro. |
| Mapeador `resultadoToExam` | `apps/web/src/lib/mappers.ts` | ✅ Alinhado com `PainelResultado` e `ExamPanel`. |
| Variaveis de ambiente documentadas | `apps/api/.env.example`, `apps/web/.env` | ✅ Presenca de comentarios explicativos. |
| `.gitignore` excluindo `.env` | `.gitignore` | ✅ Correto. |

---

## Roadmap de Correcoes Recomendado

Ordem sugerida para aplicar as correcoes, priorizando o que desbloqueia o desenvolvimento:

1. **#1 — Trocar a key do `.env` do web** (anon key publica).  
   *Bloqueia:* seguranca basica.
2. **#2 — Arrumar o parser JSON** (nao quebrar POSTs).  
   *Bloqueia:* cadastro e agendamento via API.
3. **#3 — Adicionar CORS** na API.  
   *Bloqueia:* comunicacao web <-> API em dev.
4. **#5 — Proteger `AuthContext`** contra erro de `getSession()`.  
   *Bloqueia:* tela travada em edge cases.
5. **#4 — Ajustar `email_confirm`** no cadastro para respeitar o flag dev.  
   *Desbloqueia:* fluxo de testes sem e-mail.
6. **#6 — Tornar webhook idempotente**.  
   *Previne:* duplicatas quando o FlowLab chegar (Fase 6).
7. **#7 — Conectar agendamentos na HomePage**.  
   *Completa:* a Fase 4 no web.
8. **#8 — Corrigir botao "Baixar PDF" no Hero**.  
   *Polimento:* consistencia de UX.
9. **#9 / #13 — Dados reais no ProfilePage e LaudoPage** (criar `GET /pacientes/me`).  
   *Qualidade:* elimina mocks criticos.
10. **#11, #12, #14, #15** — melhorias leves e correcoes de package.

---

## Checklist de Acompanhamento

Use esta tabela para marcar o que ja foi corrigido:

| # | Item | Status | Commit/PR |
|---|------|--------|-----------|
| 1 | Service role key no frontend | ✅ Resolvido | `.env` do web trocado para a anon key publica |
| 2 | Parser JSON global como string | ⚪ Falso positivo | Parser fica isolado no plugin `webhooksRoutes` (encapsulamento Fastify); `/cadastro` recebe body como objeto — confirmado via `inject()` |
| 3 | CORS nao configurado | ✅ Resolvido | `@fastify/cors` registrado em `server.ts` (origin via `CORS_ORIGIN`) |
| 4 | `email_confirm` fixo vs login automatico | ✅ Resolvido | `email_confirm: !REQUIRE_EMAIL_CONFIRMATION` em `cadastro.ts` |
| 5 | `AuthContext` nao trata erro de `getSession()` | ✅ Resolvido | `.catch()`/`.finally()` + flag `cancelled` em `AuthContext.tsx` |
| 6 | Webhook nao idempotente | ✅ Resolvido | unique constraint `(agendamento_id, exame_nome)` + insert trata 23505 como idempotente |
| 7 | HomePage nao busca agendamentos | ✅ Resolvido | hook `useAgendamentos` + "Próximos passos" mostra a próxima coleta real. (Card "Acompanhamento" segue mock — sem fonte de dados no backend, conforme nota do item) |
| 8 | Botao "Baixar PDF" no Hero sem acao | ✅ Resolvido | `handleDownload` via `api.declaracao(exam.id)` + render condicional em `exam.declaracaoUrl` (padrão da LaudoPage) |
| 9 | LaudoPage com dados de paciente fixos | ✅ Resolvido | `GET /pacientes/me` + hook `usePaciente` na LaudoPage |
| 10 | `declaracaoUrl` sem validacao de formato | ✅ Resolvido | `.refine` rejeita URL absoluta (http/https) em `resultado.ts` |
| 11 | `useEffect` sem deps no App.tsx | ✅ Resolvido | array `[]` no efeito do lucide; cada `WIcon` já cria o próprio ícone |
| 12 | Rate limit global alto | ✅ Resolvido | fallback global relaxado p/ 600/min; limites estritos seguem por rota |
| 13 | ProfilePage 100% mock | ✅ Resolvido | `usePaciente` preenche os campos reais (switcher/avatar segue mock por D2) |
| 14 | API client sem PUT/DELETE | ✅ Resolvido | `put`/`del` adicionados em `api.ts` |
| 15 | Versao incorreta do `dotenv` | ⚪ Falso positivo | `dotenv@17.4.2` existe e está instalado (lockfile com integrity válido) |

---

*Documento gerado para acompanhamento da Fase 4 do LAB-HUB.*
