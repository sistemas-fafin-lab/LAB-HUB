## Problem Statement

Hoje a consulta administrativa de resultados por CPF (aba Resultados, modo admin) só funciona em ambiente local/dev: tanto a API quanto o web bloqueiam a funcionalidade categoricamente fora desse ambiente, independente de quem esteja logado. Isso significa que o único e-mail autorizado (`teste@gmail.com`) não consegue usar essa consulta contra a aplicação publicada em produção — só contra a API/o build rodando localmente.

O e-mail autorizado precisa poder acessar essa mesma consulta quando estiver usando a aplicação publicada em produção (API na VPS, web no Vercel), sem que isso abra a porta para qualquer outra conta.

## Solution

Substituir os dois bloqueios categóricos por ambiente (backend: `NODE_ENV === 'production'` nega sempre; frontend: exige `import.meta.env.DEV`) por uma checagem que combina duas condições, válidas em qualquer ambiente incluindo produção: (1) um disjuntor explícito (`ADMIN_RESULTS_ENABLED` na API, `VITE_ADMIN_RESULTS_ENABLED` no web) que precisa estar exatamente `"true"`, e (2) o e-mail da sessão autenticada bater com o e-mail autorizado (`ADMIN_EMAIL`/`VITE_ADMIN_EMAIL`). Ausência de qualquer uma das duas condições falha fechado, igual ao comportamento já estabelecido para configuração ausente.

O disjuntor fica desligado por padrão: a feature só liga em produção quando alguém define `ADMIN_RESULTS_ENABLED=true` explicitamente no ambiente do servidor (e o equivalente no Vercel), permitindo desligá-la a qualquer momento sem novo deploy de código.

Cada consulta administrativa bem-sucedida gera uma linha de log estruturado no backend, sem expor o CPF em claro, para dar visibilidade mínima de quando e por quem a consulta foi usada em produção.

## User Stories

1. Como administrador de testes (`teste@gmail.com`), quero acessar a consulta por CPF quando estiver usando a aplicação publicada em produção, para validar dados reais sem depender do ambiente local.
2. Como administrador de testes, quero que a consulta em produção use a mesma sessão autenticada do portal, para não precisar de um fluxo de login separado.
3. Como responsável pela aplicação, quero que a consulta administrativa continue desligada em produção até que eu ligue explicitamente o disjuntor, para que publicar em produção não libere a feature sem decisão consciente.
4. Como responsável pela aplicação, quero desligar a consulta administrativa em produção a qualquer momento mudando uma variável de ambiente, para não precisar reverter ou reimplantar código em caso de problema.
5. Como responsável pela aplicação, quero que o disjuntor sozinho não seja suficiente — o e-mail da sessão também precisa bater —, para que ligar o disjuntor não vire autorização geral.
6. Como responsável pela aplicação, quero poder trocar o e-mail autorizado em produção sem alterar código-fonte, para acomodar mudança de quem testa sem depender de um novo deploy.
7. Como usuário não autorizado em produção, quero que o campo administrativo continue completamente invisível, exatamente como já acontece em dev, para não ser induzido a consultar dados de terceiro.
8. Como usuário não autorizado que tente chamar o endpoint administrativo diretamente em produção, quero receber uma recusa, para que esconder o campo na interface não seja a única proteção.
9. Como responsável pela aplicação, quero que uma configuração ausente ou inválida do disjuntor ou do e-mail autorizado em produção falhe fechada, para que nenhuma combinação incompleta libere acesso por acidente.
10. Como responsável pela aplicação, quero que o comportamento em ambiente local/dev permaneça exatamente como está hoje, para que essa mudança não introduza regressão no fluxo já validado.
11. Como responsável pela aplicação, quero que cada consulta administrativa bem-sucedida gere uma linha de log estruturado no backend, para ter visibilidade mínima de uso em produção.
12. Como responsável pela aplicação, quero que esse log registre quem consultou (e-mail do administrador) e quando, sem registrar o CPF consultado em claro, para manter a mesma política de redação de identificadores já aplicada aos logs HTTP.
13. Como responsável pela aplicação, quero que tentativas negadas (disjuntor desligado, e-mail não autorizado, configuração ausente) não fiquem confundidas com sucesso no log, para diferenciar uso legítimo de tentativa de acesso indevido.
14. Como responsável pela aplicação, quero configurar o disjuntor e o e-mail autorizado da API através do `.env` já usado pelo `docker-compose.yml` da VPS, sem precisar alterar o `docker-compose.yml` em si, para reaproveitar o mecanismo de `env_file` já existente.
15. Como responsável pela aplicação, quero configurar o disjuntor e o e-mail autorizado do web através das variáveis de ambiente do projeto no Vercel, para manter o build de produção zero-config como está.
16. Como responsável pela aplicação, quero que nenhum segredo ou e-mail autorizado seja commitado no repositório, para manter a mesma política já aplicada em dev.
17. Como responsável pela aplicação, quero que os testes existentes que hoje afirmam "em produção sempre nega" sejam reescritos para o novo comportamento condicional, para que a suíte continue descrevendo o comportamento real.
18. Como responsável pela aplicação, quero que a suíte cubra as quatro combinações de disjuntor e e-mail em produção (ambos ok, só disjuntor, só e-mail, nenhum), para garantir que só a combinação completa autoriza.
19. Como responsável pela aplicação, quero que a suíte cubra o log de auditoria sendo emitido em sucesso e não emitido em falha, para travar esse contrato.
20. Como administrador de testes, quero que a experiência da consulta em produção (máscara de CPF, mensagens de erro, banner do paciente, botão Atualizar, retorno aos próprios resultados) seja idêntica à de dev, para não precisar aprender um fluxo novo.
21. Como responsável pela aplicação, quero que a consulta administrativa em produção continue restrita ao web, sem alcançar o app mobile, para manter o mesmo escopo já decidido em dev.
22. Como responsável pela aplicação, quero que essa mudança não crie tabela de administradores, role persistida ou tela de gestão de usuários, para manter a mesma decisão de escopo já tomada na versão de dev.
23. Como responsável pela aplicação, quero que a política de "somente cache, sem busca ao vivo no LIS" continue valendo em produção, para não introduzir latência ou efeito colateral novo ao habilitar produção.
24. Como responsável pela aplicação, quero uma lista clara dos nomes exatos das variáveis de ambiente que preciso configurar na VPS e no Vercel, para fazer essa configuração manualmente sem depender de acesso do agente a esses painéis.

## Implementation Decisions

- A API substituirá o retorno categórico de negação quando `NODE_ENV === 'production'` por uma checagem condicional: em produção, autoriza somente se `ADMIN_RESULTS_ENABLED` for exatamente a string `"true"` e o e-mail normalizado da sessão bater com `ADMIN_EMAIL`. Fora de produção, o comportamento atual (checagem de e-mail sem exigir o disjuntor) permanece inalterado.
- O web substituirá a exigência de `import.meta.env.DEV` por uma checagem equivalente usando `VITE_ADMIN_RESULTS_ENABLED` e `VITE_ADMIN_EMAIL`, preservando o comportamento atual em dev.
- O disjuntor é fail-safe: qualquer valor diferente de `"true"` (incluindo ausência da variável) é tratado como desligado. Não existe um estado "meio ligado".
- O e-mail autorizado continua sendo uma única string por ambiente, sem lista, sem papel/role persistido, sem tabela de administradores — mesma decisão já tomada para dev, agora também para produção. O valor pode ser alterado a qualquer momento apenas trocando a variável de ambiente, sem alterar código.
- Será adicionado um log estruturado no boundary da API, emitido em cada consulta administrativa autorizada com sucesso, contendo o e-mail do administrador e o horário, mas não o CPF consultado em claro — reaproveitando o mecanismo de redação de identificadores já existente nos logs HTTP. Tentativas negadas (disjuntor desligado, e-mail não autorizado) não geram essa linha de log de sucesso.
- Nenhuma tabela nova, nenhuma trilha de auditoria persistida no banco. O log é o único registro desta entrega.
- O `docker-compose.yml` da VPS não precisa mudar: `ADMIN_EMAIL` e `ADMIN_RESULTS_ENABLED` passam a existir no `.env` que já é referenciado via `env_file: .env`, e `NODE_ENV=production` continua fixo no bloco `environment:` do serviço `api`, sem alteração — a diferenciação de comportamento passa a estar inteiramente na lógica de autorização, não no valor de `NODE_ENV`.
- `VITE_ADMIN_EMAIL` e o novo `VITE_ADMIN_RESULTS_ENABLED` serão configurados como variáveis de ambiente do projeto no painel do Vercel (projeto "lab-hub"), sem necessidade de `vercel.json`.
- Nenhum arquivo `.env.production` será adicionado ao repositório; a configuração de produção continua vivendo fora do controle de versão, tanto na VPS quanto no Vercel.
- Fora dessas duas checagens (disjuntor + e-mail) e do log, nenhum outro comportamento da consulta administrativa muda: máscara de CPF, validação, mensagens de estado, banner, isolamento de estado, botão Atualizar e retorno aos próprios resultados seguem exatamente a especificação já implementada em `.scratch/consulta-dev-resultados-por-cpf/`.

## Testing Decisions

- Bons testes continuam observando comportamento externo nos boundaries da API e da tela, não os nomes internos das funções de autorização nem a estrutura privada do estado.
- O seam principal é o boundary HTTP do Fastify (injeção de requisição, mesmo padrão dos testes de admin já existentes na API). Ele deve cobrir, sob `NODE_ENV=production`: disjuntor ligado + e-mail correto (autoriza), disjuntor desligado + e-mail correto (nega), disjuntor ligado + e-mail incorreto (nega), disjuntor e e-mail ausentes (nega) — e a emissão (ou ausência) do log estruturado em cada um desses casos.
- O teste existente que hoje afirma "em produção, mesmo com o e-mail configurado e batendo, nega" será reescrito para refletir que produção agora autoriza quando o disjuntor também está ligado.
- O segundo seam é o helper/DOM da tela de resultados (mesmo padrão dos testes já existentes no web), cobrindo a mesma matriz de disjuntor + e-mail fora do modo de desenvolvimento.
- A regressão de dev deve confirmar que, sem o disjuntor definido, o comportamento fora de produção continua exatamente igual ao de hoje.
- Não é necessário harness end-to-end novo; os dois seams já cobrem o contrato.

## Out of Scope

- Criar tabela de administradores, papel/role persistido, múltiplos e-mails autorizados simultaneamente, ou tela de gestão de administradores.
- Auditoria persistida em banco (tabela dedicada ou equivalente); esta entrega usa somente log estruturado no backend.
- Alterar `docker-compose.yml`, `Dockerfile`, criar `vercel.json` ou qualquer outro arquivo de configuração de deploy versionado.
- Adicionar `.env.production` ou qualquer arquivo de segredo ao repositório.
- Executar as mudanças manuais de infraestrutura (editar o `.env` da VPS, configurar variáveis no painel do Vercel) — essa entrega cobre apenas o código; a configuração fica com o responsável pela aplicação.
- Habilitar a consulta administrativa no app mobile.
- Busca ao vivo no LIS, revalidação forçada ou qualquer mudança na política de cache já estabelecida.
- Qualquer mudança na experiência (máscara, mensagens, banner, isolamento de estado, botão Atualizar) além do necessário para o disjuntor e o e-mail funcionarem em produção.
- Rate limiting, alertas automáticos ou monitoramento adicional sobre o uso da consulta administrativa.

## Further Notes

- Variáveis de ambiente que precisam existir em produção, com os nomes exatos:
  - API (VPS, no `.env` ao lado do `docker-compose.yml`): `ADMIN_EMAIL` e `ADMIN_RESULTS_ENABLED`.
  - Web (Vercel, variáveis de ambiente do projeto "lab-hub"): `VITE_ADMIN_EMAIL` e `VITE_ADMIN_RESULTS_ENABLED`.
- Local e produção compartilham o mesmo projeto Supabase (`rhiopafwojxujghscavi.supabase.co`); não é necessário criar ou provisionar uma conta separada para `teste@gmail.com` em produção.
- Esta entrega é uma decisão consciente de manter e-mail único configurável por variável de ambiente em vez de autorização persistente — o spec anterior (`.scratch/consulta-dev-resultados-por-cpf/spec.md`) sugeria substituir por "autorização persistente" antes de habilitar produção; essa sugestão foi revisitada e descartada por decisão explícita: a restrição é permanente, mas o mecanismo (variável de ambiente) permanece o mesmo.
- O e-mail autorizado não é segredo, mas o controle efetivo permanece inteiramente no servidor; o valor exposto ao browser (`VITE_ADMIN_EMAIL`) nunca é uma barreira de segurança.
