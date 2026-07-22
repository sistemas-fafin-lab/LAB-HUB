// Envs exigidas no load dos módulos (requireEnv). Valores fake: as chamadas a
// Supabase/FlowLab são mockadas nos testes; nada sai pela rede de verdade.
process.env.SUPABASE_URL ??= 'http://localhost/supabase'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role'
process.env.FLOWLAB_EDGE_FUNCTION_URL ??= 'http://flowlab.test/api/analises-clinicas'
process.env.FLOWLAB_API_KEY ??= 'test-flowlab-key'
process.env.FLOWLAB_WEBHOOK_SECRET ??= 'test-webhook-secret'
// Timeout curto p/ o teste de timeout do FlowLab não demorar.
process.env.FLOWLAB_TIMEOUT_MS ??= '100'
// LIS (ApLIS/AOL): os testes mockam o fetch, nada sai pela rede.
process.env.APLIS_BASE_URL ??= 'http://aplis.test/integracao.php'
process.env.AOL_BASE_URL ??= 'http://aol.test'
process.env.AOL_IDAGENTE ??= 'test-idagente'
process.env.AOL_SENHA ??= 'test-senha'
process.env.AOL_ENTIDADE ??= 'test-entidade'
