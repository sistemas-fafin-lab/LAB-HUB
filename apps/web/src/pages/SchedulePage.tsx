import { useState } from "react";
import type { Agendamento } from "@lab-hub/shared";
import { WTabs } from "../components/primitives/WTabs";
import { WIcon } from "../components/primitives/WIcon";
import { BookingPanel } from "../components/schedule/BookingPanel";
import { ColetasList } from "../components/schedule/ColetasList";
import { ColetaTimeline } from "../components/schedule/ColetaTimeline";
import { useAgendamentos } from "../lib/useAgendamentos";
import { api } from "../lib/api";
import { track } from "../lib/analytics";

interface SchedulePageProps {
  dark: boolean;
  // Quando vem da Home ("Detalhes" da próxima coleta): abre já na linha do
  // tempo desse agendamento, na aba "Minhas coletas".
  initialSelectedId?: string | null;
}

type ColetaTab = "agendar" | "minhas";

export function SchedulePage({
  dark,
  initialSelectedId = null,
}: SchedulePageProps) {
  const [tab, setTab] = useState<ColetaTab>(
    initialSelectedId ? "minhas" : "agendar",
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId,
  );
  const [resyncingId, setResyncingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { agendamentos, loading, error, reload, setStatus } = useAgendamentos();

  // Reenvia ao FlowLab um agendamento que ficou 'pendente' (POST .../sync).
  const handleResync = async (id: string) => {
    track("agendamento_resync");
    setResyncingId(id);
    try {
      await api.post<Agendamento>(`/agendamentos/${id}/sync`, {});
    } finally {
      setResyncingId(null);
      reload();
    }
  };

  // Marca o agendamento como 'cancelado' — mantém o histórico (POST .../cancelar).
  // Optimistic UI: o item permanece na lista e já exibe o status 'cancelado'; em
  // caso de falha, recarrega do servidor p/ voltar ao estado correto.
  const handleCancel = async (id: string) => {
    track("agendamento_cancelado");
    setCancellingId(id);
    setStatus(id, "cancelado");
    try {
      await api.post<Agendamento>(`/agendamentos/${id}/cancelar`, {});
    } catch {
      reload();
    } finally {
      setCancellingId(null);
    }
  };

  // Badge da aba: coletas em andamento (agendada/check-in/bloqueada); ignora
  // as concluídas (realizada) e as canceladas.
  const emAndamento = agendamentos.filter(
    (a) => a.status !== "realizado" && a.status !== "cancelado",
  ).length;

  const tabs = [
    { id: "agendar" as const, label: "Agendar" },
    { id: "minhas" as const, label: "Minhas coletas", count: emAndamento },
  ];

  // Detalhe (linha do tempo) de um agendamento — ocupa a tela inteira, com o seu
  // próprio "Voltar". Cai fora se o item sumir da lista após um reload.
  const selected = selectedId
    ? (agendamentos.find((a) => a.id === selectedId) ?? null)
    : null;
  if (selected) {
    return (
      <ColetaTimeline
        agendamento={selected}
        dark={dark}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1
        className={`text-2xl font-bold mb-1 ${dark ? "text-white" : "text-slate-900"}`}
        style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
      >
        Agendas/Coletas
      </h1>
      <p className="text-sm text-gray-500 mb-5">
        Agende uma nova coleta ou acompanhe os seus agendamentos.
      </p>

      <div className="mb-6 flex items-center gap-2">
        <WTabs items={tabs} value={tab} onChange={setTab} dark={dark} />
        <button
          onClick={() => {
            setRefreshKey((k) => k + 1);
            reload();
          }}
          className={`ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
            dark
              ? "bg-gray-900 border-gray-800 text-gray-400 hover:text-white hover:bg-gray-800"
              : "bg-white border-gray-100 text-gray-600 hover:text-slate-900 hover:bg-gray-50"
          }`}
          title="Recarregar datas de coleta"
        >
          <WIcon name="refresh-cw" className="w-4 h-4" />
          Recarregar
        </button>
      </div>

      {tab === "agendar" ? (
        <BookingPanel
          dark={dark}
          refreshKey={refreshKey}
          // Abre a coleta recém-criada: é onde o paciente anexa os documentos,
          // no momento de maior motivação ("adiante seu check-in").
          onBooked={(ag) => {
            reload();
            setSelectedId(ag.id);
            setTab("minhas");
          }}
        />
      ) : (
        <ColetasList
          agendamentos={agendamentos}
          loading={loading}
          error={error}
          dark={dark}
          resyncingId={resyncingId}
          onResync={(id) => void handleResync(id)}
          cancellingId={cancellingId}
          onCancel={(id) => void handleCancel(id)}
          onAgendar={() => setTab("agendar")}
          onOpen={setSelectedId}
        />
      )}
    </div>
  );
}
