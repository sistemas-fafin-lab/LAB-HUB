// Envs exigidas no load dos módulos (requireEnv). Valores fake: as chamadas a
// Supabase/FlowLab são mockadas nos testes; nada sai pela rede de verdade.
process.env.SUPABASE_URL ??= 'http://localhost/supabase'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role'
process.env.FLOWLAB_EDGE_FUNCTION_URL ??= 'http://flowlab.test/api/analises-clinicas'
process.env.FLOWLAB_API_KEY ??= 'test-flowlab-key'
process.env.FLOWLAB_WEBHOOK_SECRET ??= 'test-webhook-secret'
// Timeout curto p/ o teste de timeout do FlowLab não demorar.
process.env.FLOWLAB_TIMEOUT_MS ??= '100'
