-- =====================================================================
-- P-05 — Limites do bucket `laudos`, iguais aos do `documentos`
-- =====================================================================
--
-- Estado antes desta migration (lido em produção, somente leitura):
--
--   documentos | private | 10485760 | {image/jpeg,image/png,image/webp,application/pdf} | 27 objetos
--   laudos     | private |     null | null                                              |  0 objetos
--
-- A assimetria não tinha razão de ser. O risco imediato é baixo — o bucket é
-- privado e só o `service_role` escreve nele —, mas limite ausente é limite que
-- não existe no dia em que um caminho de escrita novo aparecer, e é justamente
-- o bucket que guarda laudo assinado.
--
-- `application/pdf` sozinho porque é o que o bucket foi criado para guardar
-- ("laudos/declarações (PDF)", migration 20260626120000). O bucket está VAZIO,
-- então nenhum objeto existente pode ser invalidado por esta restrição — ela só
-- vale daqui para a frente.
--
-- Se algum dia o laboratório mandar laudo em imagem, a correção é acrescentar o
-- tipo aqui — e não deixar o bucket aberto por precaução.
update storage.buckets
set
  file_size_limit = 10485760,           -- 10 MB, o mesmo de `documentos`
  allowed_mime_types = array['application/pdf']
where id = 'laudos';
