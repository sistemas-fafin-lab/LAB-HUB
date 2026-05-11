// ---------------------------------------------------------------------------
// Exam domain types — mobile source of truth
// ---------------------------------------------------------------------------
export interface ExamPanel {
  name:  string
  value: string
  ref:   string
  ok:    boolean
}

export interface Exam {
  id:        string
  name:      string
  short:     string
  date:      string
  fullDate:  string
  collected: string
  unit:      string
  address:   string
  doctor:    string
  crm:       string
  status:    'ready' | 'analyzing'
  summary:   string
  panels:    ExamPanel[]
}

// ---------------------------------------------------------------------------
// Mock exam data — mirrors EXAMS constant from base-from-claude/app.jsx
// ---------------------------------------------------------------------------
export const MOBILE_EXAMS: Exam[] = [
  {
    id:        'ex-001',
    name:      'Hemograma Completo',
    short:     'Hemograma e perfil lipídico',
    date:      '15 Out 2023',
    fullDate:  '15 de outubro de 2023',
    collected: 'Coletado em 15/10/2023 às 07:42',
    unit:      'Unidade Asa Sul',
    address:   'SGAS 915, Bloco B — Asa Sul, Brasília',
    doctor:    'Dr. Carlos Silva',
    crm:       'CRM/DF 24.871',
    status:    'ready',
    summary:   'Resultados dentro da referência. Colesterol LDL no limite superior.',
    panels: [
      { name: 'Hemoglobina',    value: '14,2 g/dL',      ref: '13,0 – 17,5',         ok: true  },
      { name: 'Hematócrito',    value: '42,1 %',          ref: '39 – 50',              ok: true  },
      { name: 'Leucócitos',     value: '6.800 /mm³',      ref: '4.000 – 10.000',       ok: true  },
      { name: 'Plaquetas',      value: '243.000 /mm³',    ref: '150.000 – 450.000',    ok: true  },
      { name: 'Colesterol LDL', value: '138 mg/dL',       ref: '< 130',                ok: false },
    ],
  },
  {
    id:        'ex-002',
    name:      'Glicemia em Jejum',
    short:     'Painel de glicose',
    date:      '02 Out 2023',
    fullDate:  '02 de outubro de 2023',
    collected: 'Coletado em 02/10/2023 às 06:55',
    unit:      'Unidade Águas Claras',
    address:   'Rua das Pitangueiras, Lt. 6 — Águas Claras, Brasília',
    doctor:    'Dra. Renata Moura',
    crm:       'CRM/DF 19.402',
    status:    'ready',
    summary:   'Glicemia normal em jejum.',
    panels: [
      { name: 'Glicose', value: '92 mg/dL', ref: '70 – 99', ok: true },
    ],
  },
  {
    id:        'ex-003',
    name:      'TSH e T4 Livre',
    short:     'Função tireoidiana',
    date:      '28 Set 2023',
    fullDate:  '28 de setembro de 2023',
    collected: 'Coletado em 28/09/2023 às 08:10',
    unit:      'Unidade Sudoeste',
    address:   'CLSW 102, Bloco A — Sudoeste, Brasília',
    doctor:    'Dr. Carlos Silva',
    crm:       'CRM/DF 24.871',
    status:    'analyzing',
    summary:   'Análise em andamento — previsão de liberação em 24h.',
    panels:    [],
  },
]
