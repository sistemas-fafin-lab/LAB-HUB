---
name: commit
description: Cria commits git com formato Conventional Commits. Use esta skill quando o usuário quiser commitar mudanças, fazer staging de arquivos, escrever mensagem de commit, ou invocar /commit. Gatilhos: "fazer commit", "commitar", "criar commit", "stage and commit", "git commit".
---

# Skill: commit

Auxilia na criação de commits git bem estruturados seguindo o padrão **Conventional Commits**.

---

## Workflow

Execute as fases em sequência. Rode os comandos das fases 1 e 2 em paralelo quando possível.

### Fase 1 — Inspecionar o estado do repositório

Execute em paralelo:
- `git status` — arquivos modificados, novos e deletados
- `git diff` — mudanças não staged
- `git diff --staged` — mudanças já staged
- `git log --oneline -5` — histórico recente para seguir o estilo de mensagem do projeto

### Fase 2 — Analisar as mudanças

Com base na inspeção:
1. Identifique o escopo e natureza das mudanças
2. Escolha o tipo de commit apropriado (ver tabela abaixo)
3. Elabore a mensagem de commit — foque no **por quê**, não no o quê
4. Verifique se há arquivos sensíveis entre as mudanças (ver regras de segurança)

### Fase 3 — Staging seletivo

Adicione apenas os arquivos relevantes para este commit. Mostre ao usuário quais arquivos serão staged antes de executar.

- Prefira nomear arquivos explicitamente: `git add src/auth.py tests/test_auth.py`
- Use `git add -p` se precisar staged apenas partes de um arquivo
- Nunca use `git add -A` ou `git add .` sem antes mostrar o que será incluído

### Fase 4 — Criar o commit

Use sempre HEREDOC para garantir formatação correta:

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <descrição curta>

<corpo opcional — explica motivação, contexto ou breaking changes>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Tipos de Commit (Conventional Commits)

| Tipo       | Quando usar |
|------------|-------------|
| `feat`     | Nova funcionalidade |
| `fix`      | Correção de bug |
| `refactor` | Reestruturação sem mudar comportamento |
| `docs`     | Documentação |
| `test`     | Adição ou correção de testes |
| `chore`    | Tarefas de manutenção (build, deps, configs) |
| `style`    | Formatação, espaços, sem mudança de lógica |
| `perf`     | Melhoria de performance |
| `ci`       | Configuração de CI/CD |

**Escopo** é opcional e indica a área afetada: `feat(auth)`, `fix(api)`, `chore(deps)`.

**Exemplos:**
```
feat(auth): adicionar autenticação via JWT
fix(api): corrigir retorno 500 em endpoint de usuários
refactor(db): extrair lógica de conexão para módulo separado
chore(deps): atualizar dependências para versões estáveis
```

---

## Regras de Segurança

- **Nunca** use `--no-verify` — se um hook falhar, investigue e corrija a causa raiz
- **Nunca** commite arquivos sensíveis: `.env`, `credentials.json`, chaves privadas, tokens. Avise o usuário se detectar esses arquivos
- **Nunca** use `git add -A` sem antes revisar o que será staged
- **Prefira** criar um novo commit a usar `--amend`, a menos que o usuário peça explicitamente
- Se o hook de pre-commit falhar, o commit **não aconteceu** — corrija o problema e crie um novo commit (não use `--amend`)
- Nunca faça force push em `main`/`master`

---

## Comportamento Esperado

Após executar o commit com sucesso, rode `git status` para confirmar e informe o usuário com o hash e mensagem do commit criado.

Se o usuário não especificou quais arquivos commitar, pergunte antes de prosseguir com o staging.
