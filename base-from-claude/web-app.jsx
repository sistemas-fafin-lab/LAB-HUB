/* global React */
const { useState, useEffect, useRef, useMemo } = React;

// ============================================================
// Lab Hub — Web (desktop) prototype
// Hybrid layout: global topbar + contextual sidebar.
// ============================================================

const WEB_EXAMS = [
{ id: "ex-001", name: "Hemograma Completo", category: "Sangue", date: "15 Out 2023", fullDate: "15 de outubro de 2023", unit: "Unidade Asa Sul", doctor: "Dr. Carlos Silva", crm: "CRM/DF 24.871", status: "ready",
  summary: "Resultados dentro da referência. Colesterol LDL no limite superior.",
  panels: [
  { name: "Hemoglobina", value: "14,2", unit: "g/dL", ref: "13,0 – 17,5", ok: true, trend: [13.4, 13.8, 14.0, 13.9, 14.2] },
  { name: "Hematócrito", value: "42,1", unit: "%", ref: "39 – 50", ok: true, trend: [40.1, 41.2, 41.8, 42.0, 42.1] },
  { name: "Leucócitos", value: "6.800", unit: "/mm³", ref: "4.000 – 10.000", ok: true, trend: [7100, 6900, 6500, 6700, 6800] },
  { name: "Plaquetas", value: "243.000", unit: "/mm³", ref: "150.000 – 450.000", ok: true, trend: [231, 238, 240, 244, 243] },
  { name: "Colesterol LDL", value: "138", unit: "mg/dL", ref: "< 130", ok: false, trend: [124, 128, 132, 135, 138] },
  { name: "Colesterol HDL", value: "52", unit: "mg/dL", ref: "> 40", ok: true, trend: [48, 50, 51, 52, 52] }]
},
{ id: "ex-002", name: "Glicemia em Jejum", category: "Bioquímica", date: "02 Out 2023", fullDate: "02 de outubro de 2023", unit: "Unidade Águas Claras", doctor: "Dra. Renata Moura", crm: "CRM/DF 19.402", status: "ready", summary: "Glicemia normal em jejum.", panels: [{ name: "Glicose", value: "92", unit: "mg/dL", ref: "70 – 99", ok: true, trend: [88, 90, 91, 92, 92] }] },
{ id: "ex-003", name: "TSH e T4 Livre", category: "Hormônios", date: "28 Set 2023", fullDate: "28 de setembro de 2023", unit: "Unidade Sudoeste", doctor: "Dr. Carlos Silva", crm: "CRM/DF 24.871", status: "analyzing", summary: "Análise em andamento — previsão de liberação em 24h.", panels: [] },
{ id: "ex-004", name: "Vitamina D, 25-Hidroxi", category: "Vitaminas", date: "12 Set 2023", fullDate: "12 de setembro de 2023", unit: "Unidade Asa Sul", doctor: "Dra. Renata Moura", crm: "CRM/DF 19.402", status: "ready", summary: "Nível adequado.", panels: [{ name: "Vitamina D", value: "38", unit: "ng/mL", ref: "30 – 100", ok: true, trend: [22, 28, 32, 36, 38] }] },
{ id: "ex-005", name: "Ureia e Creatinina", category: "Função renal", date: "05 Set 2023", fullDate: "05 de setembro de 2023", unit: "Unidade Sudoeste", doctor: "Dr. Carlos Silva", crm: "CRM/DF 24.871", status: "ready", summary: "Função renal preservada.", panels: [{ name: "Creatinina", value: "0,98", unit: "mg/dL", ref: "0,7 – 1,2", ok: true, trend: [0.95, 0.96, 0.97, 0.98, 0.98] }] }];


const DEPENDENTS = [
{ id: "p1", name: "João Madeiro", relation: "Você", initials: "JM", color: "from-blue-500 to-indigo-600" },
{ id: "p2", name: "Marina Madeiro", relation: "Esposa", initials: "MM", color: "from-rose-500 to-pink-600" },
{ id: "p3", name: "Tomás Madeiro", relation: "Filho", initials: "TM", color: "from-emerald-500 to-teal-600" }];


// ---------- Icon (lucide) ----------
function WIcon({ name, className = "w-5 h-5", strokeWidth = 2 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !window.lucide) return;
    ref.current.innerHTML = "";
    const el = document.createElement("i");
    el.setAttribute("data-lucide", name);
    el.className = className;
    ref.current.appendChild(el);
    window.lucide.createIcons({ attrs: { "stroke-width": strokeWidth } });
  }, [name, className, strokeWidth]);
  return <span ref={ref} className="inline-flex" />;
}

// ---------- Sparkline ----------
function Sparkline({ data, ok = true, width = 80, height = 28 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data),max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => `${i * stepX},${height - (v - min) / range * (height - 4) - 2}`).join(" ");
  const stroke = ok ? "#10b981" : "#f59e0b";
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(data.length - 1) * stepX} cy={height - (data[data.length - 1] - min) / range * (height - 4) - 2} r="2.5" fill={stroke} />
    </svg>);

}

// ---------- Status badge ----------
function WStatus({ status }) {
  if (status === "ready") return <span className="bg-green-100 text-green-800 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap">Liberado</span>;
  return <span className="bg-yellow-100 text-yellow-800 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />Em análise</span>;
}

// ============================================================
// Topbar
// ============================================================
function Topbar({ patient, onPickPatient, dark, onToggleDark, route, onNav }) {
  const [open, setOpen] = useState(false);
  return (
    <header className={`sticky top-0 z-40 border-b ${dark ? "bg-gray-900/85 border-gray-800" : "bg-white/85 border-gray-100"} backdrop-blur-md`}>
      <div className="px-6 h-16 flex items-center gap-4">
        <div className="flex items-center gap-2.5 mr-2">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-md shadow-blue-500/25">L</div>
          <div className="leading-tight">
            <div className={`font-black text-[15px] tracking-tight ${dark ? "text-white" : "text-slate-900"}`}>Lab Hub<span className="text-blue-500">.</span></div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-500/80 -mt-0.5">portal do paciente</div>
          </div>
        </div>

        {/* Search */}
        <div className={`flex-1 max-w-xl relative`}>
          <div className={`flex items-center gap-2 ${dark ? "bg-gray-800 border-gray-700 text-gray-300" : "bg-slate-50 border-gray-100 text-gray-500"} border rounded-xl px-3 h-10`}>
            <WIcon name="search" className="w-4 h-4" strokeWidth={2.2} />
            <input placeholder="Buscar exames, médicos, marcadores…" className="bg-transparent outline-none text-sm flex-1 placeholder:text-gray-400" />
            <kbd className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${dark ? "bg-gray-700 text-gray-400" : "bg-white border border-gray-200 text-gray-400"}`}>⌘K</kbd>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button onClick={onToggleDark} className={`h-10 w-10 rounded-xl flex items-center justify-center ${dark ? "bg-gray-800 text-gray-300 hover:bg-gray-700" : "bg-slate-50 text-gray-600 hover:bg-slate-100"} transition active:scale-95`}>
            <WIcon name={dark ? "sun" : "moon"} className="w-4 h-4" strokeWidth={2.2} />
          </button>
          <button className={`relative h-10 w-10 rounded-xl flex items-center justify-center ${dark ? "bg-gray-800 text-gray-300 hover:bg-gray-700" : "bg-slate-50 text-gray-600 hover:bg-slate-100"} transition active:scale-95`}>
            <WIcon name="bell" className="w-4 h-4" strokeWidth={2.2} />
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
          </button>

          {/* Patient switcher */}
          <div className="relative">
            <button onClick={() => setOpen((o) => !o)} className={`flex items-center gap-2 pl-1 pr-2 h-10 rounded-xl border ${dark ? "border-gray-700 bg-gray-800 hover:bg-gray-700" : "border-gray-100 bg-white hover:bg-slate-50"} transition active:scale-[0.98]`}>
              <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${patient.color} text-white text-xs font-bold flex items-center justify-center`}>{patient.initials}</div>
              <div className="text-left leading-tight pr-1">
                <div className={`text-[13px] font-semibold ${dark ? "text-white" : "text-slate-800"}`}>{patient.name.split(" ")[0]}</div>
                <div className="text-[10px] text-gray-400">{patient.relation}</div>
              </div>
              <WIcon name="chevron-down" className={`w-3.5 h-3.5 ${dark ? "text-gray-400" : "text-gray-400"}`} strokeWidth={2.4} />
            </button>
            {open &&
            <>
                <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
                <div className={`absolute right-0 top-12 w-72 rounded-2xl border shadow-xl z-40 p-2 ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}>
                  <div className="px-2 pt-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Perfil ativo</div>
                  {DEPENDENTS.map((d) =>
                <button key={d.id} onClick={() => {onPickPatient(d);setOpen(false);}} className={`w-full flex items-center gap-3 p-2 rounded-xl text-left transition ${patient.id === d.id ? dark ? "bg-blue-500/10" : "bg-blue-50" : dark ? "hover:bg-gray-800" : "hover:bg-slate-50"}`}>
                      <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${d.color} text-white text-xs font-bold flex items-center justify-center`}>{d.initials}</div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold truncate ${dark ? "text-white" : "text-slate-800"}`}>{d.name}</div>
                        <div className="text-[11px] text-gray-400">{d.relation}</div>
                      </div>
                      {patient.id === d.id && <WIcon name="check" className="w-4 h-4 text-blue-600" strokeWidth={2.6} />}
                    </button>
                )}
                  <div className={`mt-1 pt-1 border-t ${dark ? "border-gray-800" : "border-gray-100"}`}>
                    <button className={`w-full flex items-center gap-2 p-2 rounded-xl text-sm font-medium ${dark ? "text-gray-300 hover:bg-gray-800" : "text-slate-700 hover:bg-slate-50"}`}>
                      <WIcon name="user-plus" className="w-4 h-4" strokeWidth={2.2} />
                      Adicionar dependente
                    </button>
                  </div>
                </div>
              </>
            }
          </div>
        </div>
      </div>
    </header>);

}

// ============================================================
// Contextual sidebar
// ============================================================
function Sidebar({ route, onNav, dark }) {
  const sections = [
  { title: "Operações", items: [
    { id: "home", label: "Visão geral", icon: "layout-dashboard" },
    { id: "results", label: "Resultados", icon: "file-text", badge: "12" },
    { id: "schedule", label: "Agendar coleta", icon: "calendar-plus" },
    { id: "trends", label: "Tendências", icon: "trending-up" }]
  },
  { title: "Conta", items: [
    { id: "profile", label: "Perfil", icon: "user-round" },
    { id: "documents", label: "Documentos", icon: "folder" },
    { id: "billing", label: "Faturamento", icon: "receipt" },
    { id: "settings", label: "Configurações", icon: "settings" }]
  }];

  return (
    <aside className={`w-60 shrink-0 border-r ${dark ? "bg-gray-900/60 border-gray-800" : "bg-white/60 border-gray-100"} backdrop-blur-sm sticky top-16 self-start h-[calc(100vh-4rem)] overflow-y-auto`}>
      <nav className="p-3 flex flex-col gap-5">
        {sections.map((s) =>
        <div key={s.title}>
            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">{s.title}</div>
            <div className="flex flex-col gap-0.5">
              {s.items.map((it) => {
              const active = route === it.id;
              return (
                <button key={it.id} onClick={() => onNav(it.id)} className={`group flex items-center gap-3 px-3 h-9 rounded-xl text-sm font-medium transition active:scale-[0.98] ${active ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/25" : dark ? "text-gray-300 hover:bg-gray-800" : "text-slate-600 hover:bg-slate-50"}`}>
                    <WIcon name={it.icon} className="w-4 h-4" strokeWidth={active ? 2.4 : 2} />
                    <span className="flex-1 text-left">{it.label}</span>
                    {it.badge && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${active ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"}`}>{it.badge}</span>}
                  </button>);

            })}
            </div>
          </div>
        )}

        <div className={`mt-2 mx-1 p-3 rounded-2xl bg-gradient-to-br from-blue-900 via-blue-700 to-indigo-800 text-white relative overflow-hidden`}>
          <div className="absolute -bottom-4 -right-4 opacity-15"><WIcon name="sparkles" className="w-20 h-20" strokeWidth={1.4} /></div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-blue-200 mb-1">Lab Hub Plus</div>
          <div className="text-sm font-semibold leading-snug mb-2">Acompanhamento contínuo dos seus marcadores</div>
          <button className="text-[11px] font-bold bg-white text-blue-700 rounded-lg px-2.5 py-1 inline-flex items-center gap-1">Conhecer <WIcon name="arrow-right" className="w-3 h-3" strokeWidth={2.6} /></button>
        </div>
      </nav>
    </aside>);

}

// ============================================================
// KPIs
// ============================================================
function KPI({ icon, label, value, sub, tone, dark, trend }) {
  const toneMap = {
    blue: "from-blue-500 to-indigo-600 text-white",
    green: "from-emerald-500 to-teal-600 text-white",
    amber: "from-amber-500 to-orange-500 text-white",
    violet: "from-violet-500 to-purple-600 text-white"
  };
  return (
    <div className={`rounded-2xl p-5 border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"} shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${toneMap[tone]} flex items-center justify-center shadow-md`}>
          <WIcon name={icon} className="w-5 h-5" strokeWidth={2.2} />
        </div>
        {trend && <Sparkline data={trend} ok={true} width={72} height={24} />}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${dark ? "text-white" : "text-slate-900"}`} style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}>{value}</div>
      <div className={`text-xs font-medium ${dark ? "text-gray-400" : "text-gray-500"} mt-0.5`}>{label}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-1">{sub}</div>}
    </div>);

}

// ============================================================
// Hero (web)
// ============================================================
function WebHero({ exam, onOpen, dark }) {
  return (
    <div className="rounded-3xl p-7 text-white relative overflow-hidden shadow-lg shadow-blue-900/20 bg-gradient-to-br from-blue-900 via-blue-700 to-indigo-800">
      <div className="absolute -top-16 -right-12 w-64 h-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-12 w-72 h-72 rounded-full bg-indigo-300/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-8 -right-4 opacity-10 pointer-events-none"><WIcon name="file-text" className="w-56 h-56" strokeWidth={1.2} /></div>

      <div className="relative grid grid-cols-[1fr_auto] gap-6 items-end">
        <div>
          <div className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1 mb-4 text-[11px] font-semibold tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />Resultado disponível
          </div>
          <h2 className="font-bold text-2xl leading-tight mb-1" style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif", color: "rgb(255, 255, 255)" }}><span style={{ color: "rgb(255, 255, 255)" }}>Seu último exame está pronto</span></h2>
          <p className="text-blue-100 text-sm mb-5 leading-snug max-w-md">{exam.name} — coletado em {exam.fullDate}, na {exam.unit}.</p>
          <div className="flex items-center gap-3">
            <button onClick={onOpen} className="bg-white text-blue-700 rounded-xl px-4 py-2.5 font-semibold text-sm inline-flex items-center gap-2 active:scale-95 transition hover:shadow-lg">Ver resultado completo<WIcon name="arrow-right" className="w-4 h-4" strokeWidth={2.4} /></button>
            <button className="text-white/90 rounded-xl px-3 py-2.5 font-medium text-sm inline-flex items-center gap-2 hover:bg-white/10 transition"><WIcon name="download" className="w-4 h-4" strokeWidth={2.2} />Baixar PDF</button>
          </div>
        </div>

        {/* Mini summary */}
        <div className="hidden lg:grid grid-cols-2 gap-2 min-w-[260px]">
          {exam.panels.slice(0, 4).map((p) =>
          <div key={p.name} className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10">
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-100/80 truncate">{p.name}</div>
              <div className="text-base font-bold tabular-nums">{p.value}<span className="text-[10px] font-medium ml-1 text-blue-100/80">{p.unit}</span></div>
            </div>
          )}
        </div>
      </div>
    </div>);

}

// ============================================================
// Trend chart (multi-line, simple)
// ============================================================
function TrendChart({ panels, dark }) {
  const palette = ["#3b82f6", "#10b981", "#f59e0b", "#6366f1"];
  const months = ["Mai", "Jun", "Jul", "Ago", "Set"];
  const W = 560,H = 200,padL = 38,padR = 12,padT = 16,padB = 28;
  const innerW = W - padL - padR,innerH = H - padT - padB;
  const lines = panels.slice(0, 4).map((p, i) => {
    const data = p.trend;
    const min = Math.min(...data),max = Math.max(...data);
    const range = max - min || 1;
    const stepX = innerW / (data.length - 1);
    const pts = data.map((v, j) => ({ x: padL + j * stepX, y: padT + innerH - (v - min) / range * innerH }));
    return { name: p.name, color: palette[i % palette.length], pts };
  });
  return (
    <div className={`rounded-2xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"} p-5 shadow-sm`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-800"}`}>Tendência dos marcadores</h3>
          <p className="text-xs text-gray-400">Últimos 5 meses · normalizado</p>
        </div>
        <button className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${dark ? "bg-gray-800 text-gray-300" : "bg-slate-50 text-slate-600"}`}>5M</button>
      </div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
        {[0, 0.25, 0.5, 0.75, 1].map((t) =>
        <line key={t} x1={padL} x2={W - padR} y1={padT + innerH * t} y2={padT + innerH * t} stroke={dark ? "#1f2937" : "#f1f5f9"} strokeWidth="1" />
        )}
        {months.map((m, i) =>
        <text key={m} x={padL + innerW / (months.length - 1) * i} y={H - 8} textAnchor="middle" fontSize="10" fill={dark ? "#6b7280" : "#9ca3af"} fontFamily="Inter">{m}</text>
        )}
        {lines.map((l, i) =>
        <g key={l.name}>
            <polyline points={l.pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={l.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {l.pts.map((p, j) => <circle key={j} cx={p.x} cy={p.y} r={j === l.pts.length - 1 ? 3.5 : 0} fill={l.color} />)}
          </g>
        )}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {lines.map((l) =>
        <div key={l.name} className="flex items-center gap-1.5 text-[11px]">
            <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
            <span className={dark ? "text-gray-300" : "text-slate-600"}>{l.name}</span>
          </div>
        )}
      </div>
    </div>);

}

// ============================================================
// Exam list row (web table-style)
// ============================================================
function ExamRow({ exam, onClick, dark }) {
  return (
    <button onClick={onClick} className={`w-full grid grid-cols-[auto_1.6fr_1fr_1fr_auto_auto] items-center gap-4 px-4 py-3 rounded-xl text-left transition border ${dark ? "border-gray-800 hover:bg-gray-800/50" : "border-gray-100 hover:bg-slate-50"} active:scale-[0.995]`}>
      <div className={`h-10 w-10 rounded-xl ${exam.status === "ready" ? "bg-blue-50 text-blue-600" : "bg-yellow-50 text-yellow-600"} flex items-center justify-center shrink-0`}>
        <WIcon name={exam.status === "ready" ? "file-check-2" : "file-clock"} className="w-5 h-5" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <div className={`text-sm font-semibold truncate ${dark ? "text-white" : "text-slate-800"}`}>{exam.name}</div>
        <div className="text-[11px] text-gray-400 truncate">{exam.category}</div>
      </div>
      <div className={`text-xs ${dark ? "text-gray-300" : "text-gray-600"} truncate`}>{exam.doctor}</div>
      <div className={`text-xs ${dark ? "text-gray-400" : "text-gray-500"} truncate`}>{exam.unit} · {exam.date}</div>
      <WStatus status={exam.status} />
      <WIcon name="chevron-right" className="w-4 h-4 text-gray-300" strokeWidth={2} />
    </button>);

}

// ============================================================
// Pages
// ============================================================
function HomePage({ dark, onOpenExam }) {
  const last = WEB_EXAMS[0];
  return (
    <div className="grid grid-cols-12 gap-5">
      {/* Greeting */}
      <div className="col-span-12">
        <p className={`text-sm ${dark ? "text-gray-400" : "text-gray-500"}`}>Bom dia,</p>
        <h1 className={`text-3xl font-bold ${dark ? "text-white" : "text-slate-900"}`} style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}>Que bom te ver de volta.</h1>
        <p className={`text-sm mt-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>Aqui está um resumo dos seus exames mais recentes.</p>
      </div>

      {/* Hero + side */}
      <div className="col-span-12 lg:col-span-8">
        <WebHero exam={last} onOpen={() => onOpenExam(last)} dark={dark} />
      </div>
      <div className="col-span-12 lg:col-span-4">
        <div className={`rounded-2xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"} p-5 shadow-sm h-full`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-800"}`}>Acompanhamento</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">Ativo</span>
          </div>
          <div className="flex flex-col gap-3">
            {[
            { label: "Colesterol LDL", note: "Acima da referência", icon: "trending-up", tone: "amber" },
            { label: "Vitamina D", note: "Subindo após suplementação", icon: "trending-up", tone: "green" },
            { label: "Glicemia", note: "Estável há 3 meses", icon: "minus", tone: "blue" }].
            map((i) =>
            <div key={i.label} className={`flex items-center gap-3 p-2.5 rounded-xl ${dark ? "bg-gray-800/50" : "bg-slate-50"}`}>
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${i.tone === "amber" ? "bg-amber-100 text-amber-600" : i.tone === "green" ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"}`}>
                  <WIcon name={i.icon} className="w-4 h-4" strokeWidth={2.4} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-semibold truncate ${dark ? "text-white" : "text-slate-800"}`}>{i.label}</div>
                  <div className="text-[11px] text-gray-400 truncate">{i.note}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="col-span-12 lg:col-span-7">
        <div className={`rounded-2xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"} p-5 shadow-sm`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-800"}`}>Próximos passos</h3>
          </div>
          <div className="flex flex-col gap-2">
            {[
            { icon: "calendar-plus", title: "Agendar nova coleta", sub: "Próxima recomendada: 06 Mai", action: "Agendar" },
            { icon: "send", title: "Compartilhar com médico", sub: "Dr. Carlos Silva — última troca há 2 sem.", action: "Enviar" },
            { icon: "download", title: "Baixar todos os laudos", sub: "ZIP com 12 PDFs · 4,2 MB", action: "Baixar" }].
            map((s, i) =>
            <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${dark ? "border-gray-800 hover:bg-gray-800/50" : "border-gray-100 hover:bg-slate-50"} transition`}>
                <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><WIcon name={s.icon} className="w-4 h-4" strokeWidth={2.2} /></div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold truncate ${dark ? "text-white" : "text-slate-800"}`}>{s.title}</div>
                  <div className="text-[11px] text-gray-400 truncate">{s.sub}</div>
                </div>
                <button className="text-xs font-semibold text-blue-600 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 transition">{s.action}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent exams list */}
      <div className="col-span-12">
        <div className={`rounded-2xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"} p-5 shadow-sm`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-800"}`}>Exames recentes</h3>
            <div className="flex items-center gap-2">
              <button className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${dark ? "border-gray-700 text-gray-300" : "border-gray-200 text-gray-600"}`}><WIcon name="filter" className="w-3.5 h-3.5 inline mr-1" strokeWidth={2.2} />Filtrar</button>
              <button className="text-xs font-semibold text-blue-600">Ver todos</button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            {WEB_EXAMS.map((e) => <ExamRow key={e.id} exam={e} onClick={() => onOpenExam(e)} dark={dark} />)}
          </div>
        </div>
      </div>
    </div>);

}

function ExamDetailPage({ exam, onBack, dark, onViewLaudo }) {
  return (
    <div className="max-w-5xl mx-auto">
      <button onClick={onBack} className={`inline-flex items-center gap-1.5 text-sm font-medium mb-4 ${dark ? "text-gray-300 hover:text-white" : "text-slate-600 hover:text-slate-900"}`}>
        <WIcon name="arrow-left" className="w-4 h-4" strokeWidth={2.2} />Voltar para visão geral
      </button>

      <div className={`rounded-2xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"} p-6 shadow-sm mb-5`}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <WStatus status={exam.status} />
              <span className="text-xs text-gray-400">#{exam.id.toUpperCase()}</span>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-400">{exam.category}</span>
            </div>
            <h1 className={`text-2xl font-bold ${dark ? "text-white" : "text-slate-900"}`} style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}>{exam.name}</h1>
            <p className="text-sm text-gray-500 mt-1">{exam.fullDate} · {exam.unit} · {exam.doctor} ({exam.crm})</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onViewLaudo} className="bg-blue-50 text-blue-600 rounded-xl px-3 py-2 text-sm font-medium inline-flex items-center gap-1.5 hover:bg-blue-100"><WIcon name="file-text" className="w-4 h-4" strokeWidth={2.2} />Ver laudo</button>
            <button className="bg-blue-600 text-white rounded-xl px-3 py-2 text-sm font-semibold inline-flex items-center gap-1.5 shadow-md shadow-blue-500/25 hover:bg-blue-700"><WIcon name="download" className="w-4 h-4" strokeWidth={2.2} />Baixar PDF</button>
          </div>
        </div>

        {exam.summary &&
        <div className={`rounded-xl border ${dark ? "border-blue-500/20 bg-blue-500/5" : "border-blue-100 bg-blue-50/60"} p-4 flex gap-3`}>
            <div className="h-8 w-8 rounded-lg bg-white text-blue-600 flex items-center justify-center shrink-0 shadow-sm"><WIcon name="sparkles" className="w-4 h-4" strokeWidth={2.2} /></div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-0.5">Resumo</div>
              <p className={`text-sm leading-snug ${dark ? "text-gray-200" : "text-slate-700"}`}>{exam.summary}</p>
            </div>
          </div>
        }
      </div>

      {exam.panels.length > 0 &&
      <div className={`rounded-2xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"} p-5 shadow-sm`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-800"}`}>Marcadores</h3>
            <span className="text-xs text-gray-400">{exam.panels.length} marcadores</span>
          </div>
          <div className={`grid grid-cols-[2fr_1fr_1fr_auto_1fr] gap-4 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b ${dark ? "border-gray-800" : "border-gray-100"}`}>
            <span>Marcador</span><span>Resultado</span><span>Referência</span><span>Status</span><span>Tendência</span>
          </div>
          {exam.panels.map((p, i) =>
        <div key={p.name} className={`grid grid-cols-[2fr_1fr_1fr_auto_1fr] gap-4 items-center px-4 py-3 ${i !== exam.panels.length - 1 ? `border-b ${dark ? "border-gray-800" : "border-gray-50"}` : ""}`}>
              <div className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-800"}`}>{p.name}</div>
              <div className={`text-sm font-bold tabular-nums ${p.ok ? dark ? "text-white" : "text-slate-900" : "text-amber-600"}`}>{p.value} <span className="text-[11px] font-medium text-gray-400">{p.unit}</span></div>
              <div className="text-xs text-gray-500">{p.ref}</div>
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${p.ok ? "bg-green-500" : "bg-amber-500"}`} />
                <span className={`text-xs font-medium ${p.ok ? dark ? "text-emerald-400" : "text-emerald-700" : "text-amber-700"}`}>{p.ok ? "Normal" : "Atenção"}</span>
              </div>
              <Sparkline data={p.trend} ok={p.ok} width={90} height={26} />
            </div>
        )}
        </div>
      }
    </div>);

}

function SchedulePage({ dark }) {
  const slots = [
  { date: "Hoje, 5 Mai", times: ["14:30", "15:00", "16:15"] },
  { date: "Amanhã, 6 Mai", times: ["07:00", "07:30", "08:00", "09:15", "10:30", "11:00"] },
  { date: "Sex, 8 Mai", times: ["07:00", "08:30", "10:00", "13:30"] }];

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className={`text-2xl font-bold mb-1 ${dark ? "text-white" : "text-slate-900"}`} style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}>Agendar coleta</h1>
      <p className="text-sm text-gray-500 mb-5">Selecione a unidade, data e horário disponíveis.</p>

      <div className={`rounded-2xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"} p-5 shadow-sm mb-5`}>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Unidade selecionada</div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><WIcon name="map-pin" className="w-5 h-5" strokeWidth={2.2} /></div>
          <div className="flex-1">
            <div className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-800"}`}>Unidade Asa Sul · SGAS 915, Bloco B</div>
            <div className="text-xs text-gray-500">Asa Sul, Brasília · DF · 2,4 km</div>
          </div>
          <button className="text-xs font-semibold text-blue-600 px-3 py-1.5 bg-blue-50 rounded-lg">Trocar unidade</button>
        </div>
      </div>

      {slots.map((s) =>
      <div key={s.date} className="mb-5">
          <div className={`text-sm font-semibold mb-2 ${dark ? "text-gray-300" : "text-slate-700"}`}>{s.date}</div>
          <div className="grid grid-cols-6 gap-2">
            {s.times.map((t) =>
          <button key={t} className={`rounded-xl py-2.5 text-sm font-semibold transition active:scale-95 border ${dark ? "border-gray-800 bg-gray-900 text-gray-200 hover:border-blue-500 hover:bg-blue-500/10" : "border-gray-100 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"}`}>{t}</button>
          )}
          </div>
        </div>
      )}
    </div>);

}

function ProfilePage({ patient, dark }) {
  const fields = [
  { label: "Nome completo", value: patient.name },
  { label: "CPF", value: "•••.•••.123-45" },
  { label: "Data de nascimento", value: "12/03/1989" },
  { label: "Email", value: "joao.madeiro@email.com" },
  { label: "Telefone", value: "(61) 9 9123-4567" },
  { label: "Convênio", value: "Unimed · Plano Premium" }];

  return (
    <div className="max-w-4xl mx-auto">
      <div className={`rounded-2xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"} p-6 shadow-sm mb-5 flex items-center gap-5`}>
        <div className={`h-20 w-20 rounded-2xl bg-gradient-to-br ${patient.color} text-white text-2xl font-bold flex items-center justify-center shadow-lg shadow-blue-500/25`}>{patient.initials}</div>
        <div className="flex-1">
          <h1 className={`text-2xl font-bold ${dark ? "text-white" : "text-slate-900"}`} style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}>{patient.name}</h1>
          <p className="text-sm text-gray-500">{patient.relation} · Plano Premium · Unimed</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 rounded-full px-2.5 py-1 text-[11px] font-semibold"><WIcon name="shield-check" className="w-3 h-3" strokeWidth={2.6} />Conta verificada</span>
            <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 rounded-full px-2.5 py-1 text-[11px] font-semibold"><WIcon name="bell" className="w-3 h-3" strokeWidth={2.6} />Notificações ativas</span>
          </div>
        </div>
        <button className="bg-blue-600 text-white rounded-xl px-3 py-2 text-sm font-semibold inline-flex items-center gap-1.5 shadow-md shadow-blue-500/25 hover:bg-blue-700"><WIcon name="pencil" className="w-4 h-4" strokeWidth={2.2} />Editar</button>
      </div>

      <div className={`rounded-2xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"} p-5 shadow-sm`}>
        <h3 className={`text-sm font-semibold mb-4 ${dark ? "text-white" : "text-slate-800"}`}>Dados pessoais</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          {fields.map((f) =>
          <div key={f.label}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{f.label}</div>
              <div className={`text-sm font-medium ${dark ? "text-gray-200" : "text-slate-800"}`}>{f.value}</div>
            </div>
          )}
        </div>
      </div>
    </div>);

}

// ============================================================
// Support chat dock
// ============================================================
function SupportDock({ dark }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
  { from: "agent", text: "Olá, João! Sou a Lia, sua assistente do Lab Hub. Em que posso ajudar?" }]
  );
  const [draft, setDraft] = useState("");
  const send = () => {
    if (!draft.trim()) return;
    setMessages((m) => [...m, { from: "user", text: draft }]);
    setDraft("");
    setTimeout(() => setMessages((m) => [...m, { from: "agent", text: "Anotado! Vou verificar isso e já te respondo." }]), 700);
  };
  return (
    <div className="fixed bottom-5 right-5 z-30">
      {open &&
      <div className={`mb-3 w-[340px] rounded-2xl shadow-2xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"} overflow-hidden flex flex-col`} style={{ height: 440 }}>
          <div className="bg-gradient-to-br from-blue-900 via-blue-700 to-indigo-800 p-4 text-white relative overflow-hidden">
            <div className="absolute -bottom-6 -right-6 opacity-10"><WIcon name="message-circle" className="w-24 h-24" strokeWidth={1.4} /></div>
            <div className="flex items-start gap-3 relative">
              <div className="h-10 w-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center"><WIcon name="sparkles" className="w-5 h-5" strokeWidth={2.2} /></div>
              <div className="flex-1">
                <div className="text-sm font-bold">Lia · Suporte Lab Hub</div>
                <div className="text-[11px] text-blue-100/80 inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />Online · responde em 1 min</div>
              </div>
              <button onClick={() => setOpen(false)} className="h-8 w-8 rounded-lg hover:bg-white/10 flex items-center justify-center"><WIcon name="x" className="w-4 h-4" strokeWidth={2.4} /></button>
            </div>
          </div>
          <div className={`flex-1 overflow-y-auto p-4 flex flex-col gap-2 ${dark ? "bg-gray-900" : "bg-slate-50"}`}>
            {messages.map((m, i) =>
          <div key={i} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug ${m.from === "user" ? "bg-blue-600 text-white self-end rounded-br-md" : dark ? "bg-gray-800 text-gray-100 self-start rounded-bl-md" : "bg-white text-slate-800 border border-gray-100 self-start rounded-bl-md"}`}>{m.text}</div>
          )}
          </div>
          <div className={`p-3 border-t ${dark ? "border-gray-800 bg-gray-900" : "border-gray-100 bg-white"} flex items-center gap-2`}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Escreva sua mensagem…" className={`flex-1 text-sm rounded-xl px-3 h-9 outline-none border ${dark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-slate-50 border-gray-100 text-slate-800 placeholder:text-gray-400"} focus:border-blue-500`} />
            <button onClick={send} className="h-9 w-9 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:scale-95"><WIcon name="send" className="w-4 h-4" strokeWidth={2.4} /></button>
          </div>
        </div>
      }
      <button onClick={() => setOpen((o) => !o)} className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-xl shadow-blue-500/40 hover:shadow-2xl hover:scale-105 active:scale-95 transition relative">
        <WIcon name={open ? "x" : "message-circle"} className="w-6 h-6" strokeWidth={2.2} />
        {!open && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white" />}
      </button>
    </div>);

}

// ============================================================
// App shell
// ============================================================
function LabHubWebApp({ tweaks, setTweak }) {
  const [route, setRoute] = useState("home");
  const [openExam, setOpenExam] = useState(null);
  const [patient, setPatient] = useState(() => ({ ...DEPENDENTS[0], name: tweaks.patientName || DEPENDENTS[0].name }));

  useEffect(() => {
    setPatient((p) => ({ ...p, name: tweaks.patientName || p.name }));
  }, [tweaks.patientName]);

  useEffect(() => {
    if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 2 } });
  });

  const dark = tweaks.theme === "dark";
  const layout = tweaks.layout || "hybrid";

  const handleNav = (id) => {setRoute(id);setOpenExam(null);};
  const handleOpenExam = (e) => {setOpenExam(e);setRoute("exam");};
  const handleBack = () => {setOpenExam(null);setRoute("home");};

  const content = route === "laudo" && openExam ?
  <LaudoPage exam={openExam} onBack={handleBack} dark={dark} /> :
  openExam ?
  <ExamDetailPage exam={openExam} onBack={handleBack} dark={dark} onViewLaudo={() => setRoute("laudo")} /> :
  route === "results" ? <ResultsPage dark={dark} onOpenExam={handleOpenExam} /> :
  route === "schedule" ? <SchedulePage dark={dark} /> :
  route === "trends" ? <TrendsPage dark={dark} /> :
  route === "documents" ? <DocumentsPage dark={dark} /> :
  route === "billing" ? <BillingPage dark={dark} /> :
  route === "settings" ? <SettingsPage dark={dark} /> :
  route === "profile" ? <ProfilePage patient={patient} dark={dark} /> :
  <HomePage dark={dark} onOpenExam={handleOpenExam} onNav={handleNav} patient={patient} />;

  return (
    <div className={`min-h-screen w-full ${dark ? "bg-gray-950 text-gray-100" : "bg-slate-50 text-slate-900"}`} data-screen-label="01 Lab Hub Web">
      <Topbar patient={patient} onPickPatient={setPatient} dark={dark} onToggleDark={() => setTweak("theme", dark ? "light" : "dark")} route={route} onNav={handleNav} />
      <div className="flex">
        {layout !== "topbar-only" && <Sidebar route={route} onNav={handleNav} dark={dark} />}
        <main className="flex-1 min-w-0 p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {content}
          </div>
        </main>
      </div>
      <SupportDock dark={dark} />
    </div>);

}

// ============================================================
// Results page (overrides ResultsPage symbol used in shell)
// ============================================================
function ResultsPage({ dark, onOpenExam }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const filtered = WEB_EXAMS.filter(e => (filter === "all" || e.status === filter) && (e.name.toLowerCase().includes(query.toLowerCase()) || e.category.toLowerCase().includes(query.toLowerCase())));
  return (
    <div>
      <div className="mb-5">
        <h1 className={`text-3xl font-bold ${dark ? "text-white" : "text-slate-900"}`} style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}>Seus resultados</h1>
        <p className={`text-sm mt-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>Histórico completo dos exames realizados nas nossas unidades.</p>
      </div>
      <div className={`rounded-2xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"} p-4 shadow-sm mb-4 flex items-center gap-3 flex-wrap`}>
        <div className={`flex items-center gap-2 flex-1 min-w-[260px] ${dark ? "bg-gray-800 border-gray-700" : "bg-slate-50 border-gray-100"} border rounded-xl px-3 h-10`}>
          <WIcon name="search" className="w-4 h-4 text-gray-400" strokeWidth={2.2} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nome ou categoria…" className={`bg-transparent outline-none text-sm flex-1 ${dark ? "text-white placeholder:text-gray-500" : "text-slate-800 placeholder:text-gray-400"}`} />
        </div>
        <div className="flex items-center gap-1.5">
          {[{id:"all",label:"Todos"},{id:"ready",label:"Liberados"},{id:"analyzing",label:"Em análise"}].map(f =>
            <button key={f.id} onClick={() => setFilter(f.id)} className={`px-3 h-9 rounded-lg text-xs font-semibold transition ${filter === f.id ? "bg-blue-600 text-white shadow-md shadow-blue-500/25" : (dark ? "bg-gray-800 text-gray-300" : "bg-slate-50 text-gray-600")}`}>{f.label}</button>
          )}
        </div>
        <div className="hidden md:flex items-center gap-1.5 ml-auto">
          <button className={`h-9 px-3 rounded-lg text-xs font-medium border inline-flex items-center gap-1.5 ${dark ? "border-gray-700 text-gray-300 bg-gray-800" : "border-gray-200 text-gray-600 bg-white"}`}><WIcon name="calendar" className="w-3.5 h-3.5" strokeWidth={2.2} />Período</button>
          <button className={`h-9 px-3 rounded-lg text-xs font-medium border inline-flex items-center gap-1.5 ${dark ? "border-gray-700 text-gray-300 bg-gray-800" : "border-gray-200 text-gray-600 bg-white"}`}><WIcon name="download" className="w-3.5 h-3.5" strokeWidth={2.2} />Exportar</button>
        </div>
      </div>
      <div className={`rounded-2xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"} p-2 shadow-sm flex flex-col gap-1`}>
        {filtered.map(e => <ExamRow key={e.id} exam={e} onClick={() => onOpenExam(e)} dark={dark} />)}
        {filtered.length === 0 && <div className="text-center text-sm text-gray-400 py-10">Nenhum exame encontrado.</div>}
      </div>
    </div>);
}

// ============================================================
// Laudo page — printable lab report
// ============================================================
function LaudoPage({ exam, onBack, dark }) {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className={`inline-flex items-center gap-1.5 text-sm font-medium ${dark ? "text-gray-300 hover:text-white" : "text-slate-600 hover:text-slate-900"}`}>
          <WIcon name="arrow-left" className="w-4 h-4" strokeWidth={2.2} />Voltar
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} className={`text-xs font-medium px-3 h-9 rounded-lg border inline-flex items-center gap-1.5 ${dark ? "border-gray-700 text-gray-300 bg-gray-800" : "border-gray-200 text-gray-600 bg-white"}`}><WIcon name="printer" className="w-4 h-4" strokeWidth={2.2} />Imprimir</button>
          <button className="text-xs font-semibold px-3 h-9 rounded-lg bg-blue-50 text-blue-700 inline-flex items-center gap-1.5"><WIcon name="send" className="w-4 h-4" strokeWidth={2.2} />Enviar ao médico</button>
          <button className="text-xs font-semibold px-3 h-9 rounded-lg bg-blue-600 text-white inline-flex items-center gap-1.5 shadow-md shadow-blue-500/25"><WIcon name="download" className="w-4 h-4" strokeWidth={2.2} />Baixar PDF</button>
        </div>
      </div>
      <div className="bg-white text-slate-900 rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        <div className="px-10 pt-10 pb-6 border-b border-gray-200 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-blue-500/25">L</div>
            <div>
              <div className="font-black text-xl tracking-tight text-slate-900">Lab Hub<span className="text-blue-500">.</span></div>
              <div className="text-[11px] text-gray-500">Diagnósticos clínicos · CNPJ 12.345.678/0001-90</div>
              <div className="text-[11px] text-gray-500">SGAS 915, Bloco B · Asa Sul · Brasília · DF</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Laudo nº</div>
            <div className="text-base font-bold tabular-nums text-slate-900">#{exam.id.toUpperCase()}</div>
            <div className="text-[10px] text-gray-500 mt-2 inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Assinado digitalmente</div>
          </div>
        </div>
        <div className="px-10 py-6 grid grid-cols-2 gap-x-10 gap-y-4 border-b border-gray-100">
          <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Paciente</div><div className="text-base font-semibold text-slate-900">João Madeiro</div><div className="text-xs text-gray-600">CPF •••.•••.123-45 · Nasc. 12/03/1989 · Sexo M</div></div>
          <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Médico solicitante</div><div className="text-base font-semibold text-slate-900">{exam.doctor}</div><div className="text-xs text-gray-600">{exam.crm}</div></div>
          <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Coleta</div><div className="text-sm font-medium text-slate-900">{exam.fullDate} · 07:42</div><div className="text-xs text-gray-600">{exam.unit}</div></div>
          <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Liberação</div><div className="text-sm font-medium text-slate-900">{exam.fullDate} · 14:08</div><div className="text-xs text-gray-600">Material: Sangue total</div></div>
        </div>
        <div className="px-10 pt-6">
          <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600 mb-1">{exam.category}</div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1" style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}>{exam.name}</h1>
          <p className="text-sm text-gray-600">Análise quantitativa dos principais marcadores. Valores de referência conforme diretrizes da SBAC.</p>
        </div>
        <div className="px-10 py-6">
          <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-4 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b-2 border-slate-300">
            <span>Marcador</span><span>Resultado</span><span>Referência</span><span>Status</span>
          </div>
          {exam.panels.map((p, i) =>
            <div key={p.name} className={`grid grid-cols-[2fr_1fr_1fr_auto] gap-4 items-center px-4 py-3 ${i !== exam.panels.length - 1 ? "border-b border-gray-100" : ""}`}>
              <div className="text-sm font-medium text-slate-900">{p.name}</div>
              <div className={`text-sm font-bold tabular-nums ${p.ok ? "text-slate-900" : "text-amber-700"}`}>{p.value} <span className="text-[11px] font-medium text-gray-500">{p.unit}</span></div>
              <div className="text-xs text-gray-600 tabular-nums">{p.ref}</div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded ${p.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{p.ok ? "NORMAL" : "ATENÇÃO"}</span>
            </div>
          )}
        </div>
        {exam.summary && (
          <div className="px-10 pb-2">
            <div className="rounded-xl border border-gray-200 bg-slate-50 p-5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Observações clínicas</div>
              <p className="text-sm text-slate-700 leading-relaxed">{exam.summary} Recomenda-se correlação com quadro clínico. Em caso de dúvida, consulte o médico responsável.</p>
            </div>
          </div>
        )}
        <div className="px-10 py-8 border-t border-gray-100 grid grid-cols-2 gap-10 items-end">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Responsável técnico</div>
            <div className="font-mono text-[11px] text-slate-700 mb-3 italic">_assinado digitalmente_</div>
            <div className="border-t border-slate-300 pt-2">
              <div className="text-sm font-semibold text-slate-900">Dra. Helena Pacheco</div>
              <div className="text-[11px] text-gray-600">Bioquímica · CRBM/DF 4.821</div>
            </div>
          </div>
          <div className="text-right">
            <div className="inline-block bg-white border border-gray-200 rounded-lg p-3">
              <div className="h-20 w-20 grid grid-cols-8 grid-rows-8 gap-px">
                {Array.from({ length: 64 }).map((_, i) => <div key={i} className={(i * 7 + 3) % 5 < 2 ? "bg-slate-900" : "bg-white"} />)}
              </div>
            </div>
            <div className="text-[10px] text-gray-500 mt-1">Verifique em labhub.com.br/v</div>
          </div>
        </div>
        <div className="px-10 py-4 bg-slate-50 border-t border-gray-100 text-[10px] text-gray-500 flex items-center justify-between">
          <span>Lab Hub · labhub.com.br · 0800 123 4567</span>
          <span>Página 1 de 1 · Gerado em {exam.fullDate}</span>
        </div>
      </div>
    </div>);
}

window.LabHubWebApp = LabHubWebApp;

// ============================================================
// Documents page — atestados, receitas, pedidos médicos
// ============================================================
function DocumentsPage({ dark }) {
  const [tab, setTab] = useState("all");
  const docs = [
    { id: "d1", kind: "atestado", title: "Atestado médico", sub: "Dr. Carlos Silva · 14 Out 2025", size: "248 KB", icon: "file-check-2", tone: "blue" },
    { id: "d2", kind: "receita", title: "Receita — Vitamina D 50.000UI", sub: "Dra. Renata Moura · 02 Out 2025", size: "112 KB", icon: "pill", tone: "violet" },
    { id: "d3", kind: "pedido", title: "Pedido de exames laboratoriais", sub: "Dr. Carlos Silva · 28 Set 2025", size: "98 KB", icon: "clipboard-list", tone: "amber" },
    { id: "d4", kind: "atestado", title: "Atestado de comparecimento", sub: "Lab Hub · 15 Set 2025", size: "76 KB", icon: "file-check-2", tone: "blue" },
    { id: "d5", kind: "receita", title: "Receita — Sinvastatina 20mg", sub: "Dra. Renata Moura · 04 Set 2025", size: "104 KB", icon: "pill", tone: "violet" },
    { id: "d6", kind: "pedido", title: "Pedido de ressonância", sub: "Dr. Carlos Silva · 22 Ago 2025", size: "126 KB", icon: "clipboard-list", tone: "amber" }
  ];
  const filtered = tab === "all" ? docs : docs.filter(d => d.kind === tab);
  const tones = { blue: "bg-blue-100 text-blue-700", violet: "bg-violet-100 text-violet-700", amber: "bg-amber-100 text-amber-700" };
  return (
    <div>
      <div className="mb-5 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className={`text-3xl font-bold ${dark ? "text-white" : "text-slate-900"}`} style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}>Documentos</h1>
          <p className={`text-sm mt-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>Atestados, receitas e pedidos médicos guardados num só lugar.</p>
        </div>
        <button className="bg-blue-600 text-white text-xs font-semibold h-9 px-3 rounded-lg inline-flex items-center gap-1.5 shadow-md shadow-blue-500/25"><WIcon name="upload" className="w-4 h-4" strokeWidth={2.2} />Enviar documento</button>
      </div>
      <div className={`rounded-2xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"} p-2 shadow-sm mb-4 inline-flex gap-1`}>
        {[{id:"all",l:"Todos"},{id:"atestado",l:"Atestados"},{id:"receita",l:"Receitas"},{id:"pedido",l:"Pedidos"}].map(t =>
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-3.5 h-8 rounded-lg text-xs font-semibold transition ${tab === t.id ? "bg-blue-600 text-white" : (dark ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-slate-900")}`}>{t.l}</button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(d =>
          <div key={d.id} className={`rounded-2xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"} p-4 shadow-sm hover:shadow-md transition group`}>
            <div className="flex items-start gap-3 mb-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${tones[d.tone]}`}><WIcon name={d.icon} className="w-5 h-5" strokeWidth={2.2} /></div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold truncate ${dark ? "text-white" : "text-slate-900"}`}>{d.title}</div>
                <div className="text-[11px] text-gray-400 truncate">{d.sub}</div>
              </div>
            </div>
            <div className={`aspect-[3/2] rounded-xl border-2 border-dashed flex items-center justify-center mb-3 ${dark ? "border-gray-800 bg-gray-800/30" : "border-gray-100 bg-slate-50"}`}>
              <WIcon name="file-text" className={`w-8 h-8 ${dark ? "text-gray-600" : "text-gray-300"}`} strokeWidth={1.6} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400">PDF · {d.size}</span>
              <div className="flex items-center gap-1">
                <button className={`h-7 w-7 rounded-lg flex items-center justify-center ${dark ? "hover:bg-gray-800" : "hover:bg-slate-100"}`}><WIcon name="eye" className="w-3.5 h-3.5 text-gray-500" strokeWidth={2.2} /></button>
                <button className={`h-7 w-7 rounded-lg flex items-center justify-center ${dark ? "hover:bg-gray-800" : "hover:bg-slate-100"}`}><WIcon name="download" className="w-3.5 h-3.5 text-gray-500" strokeWidth={2.2} /></button>
                <button className={`h-7 w-7 rounded-lg flex items-center justify-center ${dark ? "hover:bg-gray-800" : "hover:bg-slate-100"}`}><WIcon name="send" className="w-3.5 h-3.5 text-gray-500" strokeWidth={2.2} /></button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>);
}

// ============================================================
// Trends page — humanized narrative (no busy charts)
// ============================================================
function TrendsPage({ dark }) {
  const stories = [
    { marker: "Colesterol LDL", value: "138 mg/dL", delta: "+12 nos últimos 6 meses", tone: "amber", direction: "up", note: "Está acima do valor recomendado (até 130 mg/dL). Vale conversar com seu médico sobre alimentação e atividade física.", spark: [108, 115, 120, 124, 130, 138] },
    { marker: "Vitamina D", value: "42 ng/mL", delta: "+18 desde a suplementação", tone: "green", direction: "up", note: "Excelente resposta à suplementação iniciada em fevereiro. Você está dentro da faixa ideal (30–60).", spark: [22, 24, 28, 33, 38, 42] },
    { marker: "Glicemia em jejum", value: "92 mg/dL", delta: "Estável há 3 coletas", tone: "blue", direction: "flat", note: "Tudo certo por aqui. Continue mantendo a rotina de exames anuais.", spark: [91, 93, 92, 91, 92, 92] },
    { marker: "Hemoglobina", value: "14,2 g/dL", delta: "+0,3 desde a última coleta", tone: "blue", direction: "up", note: "Dentro da referência (13,0–17,5). Nenhuma preocupação no momento.", spark: [13.4, 13.8, 14.0, 13.9, 14.0, 14.2] }
  ];
  const tones = {
    amber: { bg: dark ? "bg-amber-500/10" : "bg-amber-50", text: "text-amber-700", chip: "bg-amber-100 text-amber-700", line: "stroke-amber-500" },
    green: { bg: dark ? "bg-emerald-500/10" : "bg-emerald-50", text: "text-emerald-700", chip: "bg-emerald-100 text-emerald-700", line: "stroke-emerald-500" },
    blue:  { bg: dark ? "bg-blue-500/10" : "bg-blue-50", text: "text-blue-700", chip: "bg-blue-100 text-blue-700", line: "stroke-blue-500" }
  };
  const dirIcon = { up: "trending-up", down: "trending-down", flat: "minus" };
  const sparkPath = (vals) => {
    const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
    return vals.map((v, i) => `${i === 0 ? "M" : "L"} ${(i / (vals.length - 1)) * 100} ${30 - ((v - min) / range) * 26}`).join(" ");
  };
  return (
    <div>
      <div className="mb-5">
        <h1 className={`text-3xl font-bold ${dark ? "text-white" : "text-slate-900"}`} style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}>Como você está evoluindo</h1>
        <p className={`text-sm mt-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>Comparação dos seus principais marcadores ao longo do tempo, em linguagem simples.</p>
      </div>
      <div className={`rounded-2xl p-5 mb-5 ${dark ? "bg-blue-500/10 border border-blue-500/20" : "bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100"}`}>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/25"><WIcon name="sparkles" className="w-5 h-5" strokeWidth={2.2} /></div>
          <div>
            <div className={`text-sm font-bold mb-0.5 ${dark ? "text-blue-100" : "text-blue-900"}`}>Em resumo</div>
            <p className={`text-sm leading-relaxed ${dark ? "text-blue-100/80" : "text-blue-900/80"}`}>De 4 marcadores acompanhados, <b>3 estão na faixa ideal</b> e <b>1 precisa de atenção</b> (LDL). Sua vitamina D respondeu muito bem à suplementação. Considere agendar retorno com a Dra. Renata.</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stories.map(s => {
          const t = tones[s.tone];
          return (
          <div key={s.marker} className={`rounded-2xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"} p-5 shadow-sm`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className={`text-xs font-medium ${dark ? "text-gray-400" : "text-gray-500"}`}>{s.marker}</div>
                <div className={`text-2xl font-bold mt-0.5 tabular-nums ${dark ? "text-white" : "text-slate-900"}`} style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}>{s.value}</div>
              </div>
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md ${t.chip}`}><WIcon name={dirIcon[s.direction]} className="w-3 h-3" strokeWidth={2.6} />{s.delta}</span>
            </div>
            <svg viewBox="0 0 100 32" className="w-full h-12 mb-3" preserveAspectRatio="none">
              <path d={sparkPath(s.spark)} className={t.line} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className={`rounded-xl p-3 ${t.bg}`}><p className={`text-xs leading-relaxed ${dark ? "text-gray-200" : "text-slate-700"}`}>{s.note}</p></div>
          </div>);
        })}
      </div>
    </div>);
}

// ============================================================
// Billing page — invoices, plan, payment methods
// ============================================================
function BillingPage({ dark }) {
  const invoices = [
    { id: "INV-2310", date: "15 Out 2025", desc: "Hemograma + Perfil lipídico", amount: "R$ 312,00", status: "paid" },
    { id: "INV-2287", date: "02 Out 2025", desc: "Consulta Endocrinologia", amount: "R$ 480,00", status: "paid" },
    { id: "INV-2241", date: "28 Set 2025", desc: "Vitamina D · TSH · T4 livre", amount: "R$ 198,00", status: "paid" },
    { id: "INV-2198", date: "04 Set 2025", desc: "Glicemia + Colesterol total", amount: "R$ 142,00", status: "refunded" }
  ];
  const card = `rounded-2xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"} p-5 shadow-sm`;
  return (
    <div>
      <div className="mb-5">
        <h1 className={`text-3xl font-bold ${dark ? "text-white" : "text-slate-900"}`} style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}>Faturamento</h1>
        <p className={`text-sm mt-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>Plano, formas de pagamento e histórico de notas fiscais.</p>
      </div>
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-7">
          <div className={`relative overflow-hidden rounded-2xl p-6 text-white shadow-lg ${dark ? "" : "shadow-blue-500/20"}`} style={{ background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 60%, #7c3aed 100%)" }}>
            <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
            <div className="relative">
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-100 mb-2">Plano atual</div>
              <h2 className="text-3xl font-black mb-1" style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}>Lab Hub Care<span className="text-blue-200">.</span></h2>
              <p className="text-blue-100 text-sm mb-5 max-w-md">Coletas em domicílio ilimitadas, prioridade nas unidades, descontos em consultas e laudos compartilháveis com seu time médico.</p>
              <div className="flex items-end gap-6 flex-wrap">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-blue-100">Mensalidade</div>
                  <div className="text-2xl font-bold tabular-nums">R$ 89<span className="text-base font-medium text-blue-100">,90</span></div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-blue-100">Próximo débito</div>
                  <div className="text-sm font-semibold">15 Mai 2026</div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <button className="bg-white/15 backdrop-blur text-white text-xs font-semibold h-9 px-3 rounded-lg hover:bg-white/25">Mudar plano</button>
                  <button className="bg-white text-blue-700 text-xs font-bold h-9 px-3 rounded-lg shadow-md">Gerenciar</button>
                </div>
              </div>
            </div>
          </div>
          <div className={card + " mt-5"}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-800"}`}>Histórico de cobranças</h3>
              <button className="text-xs font-semibold text-blue-600">Exportar CSV</button>
            </div>
            <div className="flex flex-col gap-1">
              {invoices.map(i =>
                <div key={i.id} className={`grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 items-center px-3 py-2.5 rounded-xl ${dark ? "hover:bg-gray-800/50" : "hover:bg-slate-50"} transition`}>
                  <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><WIcon name="receipt" className="w-4 h-4" strokeWidth={2.2} /></div>
                  <div className="min-w-0">
                    <div className={`text-sm font-semibold truncate ${dark ? "text-white" : "text-slate-800"}`}>{i.desc}</div>
                    <div className="text-[11px] text-gray-400">{i.id} · {i.date}</div>
                  </div>
                  <div className={`text-sm font-bold tabular-nums ${dark ? "text-white" : "text-slate-900"}`}>{i.amount}</div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${i.status === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{i.status === "paid" ? "Pago" : "Estornado"}</span>
                  <button className="text-blue-600 text-xs font-semibold inline-flex items-center gap-1"><WIcon name="download" className="w-3.5 h-3.5" strokeWidth={2.2} />NFS-e</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-5">
          <div className={card}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-800"}`}>Forma de pagamento</h3>
              <button className="text-xs font-semibold text-blue-600">+ Adicionar</button>
            </div>
            <div className="flex flex-col gap-2">
              {[
                { brand: "Visa", last: "4821", exp: "08/29", primary: true },
                { brand: "Mastercard", last: "1192", exp: "11/27", primary: false }
              ].map(c =>
                <div key={c.last} className={`flex items-center gap-3 p-3 rounded-xl border ${c.primary ? (dark ? "border-blue-500/40 bg-blue-500/5" : "border-blue-200 bg-blue-50/50") : (dark ? "border-gray-800" : "border-gray-100")}`}>
                  <div className="h-9 w-12 rounded-md bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white text-[10px] font-black tracking-wider">{c.brand.slice(0,4).toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-800"}`}>{c.brand} ···· {c.last}</div>
                    <div className="text-[11px] text-gray-400">Validade {c.exp}</div>
                  </div>
                  {c.primary && <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded">Principal</span>}
                </div>
              )}
              <div className={`flex items-center gap-3 p-3 rounded-xl border-2 border-dashed ${dark ? "border-gray-800" : "border-gray-200"}`}>
                <div className="h-9 w-12 rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-[10px] font-black">PIX</div>
                <div className="flex-1 min-w-0"><div className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-800"}`}>Pagar via PIX</div><div className="text-[11px] text-gray-400">Aprovação imediata</div></div>
              </div>
            </div>
          </div>
          <div className={card}>
            <h3 className={`text-sm font-semibold mb-3 ${dark ? "text-white" : "text-slate-800"}`}>Resumo do mês</h3>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className={`text-sm ${dark ? "text-gray-400" : "text-gray-500"}`}>Gasto até hoje</span>
                <span className={`text-sm font-bold tabular-nums ${dark ? "text-white" : "text-slate-900"}`}>R$ 312,00</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-sm ${dark ? "text-gray-400" : "text-gray-500"}`}>Reembolsado pelo plano</span>
                <span className="text-sm font-bold tabular-nums text-emerald-600">− R$ 124,80</span>
              </div>
              <div className={`pt-3 border-t ${dark ? "border-gray-800" : "border-gray-100"} flex items-center justify-between`}>
                <span className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-900"}`}>Custo líquido</span>
                <span className={`text-base font-black tabular-nums ${dark ? "text-white" : "text-slate-900"}`}>R$ 187,20</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>);
}

// ============================================================
// Settings page — preferences, notifications, privacy
// ============================================================
function SettingsPage({ dark }) {
  const [pref, setPref] = useState({ emailResults: true, smsResults: false, pushResults: true, marketing: false, sharing: true, twoFA: true });
  const card = `rounded-2xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"} p-5 shadow-sm`;
  const Toggle = ({ on, onChange }) => (
    <button onClick={onChange} className={`relative h-6 w-11 rounded-full transition ${on ? "bg-blue-600" : (dark ? "bg-gray-700" : "bg-gray-300")}`}>
      <span className={`absolute top-0.5 h-5 w-5 bg-white rounded-full shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>);
  const Row = ({ icon, title, sub, k }) => (
    <div className={`flex items-center gap-3 py-3 ${dark ? "border-gray-800" : "border-gray-100"} border-b last:border-b-0`}>
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${dark ? "bg-gray-800 text-gray-300" : "bg-slate-100 text-slate-600"}`}><WIcon name={icon} className="w-4 h-4" strokeWidth={2.2} /></div>
      <div className="flex-1 min-w-0"><div className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-800"}`}>{title}</div><div className="text-[11px] text-gray-400">{sub}</div></div>
      <Toggle on={pref[k]} onChange={() => setPref({ ...pref, [k]: !pref[k] })} />
    </div>);
  return (
    <div>
      <div className="mb-5">
        <h1 className={`text-3xl font-bold ${dark ? "text-white" : "text-slate-900"}`} style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}>Configurações</h1>
        <p className={`text-sm mt-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>Preferências, notificações, privacidade e segurança da conta.</p>
      </div>
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-5">
          <div className={card}>
            <h3 className={`text-sm font-semibold mb-2 ${dark ? "text-white" : "text-slate-800"}`}>Como você quer receber novidades</h3>
            <p className="text-xs text-gray-400 mb-2">Avisamos quando seu exame fica pronto, quando há documentos novos e lembretes de coleta.</p>
            <Row icon="mail" title="Por e-mail" sub="joao.madeiro@email.com" k="emailResults" />
            <Row icon="message-square" title="Por SMS" sub="+55 (61) 9 8123-4567" k="smsResults" />
            <Row icon="bell" title="Notificação push" sub="No celular e navegador" k="pushResults" />
            <Row icon="megaphone" title="Novidades e promoções" sub="Comunicações de marketing" k="marketing" />
          </div>
          <div className={card}>
            <h3 className={`text-sm font-semibold mb-2 ${dark ? "text-white" : "text-slate-800"}`}>Privacidade</h3>
            <Row icon="share-2" title="Compartilhar com médicos" sub="Permite que profissionais cadastrados acessem seus laudos" k="sharing" />
            <Row icon="shield-check" title="Verificação em duas etapas" sub="Exige código por SMS no login" k="twoFA" />
            <div className={`flex items-center gap-3 py-3`}>
              <div className="h-9 w-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center"><WIcon name="trash-2" className="w-4 h-4" strokeWidth={2.2} /></div>
              <div className="flex-1 min-w-0"><div className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-800"}`}>Excluir minha conta</div><div className="text-[11px] text-gray-400">Apaga todos os seus dados após 30 dias</div></div>
              <button className="text-xs font-semibold text-rose-600">Solicitar</button>
            </div>
          </div>
        </div>
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-5">
          <div className={card}>
            <h3 className={`text-sm font-semibold mb-3 ${dark ? "text-white" : "text-slate-800"}`}>Aparência</h3>
            <div className="grid grid-cols-2 gap-2">
              {[{id:"light",l:"Claro",bg:"bg-white border-gray-200"},{id:"dark",l:"Escuro",bg:"bg-gray-900 border-gray-700"}].map(o =>
                <button key={o.id} className={`rounded-xl border-2 p-3 text-left ${dark === (o.id === "dark") ? "border-blue-500 ring-2 ring-blue-500/20" : (dark ? "border-gray-800" : "border-gray-100")}`}>
                  <div className={`h-12 rounded-md ${o.bg} border mb-2`}></div>
                  <div className={`text-xs font-semibold ${dark ? "text-white" : "text-slate-800"}`}>{o.l}</div>
                </button>
              )}
            </div>
          </div>
          <div className={card}>
            <h3 className={`text-sm font-semibold mb-3 ${dark ? "text-white" : "text-slate-800"}`}>Idioma e região</h3>
            <div className="flex flex-col gap-2">
              <div className={`flex items-center justify-between p-3 rounded-xl ${dark ? "bg-gray-800/50" : "bg-slate-50"}`}>
                <span className={`text-sm ${dark ? "text-white" : "text-slate-800"}`}>Idioma</span>
                <span className={`text-sm font-semibold ${dark ? "text-gray-300" : "text-slate-700"}`}>Português · BR</span>
              </div>
              <div className={`flex items-center justify-between p-3 rounded-xl ${dark ? "bg-gray-800/50" : "bg-slate-50"}`}>
                <span className={`text-sm ${dark ? "text-white" : "text-slate-800"}`}>Fuso horário</span>
                <span className={`text-sm font-semibold ${dark ? "text-gray-300" : "text-slate-700"}`}>America/São_Paulo</span>
              </div>
              <div className={`flex items-center justify-between p-3 rounded-xl ${dark ? "bg-gray-800/50" : "bg-slate-50"}`}>
                <span className={`text-sm ${dark ? "text-white" : "text-slate-800"}`}>Unidades</span>
                <span className={`text-sm font-semibold ${dark ? "text-gray-300" : "text-slate-700"}`}>Métrico (mg/dL)</span>
              </div>
            </div>
          </div>
          <div className={card}>
            <h3 className={`text-sm font-semibold mb-2 ${dark ? "text-white" : "text-slate-800"}`}>Dispositivos conectados</h3>
            <p className="text-xs text-gray-400 mb-3">Você está logado nestes aparelhos.</p>
            <div className="flex flex-col gap-2">
              {[{ d: "iPhone 15", w: "Asa Sul · agora", icon: "smartphone" }, { d: "MacBook Pro", w: "Asa Sul · 2h atrás", icon: "monitor" }].map(s =>
                <div key={s.d} className={`flex items-center gap-3 p-2.5 rounded-xl ${dark ? "bg-gray-800/50" : "bg-slate-50"}`}>
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${dark ? "bg-gray-800 text-gray-300" : "bg-white text-slate-600 border border-gray-100"}`}><WIcon name={s.icon} className="w-4 h-4" strokeWidth={2.2} /></div>
                  <div className="flex-1 min-w-0"><div className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-800"}`}>{s.d}</div><div className="text-[11px] text-gray-400">{s.w}</div></div>
                  <button className="text-[11px] font-semibold text-rose-600">Sair</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>);
}