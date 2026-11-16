# 02 — Log estruturado nas consultas admin bem-sucedidas

**What to build:** Cada consulta administrativa por CPF autorizada com sucesso, em qualquer ambiente, passa a gerar uma linha de log estruturado no backend contendo o e-mail do administrador e o horário da consulta, sem expor o CPF consultado em claro — reaproveitando o mecanismo de redação de identificadores já existente nos logs HTTP. Tentativas negadas (disjuntor desligado, e-mail não autorizado, configuração ausente) não geram essa linha de sucesso, para não confundir uso legítimo com tentativa de acesso indevido.

**Blocked by:** Nenhum bloqueio funcional — o log vale independentemente do disjuntor de produção do ticket 01. Sequenciado depois do 01 apenas para evitar tocar o mesmo trecho de código em paralelo.

**Status:** ready-for-agent

- [ ] Toda consulta administrativa autorizada com sucesso emite uma linha de log estruturado com o e-mail do administrador e o horário da consulta.
- [ ] O CPF consultado não aparece em claro nessa linha de log, seguindo a mesma política de redação já aplicada aos demais logs HTTP.
- [ ] Tentativas negadas (disjuntor desligado, e-mail não autorizado, configuração ausente) não emitem essa linha de log de sucesso.
- [ ] O log funciona tanto em produção quanto em local/dev, sempre que uma consulta administrativa for autorizada.
- [ ] A suíte cobre a emissão do log em caso de sucesso e a ausência dele em cada caso de negação.
- [ ] Nenhuma tabela nova nem trilha de auditoria persistida em banco é criada — o log é o único registro desta entrega.
