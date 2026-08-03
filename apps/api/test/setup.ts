// Envs exigidas no load dos módulos (requireEnv). Valores fake: as chamadas a
// Supabase/FlowLab são mockadas nos testes; nada sai pela rede de verdade.
process.env.SUPABASE_URL ??= 'http://localhost/supabase'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role'
process.env.FLOWLAB_EDGE_FUNCTION_URL ??= 'http://flowlab.test/api/analises-clinicas'
process.env.FLOWLAB_API_KEY ??= 'test-flowlab-key'
process.env.FLOWLAB_WEBHOOK_SECRET ??= 'test-webhook-secret'
// Timeout curto p/ o teste de timeout do FlowLab não demorar.
process.env.FLOWLAB_TIMEOUT_MS ??= '100'
// Criptografia de coluna (S-06). A suíte roda COM chave de propósito: é o
// caminho de produção, e sem ela os testes exercitariam um fluxo que não existe
// mais em produção — o mesmo tipo de cegueira do mock que descartava o TTL.
// Chave fixa e derivada de uma frase: previsível para depuração, e obviamente
// não é segredo de ninguém.
process.env.PII_KEY_K1 ??= 'WF3631SjARkjUcTpi9piZLtHPjKZpav49JRXkw8IkrQ='

// LIS (ApLIS/AOL): os testes mockam o fetch, nada sai pela rede.
process.env.APLIS_BASE_URL ??= 'http://aplis.test/integracao.php'
process.env.AOL_BASE_URL ??= 'http://aol.test'
process.env.AOL_IDAGENTE ??= 'test-idagente'
process.env.AOL_SENHA ??= 'test-senha'
process.env.AOL_ENTIDADE ??= 'test-entidade'
