# 04: Regra para divergência entre PDF e `idOsLis`

**What to build:** Quando o PDF anexado diz que a O.S. é da requisição A e o `idOsLis` digitado no Álvaro diz que é da requisição B (do mesmo paciente), o portal mostra a O.S. no pedido certo, por uma regra definida — em vez de manter o que foi gravado primeiro.

Na medição de 24/11/2026 isso ocorreu em 5 de 76 O.S. (7%), sempre entre requisições do mesmo paciente. Não se sabe qual das duas fontes está certa.

**Blocked by:** 01 (a saída da auditoria lista os casos reais a examinar).

**Status:** needs-triage

- [ ] Os casos divergentes apontados pela auditoria foram examinados com a recepção, e a conclusão está nos comentários deste ticket.
- [ ] A regra de qual fonte vence está decidida e registrada na documentação dos laudos LIS.
- [ ] A busca ao vivo aplica a regra; o vínculo já gravado pela fonte perdedora é corrigido na revalidação seguinte.
- [ ] Toda correção de vínculo é logada com requisição de origem, requisição de destino e O.S.
- [ ] A regra nunca move uma O.S. para requisição de outro paciente: a conferência de CPF continua decidindo antes.
- [ ] Testes cobrem a regra nos dois sentidos e o caso de CPF divergente.

## Comments
