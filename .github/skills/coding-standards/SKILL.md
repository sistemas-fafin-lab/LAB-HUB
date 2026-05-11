---
name: coding-standards
description: Guia de melhores práticas e padrões de qualidade para criação e revisão de código. Use esta skill sempre que o usuário pedir para criar código novo, revisar código existente, refatorar, ou mencionar "boas práticas", "padrões de código", "clean code", "código limpo", "coding standards", "qualidade de código", "como estruturar", "como organizar o código". Acione também quando o código produzido tiver funções longas, duplicação, nomes genéricos, ou tratamento de erros ausente — mesmo que o usuário não mencione explicitamente qualidade de código.
---

# Skill: Coding Standards

Guia de referência para escrever código claro, manutenível e de qualidade — independente de linguagem.

---

## Princípio central

Código é lido muito mais vezes do que é escrito. O objetivo de qualquer decisão de código deve ser: **tornar o próximo leitor (humano ou LLM) capaz de entender a intenção imediatamente**, sem precisar decifrar a lógica.

---

## 1. Nomenclatura

Nomes são a documentação mais barata que existe. Um bom nome elimina a necessidade de um comentário.

**Regras:**
- Nomes de variáveis e funções devem revelar a intenção, não o tipo ou a implementação
- Evite abreviações e siglas não óbvias (`usr`, `tmp`, `d`, `x`)
- Booleanos devem parecer uma pergunta: `isActive`, `hasPermission`, `shouldRetry`
- Funções devem ser verbos ou frases verbais: `getUserById`, `sendWelcomeEmail`, `calculateTax`
- Constantes em SCREAMING_SNAKE_CASE para valores verdadeiramente fixos

```python
# Ruim
def proc(d, flg):
    if flg:
        return d * 0.9

# Bom
def apply_discount(price, is_member):
    if is_member:
        return price * 0.9
    return price
```

---

## 2. Funções pequenas e focadas

Uma função deve fazer **uma única coisa** e fazê-la bem. Se você precisar de "e" para descrever o que uma função faz, ela provavelmente faz coisas demais.

**Sinais de alerta:**
- Função com mais de 20-30 linhas
- Múltiplos níveis de indentação aninhados
- Mais de 3-4 parâmetros
- Nome com "And", "Also", "AndThen"

```typescript
// Ruim — faz tudo junto
async function handleUserRegistration(data: any) {
  const user = await db.users.create(data);
  await sendEmail(user.email, 'Bem-vindo!', template);
  await analytics.track('user_registered', { userId: user.id });
  await slack.notify(`#ops`, `Novo usuário: ${user.email}`);
  return user;
}

// Bom — cada função tem uma responsabilidade
async function registerUser(data: UserInput): Promise<User> {
  const user = await db.users.create(data);
  await notifyRegistration(user);
  return user;
}

async function notifyRegistration(user: User): Promise<void> {
  await Promise.all([
    sendWelcomeEmail(user.email),
    trackUserRegistration(user.id),
    notifyOpsChannel(user.email),
  ]);
}
```

---

## 3. DRY — Don't Repeat Yourself

Duplicação não é apenas copiar código — é duplicar **conhecimento**. Quando a regra mudar, você terá dois lugares para atualizar e provavelmente vai esquecer um.

**Como identificar:**
- Blocos de código quase idênticos em 2+ lugares
- Mesma validação ou cálculo reescrito em funções diferentes
- Constantes mágicas repetidas (`0.9`, `"admin"`, `3600`)

**Cuidado:** Não abstraia prematuramente. Espere ver a duplicação pelo menos duas vezes antes de criar uma abstração. Três linhas parecidas não são necessariamente o mesmo conhecimento.

```python
# Ruim — regra de desconto duplicada
def checkout_price(price, user_type):
    if user_type == 'member':
        return price * 0.9
    return price

def invoice_total(items, user_type):
    total = sum(item.price for item in items)
    if user_type == 'member':
        total = total * 0.9  # esqueceu de atualizar aqui quando a regra mudar
    return total

# Bom — regra centralizada
MEMBER_DISCOUNT = 0.9

def apply_member_discount(price: float, user_type: str) -> float:
    if user_type == 'member':
        return price * MEMBER_DISCOUNT
    return price
```

---

## 4. Tratamento de erros

Erros são parte do comportamento esperado do sistema, não exceções raras. Trate-os explicitamente onde faz sentido — não os silencie.

**Regras:**
- Nunca engula erros com `except: pass` ou `catch (e) {}` vazio
- Não trate erros que você não pode recuperar — deixe propagar
- Erros devem conter contexto suficiente para debug (`"Falha ao criar usuário id=42"`, não apenas `"Erro"`)
- Prefira falhar cedo e com clareza a silenciar e continuar em estado inválido
- Valide entradas na borda do sistema (APIs, formulários), não no meio da lógica interna

```typescript
// Ruim — erro silenciado
async function getUser(id: string) {
  try {
    return await db.users.findById(id);
  } catch (e) {
    return null; // quem chama não sabe o que aconteceu
  }
}

// Bom — erro com contexto, falha explícita
async function getUser(id: string): Promise<User> {
  try {
    const user = await db.users.findById(id);
    if (!user) throw new NotFoundError(`Usuário não encontrado: id=${id}`);
    return user;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw new DatabaseError(`Falha ao buscar usuário id=${id}`, { cause: error });
  }
}
```

---

## 5. Código legível e auto-documentado

Prefira código que se explica a comentários que explicam código confuso. Comentários ficam desatualizados; código não.

**Quando comentar:**
- O *porquê* de uma decisão não óbvia (não o *o quê*)
- Workarounds para bugs externos ou limitações de API
- Algoritmos não triviais com referência à fonte

**Quando não comentar:**
- O que o código claramente já diz
- Código que seria claro com um bom nome

```python
# Ruim — comentário explica código confuso
# incrementa i e verifica se chegou ao limite
i += 1
if i >= MAX:
    ...

# Bom — nome torna o comentário desnecessário
attempts += 1
if attempts >= MAX_RETRIES:
    ...

# Comentário válido — explica o porquê, não o quê
# A API do Stripe requer delay de 1s entre retentativas para evitar rate limit
time.sleep(1)
await stripe.retry_charge(charge_id)
```

---

## 6. Separação de responsabilidades

Cada módulo, classe ou arquivo deve ter **um motivo para mudar**. Misturar lógica de negócio com acesso a banco de dados, ou com formatação de resposta HTTP, cria código difícil de testar e de manter.

**Camadas comuns:**
- **Entrada** (controllers, routes, handlers): valida entrada, chama serviço, formata resposta
- **Lógica de negócio** (services, use cases): regras do domínio, orquestra operações
- **Acesso a dados** (repositories, DAOs): queries, mapeamento de entidades

```typescript
// Ruim — controller com lógica de negócio e query direta
app.post('/orders', async (req, res) => {
  const items = req.body.items;
  let total = 0;
  for (const item of items) {
    const product = await db.query(`SELECT * FROM products WHERE id = ${item.id}`);
    total += product.price * item.qty;
  }
  if (total > 10000) total *= 0.95; // desconto VIP
  const order = await db.query(`INSERT INTO orders...`);
  res.json(order);
});

// Bom — responsabilidades separadas
// routes/orders.ts
app.post('/orders', async (req, res) => {
  const order = await orderService.createOrder(req.body.items, req.user);
  res.status(201).json(order);
});

// services/orderService.ts
async function createOrder(items: OrderItem[], user: User): Promise<Order> {
  const total = await calculateTotal(items);
  const finalTotal = applyVipDiscount(total, user);
  return orderRepository.create({ items, total: finalTotal, userId: user.id });
}
```

---

## 7. Testes

Testes são a rede de segurança que permite refatorar e evoluir o código com confiança. Código sem teste é código que você tem medo de mexer.

**O que testar:**
- Caminhos felizes (o fluxo normal funciona)
- Casos de borda (zero, null, lista vazia, valor máximo)
- Casos de erro (o que acontece quando algo falha)

**Boas práticas:**
- Nomes de teste devem descrever o comportamento esperado: `deve retornar 404 quando usuário não existe`
- Um teste deve verificar uma única coisa
- Prefira testes de integração para lógica de negócio crítica; testes unitários para funções puras
- Não teste detalhes de implementação — teste comportamento observável

```python
# Ruim — nome genérico, testa múltiplas coisas
def test_user():
    user = create_user('alice', 'alice@example.com')
    assert user.name == 'alice'
    assert user.email == 'alice@example.com'
    user.deactivate()
    assert not user.is_active
    assert user.deactivated_at is not None

# Bom — cada teste tem foco e nome descritivo
def test_criar_usuario_define_nome_e_email():
    user = create_user('alice', 'alice@example.com')
    assert user.name == 'alice'
    assert user.email == 'alice@example.com'

def test_desativar_usuario_marca_como_inativo_com_timestamp():
    user = create_user('alice', 'alice@example.com')
    user.deactivate()
    assert not user.is_active
    assert user.deactivated_at is not None
```

---

## 8. Simplicidade e YAGNI

*You Aren't Gonna Need It* — não adicione abstração, configurabilidade ou generalização para necessidades hipotéticas. O melhor código para um requisito futuro que não existe é nenhum código.

**Sinais de complexidade desnecessária:**
- Factory de factory
- Configuração para situações que nunca vão variar
- Abstrações com apenas uma implementação
- Parâmetros flags que mudam o comportamento da função (`process(data, true, false, 3)`)

Escreva o código mais simples que resolve o problema atual. Refatore quando a complexidade real aparecer.

---

## Checklist rápido ao escrever ou revisar código

- [ ] Os nomes revelam a intenção sem precisar de comentário?
- [ ] Cada função faz uma única coisa?
- [ ] Há duplicação de lógica que poderia ser centralizada?
- [ ] Os erros são tratados explicitamente e com contexto?
- [ ] A lógica de negócio está separada da infraestrutura (DB, HTTP)?
- [ ] O código é testável — dependências injetáveis, sem estado global?
- [ ] Existe alguma complexidade que não está sendo exigida agora?
