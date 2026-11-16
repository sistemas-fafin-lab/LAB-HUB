# 05 — Acesso: login, cadastro e recuperação

**What to build:** `AuthGate`, login, cadastro e recuperação de senha no visual novo (painel com `Grafismo`), sobre o Supabase Auth e as validações atuais (`validators`). Sem verificação em duas etapas, gov.br ou Google (fora do escopo).

**Blocked by:** 04 (shell)

**Status:** in-review

- [x] Login, cadastro e recuperação funcionam exatamente como hoje (mesmas chamadas, mesmas validações, mesmas mensagens de erro da API).
- [x] Erros aparecem junto ao campo; mostrar/esconder senha mantido.
- [x] Após login, volta para `next`.
- [x] Nenhum botão de 2FA/login social sem backend aparece.
- [ ] Conferência manual: 360/768/1024/1440 px, claro e escuro, Tab com foco visível e Esc, `prefers-reduced-motion`, estados carregando/vazio/erro, lado a lado com a tela do protótipo.
- [x] Testes da tela reescritos onde os seletores mudaram, cobrindo o mesmo comportamento; nenhum teste removido sem substituto.
- [x] Eventos do Umami e flags da tela inalterados (mesmos nomes, mesmos gatilhos).
- [x] Textos seguem a regra da spec (design, exceto preparo, LGPD, erros da API, comportamentos exclusivos do sistema atual; nada que prometa comportamento inexistente).
- [ ] `vitest`, `type-check`, `lint` e `build` verdes; revisão visual do autor do design e de comportamento do tech lead.

## Comments

- Implementado em `feat/portal-v2`. Telas em `pages/` (AuthGate, LoginPage, CadastroPage, **RecuperarSenhaPage**, **NovaSenhaPage**), moldura e peças em `components/acesso/` (raiz `.lh-v2`, painel com `Grafismo`). Saem `components/auth/*` e `styles/auth.css` (só o acesso usava).
- **Recuperação de senha não existia** (nem web nem mobile; só a mensagem de erro do `/cadastro` na API citava "Esqueci minha senha"). Decisão do usuário: implementar nesta issue sobre o Supabase Auth, só na web, sem mudar a API: "Esqueci minha senha" → `/entrar?modo=recuperar` → `resetPasswordForEmail(email, { redirectTo: <origem>/entrar?modo=nova-senha })` → o link do e-mail abre a sessão de recuperação e a tela "Crie uma nova senha" (`updateUser`), com a mesma política de senha do cadastro + confirmação. Sem sessão (link vencido/usado) → "Link inválido ou expirado" com "Pedir novo link". O App deixa `/entrar?modo=nova-senha` aberto mesmo com sessão (único modo da entrada usado logado).
- **Configuração necessária antes do deploy:** cadastrar `https://<domínio>/entrar?modo=nova-senha` (produção, preview e `http://localhost:5173/...`) em Supabase → Authentication → URL Configuration → Redirect URLs. Sem isso o Supabase manda para a Site URL e a nova senha não abre. Conferir também o template "Reset password".
- Só por e-mail (o design aceitava CPF): o login é por e-mail e o Supabase não acha conta por CPF. A confirmação diz "Se houver uma conta com …, enviamos um link" — o Supabase responde igual exista a conta ou não (sem enumeração) e não sabemos a validade configurada do link (o design dizia "30 minutos").
- O modo da entrada foi para a URL (`?modo=cadastro|recuperar|nova-senha`), mantendo o `next`. Abas trocam com `replaceState`; recuperar empilha (o voltar do navegador retorna ao login).
- Fora (sem backend): verificação em duas etapas, gov.br, Google, "Manter conectado", login por CPF, cadastro em 3 etapas com SMS, aceite de termos/opt-in. Cadastro segue um formulário só, com os campos (inclusive Sexo) e validações de hoje; ganhou a lista de requisitos da senha do design, gerada da mesma política (`REGRAS_SENHA` em `lib/validators.ts`, que agora também alimenta `validarSenha`).
- Textos: títulos, rótulos e botões do design; mantidos os atuais nos destaques do painel (o design prometia "Resultados em 24h", "Família em um só perfil"), no rodapé ("Conformidade com a LGPD", sem "ISO 27001"), nas mensagens de erro do Supabase/API e na confirmação de e-mail do cadastro.
- Umami: `login_submit`, `login_erro`, `cadastro_submit`, `cadastro_sucesso`, `cadastro_erro`, `tema_alternado` com os mesmos gatilhos e payloads. A recuperação não ganhou evento (fica para o produto decidir).
- DS: `Input` ganhou `id`/`name`/`autoComplete`/`inputMode`/`onBlur`, mensagem ligada por `aria-describedby`, slot `trailing` (botão do olho fora do `<label>`, para não entrar no nome do campo) e coluna `minmax(0,1fr)` (o input de data invadia a coluna vizinha a 360 px).
- Testes: não havia teste das telas de acesso. Novo `AuthGate.test.tsx` (25 casos: escritos primeiro contra a tela antiga como caracterização, depois mantidos verdes na nova; mais recuperação e nova senha). `App.test` cobre `/entrar?modo=nova-senha` com sessão e os demais modos seguindo o `next`.
- Conferido por screenshot (headless, harness fora do repo): 360/768/1024/1440, claro/escuro, erros nos campos, foco visível, sem rolagem horizontal a 360 px, `prefers-reduced-motion` (não há animação própria nestas telas; o nó do botão já respeita). Falta a revisão visual do autor do design e a de comportamento do tech lead, e testar o e-mail de recuperação de verdade num ambiente com a Redirect URL cadastrada.
- Revisão (padrões + spec) aplicada: textos do painel sem "compartilhe laudos com seu médico" (não existe, issue 18) e sem "status em tempo real" (virou "Acompanhe o andamento dos exames"); subtítulo da confirmação de recuperação neutro ("Confira sua caixa de entrada."); "link expirado" derivado da sessão a cada render; "Esqueci minha senha" com 44 px; `Btn` esconde o `iconRight` ao carregar.
- Em aberto para o tech lead: (1) `/entrar?modo=nova-senha` aceita qualquer sessão, não só a de recuperação — quem já está logado pode trocar a senha ali sem a atual. O Supabase permite o mesmo `updateUser` a qualquer sessão aberta; se o projeto ligar "Secure password change", o Supabase passa a exigir reautenticação fora da recuperação. (2) O botão do olho tem 36 px (cabe dentro do campo de 44 px), abaixo dos 44 px da regra de toque. (3) O teste do acesso duplica o cliente Supabase (é o backend de auth, papel do cliente `api`) e o analytics (para afirmar os eventos, como o App.test já faz).
- (2026-11-04) Nascimento do cadastro trocado do `type="date"` nativo pelo campo de texto com máscara DD/MM/AAAA do design (`formatarDataDigitada`). A data vai à API em YYYY-MM-DD como antes (`dataDigitadaParaIso`). A validação passou a recusar data fora do calendário (31/02, mês 13), ano incompleto e ano anterior a 1900 — antes o seletor nativo impedia isso. Mesmas mensagens ("Informe a data de nascimento", "Data inválida"). A regra de idade do design (menores de 18 como dependentes) não entrou: depende da issue 15.

- 2026-11-04: cadastro dividido nas 3 etapas do design (`EtapasCadastro` em `components/acesso/pecas.tsx`): 01 "Seus dados" (nome, CPF, nascimento, sexo, telefone, e-mail → "Continuar"), 02 "Senha" (senha + regras + "Confirmar senha" → "Criar conta", com "Voltar" que mantém os dados) e 03 "Confirmação" = tela "Confirme seu e-mail" (no lugar do código por SMS, que não temos). Abas só na etapa 1. Sem endpoint de pré-checagem, CPF/e-mail já cadastrados só aparecem como erro da API na etapa 2. Termos/opt-in continuam fora.
