---
name: supabase
description: Use quando o usuário estiver trabalhando com Supabase — criando/consultando tabelas, configurando autenticação, gerenciando storage, escrevendo políticas RLS, criando Edge Functions ou usando a Supabase CLI. Gatilhos: "supabase", "criar tabela no supabase", "autenticação supabase", "upload supabase", "RLS", "Row Level Security", "edge function supabase", "supabase cli", "configurar supabase", "query supabase".
---

# Skill: Supabase

Guia de referência para trabalhar com Supabase — banco de dados, autenticação, storage, RLS e Edge Functions. Agnóstico de framework.

---

## 1. Setup & Client

### Instalação

```bash
npm install @supabase/supabase-js
```

### Inicialização do cliente

```ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)
```

> **Importante:** use sempre a `anon` key no cliente. A `service_role` key só deve ser usada em ambientes server-side confiáveis (nunca no browser).

Variáveis de ambiente necessárias (`.env`):
```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<sua-anon-key>
```

---

## 2. Database

### SELECT

```ts
// Todos os registros
const { data, error } = await supabase.from('tabela').select('*')

// Colunas específicas + filtro
const { data, error } = await supabase
  .from('posts')
  .select('id, title, created_at')
  .eq('published', true)
  .order('created_at', { ascending: false })

// Paginação
const { data, error } = await supabase
  .from('posts')
  .select('*')
  .range(0, 9) // primeira página (10 itens)

// Join via foreign table
const { data, error } = await supabase
  .from('posts')
  .select('id, title, author:users(name, email)')
```

### Filtros comuns

| Método | SQL equivalente |
|--------|----------------|
| `.eq('col', val)` | `col = val` |
| `.neq('col', val)` | `col != val` |
| `.gt('col', val)` | `col > val` |
| `.lt('col', val)` | `col < val` |
| `.gte('col', val)` | `col >= val` |
| `.lte('col', val)` | `col <= val` |
| `.like('col', '%val%')` | `col LIKE '%val%'` |
| `.ilike('col', '%val%')` | `col ILIKE '%val%'` (case-insensitive) |
| `.in('col', [1,2,3])` | `col IN (1,2,3)` |
| `.is('col', null)` | `col IS NULL` |

### INSERT

```ts
const { data, error } = await supabase
  .from('posts')
  .insert({ title: 'Novo post', body: 'Conteúdo', user_id: userId })
  .select() // retorna o registro inserido
```

### UPDATE

```ts
const { data, error } = await supabase
  .from('posts')
  .update({ title: 'Título atualizado' })
  .eq('id', postId)
  .select()
```

### DELETE

```ts
const { error } = await supabase
  .from('posts')
  .delete()
  .eq('id', postId)
```

### UPSERT

```ts
const { data, error } = await supabase
  .from('profiles')
  .upsert({ id: userId, username: 'novo_nome' })
  .select()
```

### Tratamento de erros

```ts
const { data, error } = await supabase.from('posts').select('*')

if (error) {
  console.error('Erro Supabase:', error.message)
  throw error
}
```

---

## 3. Autenticação

### Cadastro (email/senha)

```ts
const { data, error } = await supabase.auth.signUp({
  email: 'usuario@email.com',
  password: 'senha-segura',
})
```

### Login (email/senha)

```ts
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'usuario@email.com',
  password: 'senha-segura',
})
```

### Login OAuth (Google, GitHub, etc.)

```ts
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google', // 'github', 'discord', etc.
  options: {
    redirectTo: 'https://meuapp.com/auth/callback',
  },
})
```

### Logout

```ts
await supabase.auth.signOut()
```

### Obter sessão / usuário atual

```ts
const { data: { session } } = await supabase.auth.getSession()
const { data: { user } } = await supabase.auth.getUser()
```

### Escutar mudanças de autenticação

```ts
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') console.log('Logado:', session?.user)
  if (event === 'SIGNED_OUT') console.log('Deslogado')
})
```

---

## 4. Storage

### Upload de arquivo

```ts
const { data, error } = await supabase.storage
  .from('nome-do-bucket')
  .upload('pasta/arquivo.png', file, {
    contentType: 'image/png',
    upsert: true, // sobrescreve se já existir
  })
```

### Download de arquivo

```ts
const { data, error } = await supabase.storage
  .from('nome-do-bucket')
  .download('pasta/arquivo.png')
```

### URL pública (bucket público)

```ts
const { data } = supabase.storage
  .from('nome-do-bucket')
  .getPublicUrl('pasta/arquivo.png')

console.log(data.publicUrl)
```

### URL assinada (bucket privado, acesso temporário)

```ts
const { data, error } = await supabase.storage
  .from('nome-do-bucket')
  .createSignedUrl('pasta/arquivo.png', 3600) // expira em 1 hora

console.log(data?.signedUrl)
```

### Listar arquivos

```ts
const { data, error } = await supabase.storage
  .from('nome-do-bucket')
  .list('pasta/', { limit: 100 })
```

### Deletar arquivo

```ts
const { error } = await supabase.storage
  .from('nome-do-bucket')
  .remove(['pasta/arquivo.png'])
```

---

## 5. Row Level Security (RLS)

### Habilitar RLS em uma tabela

```sql
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
```

> Após habilitar RLS, a tabela fica **inacessível por padrão** — é necessário criar políticas explicitamente.

### Padrões de políticas

**Leitura pública (qualquer um pode ler):**
```sql
CREATE POLICY "Leitura pública"
  ON posts FOR SELECT
  USING (true);
```

**Leitura apenas do próprio usuário:**
```sql
CREATE POLICY "Usuário lê seus próprios posts"
  ON posts FOR SELECT
  USING (auth.uid() = user_id);
```

**Inserção apenas autenticado:**
```sql
CREATE POLICY "Usuário autenticado pode inserir"
  ON posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

**Update e delete apenas do dono:**
```sql
CREATE POLICY "Usuário atualiza seus posts"
  ON posts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuário deleta seus posts"
  ON posts FOR DELETE
  USING (auth.uid() = user_id);
```

**Acesso via `service_role` ignora RLS** — use com cuidado apenas no server.

---

## 6. Edge Functions

### Estrutura de uma função

```
supabase/
  functions/
    minha-funcao/
      index.ts
```

```ts
// supabase/functions/minha-funcao/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { nome } = await req.json()

  return new Response(
    JSON.stringify({ mensagem: `Olá, ${nome}!` }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
```

### Chamar a função pelo cliente

```ts
const { data, error } = await supabase.functions.invoke('minha-funcao', {
  body: { nome: 'Mundo' },
})
```

---

## 7. CLI

### Instalação

```bash
npm install -g supabase
# ou via Homebrew:
brew install supabase/tap/supabase
```

### Comandos essenciais

```bash
# Inicializar projeto local
supabase init

# Login no Supabase Cloud
supabase login

# Linkar projeto local ao projeto remoto
supabase link --project-ref <project-ref>

# Aplicar migrations no banco remoto
supabase db push

# Baixar schema do banco remoto
supabase db pull

# Gerar tipos TypeScript a partir do schema
supabase gen types typescript --linked > src/database.types.ts

# Iniciar emulador local (banco, auth, storage, etc.)
supabase start

# Parar emulador local
supabase stop

# Criar nova migration
supabase migration new nome-da-migration

# Deploy de Edge Function
supabase functions deploy minha-funcao

# Listar funções deployadas
supabase functions list
```

---

## 8. Boas Práticas de Segurança

- **Nunca exponha a `service_role` key no frontend** — ela ignora RLS e dá acesso total ao banco
- **Sempre habilite RLS** em tabelas que contêm dados de usuários
- **Use a `anon` key no cliente** — ela respeita RLS
- **Escreva políticas RLS explícitas** — tabelas sem políticas ficam inacessíveis após habilitar RLS
- **Valide dados no banco** com constraints SQL (`NOT NULL`, `CHECK`, `UNIQUE`) além das validações no client
- **Use `auth.uid()`** nas políticas para garantir que usuários só acessem seus próprios dados
- **Prefira Edge Functions** para lógica sensível que não deve rodar no cliente
- **Rotacione as chaves** em caso de exposição acidental — dashboard > Settings > API
