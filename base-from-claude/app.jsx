/* global React, ReactDOM, lucide */
const { useState, useEffect, useRef } = React;

// ============================================================
// Lab Hub — Patient Portal Prototype
// Mobile-first, inspired by Nav Dasa, built on Flow LAB DS.
// ============================================================

const TWEAKS = {
  "heroStyle": "premium-dark",
  "showFrame": true,
  "patientName": "João",
  "accentPalette": "blue-indigo"
};

// ---------- Mock data ----------
const EXAMS = [
{
  id: "ex-001",
  name: "Hemograma Completo",
  short: "Hemograma e perfil lipídico",
  date: "15 Out 2023",
  fullDate: "15 de outubro de 2023",
  collected: "Coletado em 15/10/2023 às 07:42",
  unit: "Unidade Asa Sul",
  address: "SGAS 915, Bloco B — Asa Sul, Brasília",
  doctor: "Dr. Carlos Silva",
  crm: "CRM/DF 24.871",
  status: "ready", // ready | analyzing
  summary: "Resultados dentro da referência. Colesterol LDL no limite superior.",
  panels: [
  { name: "Hemoglobina", value: "14,2 g/dL", ref: "13,0 – 17,5", ok: true },
  { name: "Hematócrito", value: "42,1 %", ref: "39 – 50", ok: true },
  { name: "Leucócitos", value: "6.800 /mm³", ref: "4.000 – 10.000", ok: true },
  { name: "Plaquetas", value: "243.000 /mm³", ref: "150.000 – 450.000", ok: true },
  { name: "Colesterol LDL", value: "138 mg/dL", ref: "< 130", ok: false }]

},
{
  id: "ex-002",
  name: "Glicemia em Jejum",
  short: "Painel de glicose",
  date: "02 Out 2023",
  fullDate: "02 de outubro de 2023",
  collected: "Coletado em 02/10/2023 às 06:55",
  unit: "Unidade Águas Claras",
  address: "Rua das Pitangueiras, Lt. 6 — Águas Claras, Brasília",
  doctor: "Dra. Renata Moura",
  crm: "CRM/DF 19.402",
  status: "ready",
  summary: "Glicemia normal em jejum.",
  panels: [
  { name: "Glicose", value: "92 mg/dL", ref: "70 – 99", ok: true }]

},
{
  id: "ex-003",
  name: "TSH e T4 Livre",
  short: "Função tireoidiana",
  date: "28 Set 2023",
  fullDate: "28 de setembro de 2023",
  collected: "Coletado em 28/09/2023 às 08:10",
  unit: "Unidade Sudoeste",
  address: "CLSW 102, Bloco A — Sudoeste, Brasília",
  doctor: "Dr. Carlos Silva",
  crm: "CRM/DF 24.871",
  status: "analyzing",
  summary: "Análise em andamento — previsão de liberação em 24h.",
  panels: []
}];


// ---------- Tiny helpers ----------
const Icon = ({ name, className = "w-5 h-5", strokeWidth = 2 }) => {
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
};

const StatusBadge = ({ status }) => {
  if (status === "ready") {
    return (
      <span className="bg-green-100 text-green-800 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-tight whitespace-nowrap">
        Liberado
      </span>);

  }
  return (
    <span className="bg-yellow-100 text-yellow-800 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-tight whitespace-nowrap inline-flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
      Em Análise
    </span>);

};

// ============================================================
// Header
// ============================================================
function Header({ patientName, onNotifications }) {
  return (
    <header className="bg-white/80 backdrop-blur-md sticky top-0 z-30 px-6 py-4 flex justify-between items-center border-b border-gray-100">
      <div className="flex flex-col">
        <span className="text-[11px] font-medium text-gray-400 tracking-wide">Bom dia</span>
        <h1 className="text-xl font-bold text-gray-800 leading-tight" data-comment-anchor="greeting">
          Olá, {patientName} <span className="inline-block">👋</span>
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onNotifications}
          className="relative h-10 w-10 rounded-full bg-white border border-gray-100 flex items-center justify-center text-gray-500 active:scale-95 transition-all duration-200 hover:border-gray-200 min-h-[44px] min-w-[44px]"
          aria-label="Notificações">
          
          <Icon name="bell" className="w-5 h-5" strokeWidth={2} />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />
        </button>
        <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold ring-2 ring-white shadow-sm">
          {patientName.charAt(0).toUpperCase()}
        </div>
      </div>
    </header>);

}

// ============================================================
// Hero Card — last exam highlight
// ============================================================
function HeroCard({ exam, onOpen, variant }) {
  const gradientByVariant = {
    "premium-dark": "bg-gradient-to-br from-blue-900 via-blue-700 to-indigo-800",
    "ocean": "bg-gradient-to-br from-cyan-600 via-blue-600 to-indigo-700",
    "midnight": "bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-950"
  };
  const grad = gradientByVariant[variant] || gradientByVariant["premium-dark"];

  return (
    <div className="px-6 pt-5 pb-2">
      <div
        className={`${grad} rounded-3xl p-6 text-white relative overflow-hidden shadow-lg shadow-blue-900/20`}
        data-comment-anchor="hero-card">
        
        {/* Decorative orb */}
        <div className="absolute -top-12 -right-8 w-44 h-44 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-6 -left-6 w-32 h-32 rounded-full bg-indigo-300/10 blur-2xl pointer-events-none" />

        {/* Decorative giant icon */}
        <div className="absolute -bottom-4 -right-4 opacity-10 pointer-events-none">
          <Icon name="file-text" className="w-40 h-40" strokeWidth={1.4} />
        </div>

        <div className="relative">
          <div className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1 mb-4 text-[11px] font-semibold tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            Resultado disponível
          </div>
          <p className="font-semibold text-lg mb-1 leading-snug" style={{ color: "rgb(255, 255, 255)" }}>
            Seu último exame está pronto!
          </p>
          <p className="text-blue-100 text-sm mb-5 leading-snug">
            {exam.short}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onOpen}
              className="bg-white text-blue-600 rounded-xl px-4 py-2.5 font-semibold text-sm inline-flex items-center gap-2 active:scale-95 transition-all duration-200 hover:shadow-md min-h-[44px]">
              
              Ver resultado
              <Icon name="arrow-right" className="w-4 h-4" strokeWidth={2.4} />
            </button>
            <span className="text-blue-100/80 text-xs">{exam.date}</span>
          </div>
        </div>
      </div>
    </div>);

}

// ============================================================
// Quick Actions
// ============================================================
function QuickActions({ onAction }) {
  const actions = [
  { id: "schedule", label: "Agendar", icon: "calendar-plus", tone: "blue" },
  { id: "home-collect", label: "Coleta em casa", icon: "home", tone: "indigo" },
  { id: "results", label: "Resultados", icon: "file-text", tone: "cyan" },
  { id: "support", label: "Suporte", icon: "headphones", tone: "violet" }];

  const toneMap = {
    blue: "bg-blue-50 text-blue-600",
    indigo: "bg-indigo-50 text-indigo-600",
    cyan: "bg-cyan-50 text-cyan-600",
    violet: "bg-violet-50 text-violet-600"
  };
  return (
    <div className="px-6 pt-3 pb-2">
      <div className="grid grid-cols-4 gap-2">
        {actions.map((a) =>
        <button
          key={a.id}
          onClick={() => onAction?.(a.id)}
          className="flex flex-col items-center gap-1.5 active:scale-95 transition-all duration-200 group">
          
            <div className={`h-12 w-12 rounded-2xl ${toneMap[a.tone]} flex items-center justify-center group-hover:shadow-md group-hover:-translate-y-0.5 transition-all duration-200`}>
              <Icon name={a.icon} className="w-5 h-5" strokeWidth={2} />
            </div>
            <span className="text-[11px] font-medium text-gray-600 text-center leading-tight">
              {a.label}
            </span>
          </button>
        )}
      </div>
    </div>);

}

// ============================================================
// Exam list item
// ============================================================
function ExamCard({ exam, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.98] text-left min-h-[44px]">
      
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="h-11 w-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
          <Icon name={exam.status === "ready" ? "file-check-2" : "file-clock"} className="w-5 h-5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500 font-medium mb-0.5">{exam.date}</p>
          <p className="text-sm font-semibold text-gray-800 truncate">{exam.name}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{exam.unit}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 pl-2">
        <StatusBadge status={exam.status} />
        <Icon name="chevron-right" className="w-5 h-5 text-gray-300" strokeWidth={2} />
      </div>
    </button>);

}

// ============================================================
// Bottom Sheet (Drawer) — exam detail
// ============================================================
function BottomSheet({ exam, open, onClose }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // next frame -> trigger transition
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else if (mounted) {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 280);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!mounted || !exam) return null;

  return (
    <div
      className={`fixed inset-0 z-50 ${visible ? "" : "pointer-events-none"}`}
      role="dialog"
      aria-modal="true">
      
      {/* Scrim */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`} />
      
      {/* Sheet */}
      <div
        className={`absolute bottom-0 w-full max-w-md left-1/2 -translate-x-1/2 bg-white rounded-t-3xl transition-transform duration-300 ease-out ${visible ? "translate-y-0" : "translate-y-full"}`}
        style={{ maxHeight: "88%" }}>
        
        {/* Drag handle */}
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1.5 rounded-full bg-gray-200" />
        </div>

        <div className="px-6 pb-6 pt-2 overflow-y-auto" style={{ maxHeight: "calc(88vh - 24px)" }}>
          {/* Header row */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <StatusBadge status={exam.status} />
                <span className="text-xs text-gray-400">#{exam.id.toUpperCase()}</span>
              </div>
              <h2 className="text-xl font-bold text-slate-800 leading-tight">
                {exam.name}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">{exam.fullDate}</p>
            </div>
            <button
              onClick={onClose}
              className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 active:scale-90 transition-all duration-200 shrink-0 min-h-[44px] min-w-[44px]"
              aria-label="Fechar">
              
              <Icon name="x" className="w-5 h-5" strokeWidth={2.2} />
            </button>
          </div>

          {/* Meta strip */}
          <div className="bg-slate-50 rounded-2xl p-4 mb-4 grid grid-cols-2 gap-3">
            <MetaItem icon="user-round" label="Médico" value={exam.doctor} sub={exam.crm} />
            <MetaItem icon="calendar" label="Coleta" value={exam.fullDate.split(" de ")[0] + " de " + exam.fullDate.split(" de ")[1]} sub={exam.collected.split("às")[1] ? "às" + exam.collected.split("às")[1] : ""} />
            <div className="col-span-2">
              <MetaItem icon="map-pin" label="Unidade" value={exam.unit} sub={exam.address} />
            </div>
          </div>

          {/* Summary */}
          {exam.status === "ready" ?
          <>
              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 mb-4 flex gap-3">
                <div className="h-9 w-9 rounded-xl bg-white text-blue-600 flex items-center justify-center shrink-0 shadow-sm">
                  <Icon name="sparkles" className="w-5 h-5" strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700 mb-0.5">Resumo</p>
                  <p className="text-sm text-slate-700 leading-snug">{exam.summary}</p>
                </div>
              </div>

              {/* Panels */}
              {exam.panels.length > 0 &&
            <div className="mb-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Principais marcadores</p>
                  <div className="rounded-2xl border border-gray-100 overflow-hidden">
                    {exam.panels.map((p, i) =>
                <div
                  key={p.name}
                  className={`flex items-center justify-between px-4 py-3 ${i !== exam.panels.length - 1 ? "border-b border-gray-100" : ""}`}>
                  
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">Ref. {p.ref}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 pl-2">
                          <span className={`text-sm font-bold tabular-nums ${p.ok ? "text-slate-800" : "text-amber-600"}`}>{p.value}</span>
                          <span className={`h-2 w-2 rounded-full ${p.ok ? "bg-green-500" : "bg-amber-500"}`} />
                        </div>
                      </div>
                )}
                  </div>
                </div>
            }
            </> :

          <div className="rounded-2xl border border-yellow-100 bg-yellow-50/60 p-4 mb-4 flex gap-3">
              <div className="h-9 w-9 rounded-xl bg-white text-yellow-600 flex items-center justify-center shrink-0 shadow-sm">
                <Icon name="hourglass" className="w-5 h-5" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-yellow-700 mb-0.5">Em análise</p>
                <p className="text-sm text-slate-700 leading-snug">{exam.summary}</p>
              </div>
            </div>
          }

          {/* Actions */}
          {exam.status === "ready" &&
          <>
              <button
              className="w-full bg-blue-600 text-white rounded-xl py-3.5 mt-4 flex items-center justify-center gap-2 font-medium active:scale-[0.98] transition-all duration-200 hover:bg-blue-700 shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/30 min-h-[44px]"
              onClick={() => alert("Baixando laudo…")}>
              
                <Icon name="download" className="w-5 h-5" strokeWidth={2.2} />
                Baixar Laudo PDF
              </button>
              <button
              className="w-full bg-blue-50 text-blue-600 rounded-xl py-3.5 mt-3 flex items-center justify-center gap-2 font-medium active:scale-[0.98] transition-all duration-200 hover:bg-blue-100 min-h-[44px]"
              onClick={() => alert("Enviado ao médico responsável.")}>
              
                <Icon name="send" className="w-5 h-5" strokeWidth={2.2} />
                Enviar para o Médico
              </button>
              <button
              className="w-full text-gray-500 rounded-xl py-3 mt-1 flex items-center justify-center gap-2 font-medium active:scale-[0.98] transition-all duration-200 hover:text-gray-700 text-sm"
              onClick={onClose}>
              
                <Icon name="bookmark" className="w-4 h-4" strokeWidth={2} />
                Salvar para depois
              </button>
            </>
          }
          {exam.status === "analyzing" &&
          <button
            className="w-full bg-blue-50 text-blue-600 rounded-xl py-3.5 mt-2 flex items-center justify-center gap-2 font-medium active:scale-[0.98] transition-all duration-200 hover:bg-blue-100 min-h-[44px]"
            onClick={() => alert("Você será avisado quando o resultado estiver pronto.")}>
            
              <Icon name="bell-ring" className="w-5 h-5" strokeWidth={2.2} />
              Avisar quando ficar pronto
            </button>
          }
        </div>
      </div>
    </div>);

}

function MetaItem({ icon, label, value, sub }) {
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <div className="h-8 w-8 rounded-lg bg-white text-slate-500 flex items-center justify-center shrink-0 shadow-sm border border-gray-100">
        <Icon name={icon} className="w-4 h-4" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">{label}</p>
        <p className="text-sm font-semibold text-slate-800 truncate">{value}</p>
        {sub && <p className="text-[11px] text-gray-500 truncate">{sub}</p>}
      </div>
    </div>);

}

// ============================================================
// Bottom navigation
// ============================================================
function BottomNav({ active, onChange }) {
  const tabs = [
  { id: "home", label: "Início", icon: "home" },
  { id: "results", label: "Resultados", icon: "file-text" },
  { id: "schedule", label: "Agendar", icon: "calendar-plus" },
  { id: "profile", label: "Perfil", icon: "user-round" }];

  return (
    <nav
      className="absolute bottom-0 left-0 w-full bg-white/95 backdrop-blur-md border-t border-gray-100 px-2 py-2 z-30"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}>
      
      <div className="flex justify-between items-center">
        {tabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className="flex-1 flex flex-col items-center gap-1 py-1.5 active:scale-95 transition-all duration-200 min-h-[44px] min-w-[44px]">
              
              <span
                className={`relative inline-flex items-center justify-center h-8 w-12 rounded-xl ${isActive ? "bg-blue-50" : "bg-transparent"} transition-colors`}>
                
                <Icon
                  name={t.icon}
                  className={`w-5 h-5 ${isActive ? "text-blue-600" : "text-gray-400"}`}
                  strokeWidth={isActive ? 2.4 : 2} />
                
              </span>
              <span className={`text-[10px] font-semibold tracking-tight ${isActive ? "text-blue-600" : "text-gray-400"}`}>
                {t.label}
              </span>
            </button>);

        })}
      </div>
    </nav>);

}

// ============================================================
// Notifications panel (simple slide-down)
// ============================================================
function NotificationsPanel({ open, onClose }) {
  if (!open) return null;
  const notifs = [
  { id: 1, icon: "file-check-2", title: "Hemograma Completo liberado", time: "agora", tone: "green" },
  { id: 2, icon: "calendar", title: "Lembrete: jejum a partir das 22h", time: "ontem", tone: "blue" },
  { id: 3, icon: "info", title: "Atualização nos termos do app", time: "2 dias", tone: "gray" }];

  const toneMap = {
    green: "bg-green-50 text-green-600",
    blue: "bg-blue-50 text-blue-600",
    gray: "bg-gray-100 text-gray-500"
  };
  return (
    <div className="absolute inset-0 z-40" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-[72px] right-4 left-4 bg-white rounded-2xl shadow-xl border border-gray-100 p-3 animate-[slideDown_0.2s_ease-out]">
        
        <div className="flex items-center justify-between px-2 pt-1 pb-2">
          <p className="text-sm font-bold text-slate-800">Notificações</p>
          <button onClick={onClose} className="text-xs text-blue-600 font-semibold">Marcar todas</button>
        </div>
        <div className="flex flex-col gap-1">
          {notifs.map((n) =>
          <div key={n.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 transition-colors">
              <div className={`h-9 w-9 rounded-xl ${toneMap[n.tone]} flex items-center justify-center shrink-0`}>
                <Icon name={n.icon} className="w-4 h-4" strokeWidth={2.2} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 truncate">{n.title}</p>
                <p className="text-[11px] text-gray-400">{n.time}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>);

}

// ============================================================
// Tab views (other than Home)
// ============================================================
function ResultsView({ exams, onSelect }) {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? exams : exams.filter((e) => e.status === filter);
  return (
    <div className="px-6 pt-5 pb-4">
      <h2 className="text-xl font-bold text-slate-800 mb-1">Todos os resultados</h2>
      <p className="text-sm text-gray-500 mb-4">Histórico completo de exames realizados</p>
      <div className="flex gap-2 mb-4 overflow-x-auto -mx-1 px-1">
        {[
        { id: "all", label: "Todos" },
        { id: "ready", label: "Liberados" },
        { id: "analyzing", label: "Em análise" }].
        map((f) =>
        <button
          key={f.id}
          onClick={() => setFilter(f.id)}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
          filter === f.id ?
          "bg-blue-600 text-white shadow-md shadow-blue-500/25" :
          "bg-white text-gray-600 border border-gray-100"}`
          }>
          
            {f.label}
          </button>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {filtered.map((e) =>
        <ExamCard key={e.id} exam={e} onClick={() => onSelect(e)} />
        )}
        {filtered.length === 0 &&
        <div className="text-center text-gray-400 text-sm py-12">Nenhum exame nesse filtro.</div>
        }
      </div>
    </div>);

}

function ScheduleView() {
  const slots = [
  { date: "Hoje", times: ["14:30", "15:00", "16:15"] },
  { date: "Amanhã", times: ["07:00", "07:30", "08:00", "09:15"] },
  { date: "Sex, 8 Mai", times: ["07:00", "08:30", "10:00"] }];

  return (
    <div className="px-6 pt-5 pb-4">
      <h2 className="text-xl font-bold text-slate-800 mb-1">Agendar coleta</h2>
      <p className="text-sm text-gray-500 mb-4">Unidade Asa Sul · 2,4 km</p>

      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-4 mb-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-white text-blue-600 flex items-center justify-center shrink-0 shadow-sm">
          <Icon name="map-pin" className="w-5 h-5" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">SGAS 915, Bloco B</p>
          <p className="text-xs text-gray-500">Asa Sul, Brasília · DF</p>
        </div>
        <button className="text-xs font-semibold text-blue-600">Trocar</button>
      </div>

      <div className="flex flex-col gap-4">
        {slots.map((s) =>
        <div key={s.date}>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">{s.date}</p>
            <div className="grid grid-cols-3 gap-2">
              {s.times.map((t) =>
            <button
              key={t}
              className="bg-white border border-gray-100 rounded-xl py-3 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 active:scale-95 transition-all duration-200">
              
                  {t}
                </button>
            )}
            </div>
          </div>
        )}
      </div>
    </div>);

}

function ProfileView({ patientName }) {
  const items = [
  { icon: "user-round", label: "Dados pessoais" },
  { icon: "shield-check", label: "Convênio e plano" },
  { icon: "users", label: "Dependentes" },
  { icon: "file-text", label: "Documentos" },
  { icon: "bell", label: "Notificações" },
  { icon: "lock", label: "Privacidade" },
  { icon: "circle-help", label: "Central de ajuda" }];

  return (
    <div className="px-6 pt-5 pb-4">
      <div className="flex flex-col items-center text-center mb-6">
        <div className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-2xl font-bold shadow-lg shadow-blue-500/30 mb-3">
          {patientName.charAt(0).toUpperCase()}
        </div>
        <h2 className="text-xl font-bold text-slate-800">{patientName} Almeida</h2>
        <p className="text-sm text-gray-500">CPF ••••.•••.123-45</p>
        <div className="mt-2 inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 rounded-full px-3 py-1 text-[11px] font-semibold">
          <Icon name="shield-check" className="w-3.5 h-3.5" strokeWidth={2.4} />
          Plano Premium · Unimed
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {items.map((it, i) =>
        <button
          key={it.label}
          className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 transition-colors min-h-[44px] ${
          i !== items.length - 1 ? "border-b border-gray-50" : ""}`
          }>
          
            <div className="h-9 w-9 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center shrink-0">
              <Icon name={it.icon} className="w-4 h-4" strokeWidth={2.2} />
            </div>
            <span className="flex-1 text-sm font-medium text-slate-700">{it.label}</span>
            <Icon name="chevron-right" className="w-4 h-4 text-gray-300" strokeWidth={2} />
          </button>
        )}
      </div>

      <button className="w-full mt-4 text-red-600 text-sm font-semibold py-3">
        Sair da conta
      </button>
    </div>);

}

// ============================================================
// Home view
// ============================================================
function HomeView({ exams, onSelect, heroVariant, onAction }) {
  const last = exams[0];
  return (
    <>
      <HeroCard exam={last} onOpen={() => onSelect(last)} variant={heroVariant} />
      <QuickActions onAction={onAction} />

      <div className="px-6 pt-4 pb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Histórico de Exames</h2>
        <button className="text-xs font-semibold text-blue-600">Ver todos</button>
      </div>
      <div className="px-6 flex flex-col gap-3 pb-6">
        {exams.map((e) =>
        <ExamCard key={e.id} exam={e} onClick={() => onSelect(e)} />
        )}
      </div>

      {/* Care card */}
      <div className="px-6 pb-6">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 flex items-center gap-3 shadow-sm">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white flex items-center justify-center shrink-0">
            <Icon name="heart-pulse" className="w-5 h-5" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800">Acompanhamento</p>
            <p className="text-xs text-gray-500 leading-snug">Veja a evolução dos seus marcadores ao longo do tempo.</p>
          </div>
          <Icon name="chevron-right" className="w-5 h-5 text-gray-300" strokeWidth={2} />
        </div>
      </div>
    </>);

}

// ============================================================
// App shell — single screen of the patient portal
// ============================================================
function LabHubApp({ tweaks, setTweak }) {
  const [tab, setTab] = useState("home");
  const [openExam, setOpenExam] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);

  // Re-init lucide when content changes
  useEffect(() => {
    if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 2 } });
  });

  const handleAction = (id) => {
    if (id === "results") setTab("results");else
    if (id === "schedule") setTab("schedule");else
    alert(`Ação: ${id}`);
  };

  return (
    <div
      className="max-w-md mx-auto min-h-screen bg-slate-50 relative pb-20 overflow-hidden"
      data-screen-label="01 Lab Hub"
      style={{ width: "100%" }}>
      
      <Header
        patientName={tweaks.patientName}
        onNotifications={() => setNotifOpen(true)} />
      

      {tab === "home" &&
      <HomeView
        exams={EXAMS}
        onSelect={setOpenExam}
        heroVariant={tweaks.heroStyle}
        onAction={handleAction} />

      }
      {tab === "results" && <ResultsView exams={EXAMS} onSelect={setOpenExam} />}
      {tab === "schedule" && <ScheduleView />}
      {tab === "profile" && <ProfileView patientName={tweaks.patientName} />}

      <BottomNav active={tab} onChange={setTab} />
      <BottomSheet exam={openExam} open={!!openExam} onClose={() => setOpenExam(null)} />
      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>);

}

// Make available for the entry script
window.LabHubApp = LabHubApp;
window.TWEAKS_DEFAULTS = TWEAKS;