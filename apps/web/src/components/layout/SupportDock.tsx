import { useState } from 'react'
import { WIcon } from '../primitives/WIcon'

interface ChatMessage {
  from: 'agent' | 'user'
  text: string
}

interface SupportDockProps {
  dark: boolean
}

const INITIAL_MESSAGES: ChatMessage[] = [
  { from: 'agent', text: 'Olá, João! Sou a Lia, sua assistente do Lab Hub. Em que posso ajudar?' },
]

export function SupportDock({ dark }: SupportDockProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES)
  const [draft, setDraft] = useState('')

  const send = () => {
    if (!draft.trim()) return
    setMessages((m) => [...m, { from: 'user', text: draft }])
    setDraft('')
    setTimeout(() => {
      setMessages((m) => [...m, { from: 'agent', text: 'Anotado! Vou verificar isso e já te respondo.' }])
    }, 700)
  }

  return (
    <div className="fixed bottom-5 right-5 z-30">
      {open && (
        <div
          className={`mb-3 w-[340px] rounded-2xl shadow-2xl border ${
            dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
          } overflow-hidden flex flex-col`}
          style={{ height: 440 }}
        >
          {/* Header */}
          <div className="bg-gradient-to-br from-blue-900 via-blue-700 to-indigo-800 p-4 text-white relative overflow-hidden">
            <div className="absolute -bottom-6 -right-6 opacity-10">
              <WIcon name="message-circle" className="w-24 h-24" strokeWidth={1.4} />
            </div>
            <div className="flex items-start gap-3 relative">
              <div className="h-10 w-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center">
                <WIcon name="sparkles" className="w-5 h-5" strokeWidth={2.2} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold">Lia · Suporte Lab Hub</div>
                <div className="text-[11px] text-blue-100/80 inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Online · responde em 1 min
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="h-8 w-8 rounded-lg hover:bg-white/10 flex items-center justify-center"
              >
                <WIcon name="x" className="w-4 h-4" strokeWidth={2.4} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            className={`flex-1 overflow-y-auto p-4 flex flex-col gap-2 ${
              dark ? 'bg-gray-900' : 'bg-slate-50'
            }`}
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug ${
                  m.from === 'user'
                    ? 'bg-blue-600 text-white self-end rounded-br-md'
                    : dark
                    ? 'bg-gray-800 text-gray-100 self-start rounded-bl-md'
                    : 'bg-white text-slate-800 border border-gray-100 self-start rounded-bl-md'
                }`}
              >
                {m.text}
              </div>
            ))}
          </div>

          {/* Input */}
          <div
            className={`p-3 border-t ${
              dark ? 'border-gray-800 bg-gray-900' : 'border-gray-100 bg-white'
            } flex items-center gap-2`}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Escreva sua mensagem…"
              className={`flex-1 text-sm rounded-xl px-3 h-9 outline-none border ${
                dark
                  ? 'bg-gray-800 border-gray-700 text-white placeholder:text-gray-500'
                  : 'bg-slate-50 border-gray-100 text-slate-800 placeholder:text-gray-400'
              } focus:border-blue-500`}
            />
            <button
              onClick={send}
              className="h-9 w-9 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:scale-95"
            >
              <WIcon name="send" className="w-4 h-4" strokeWidth={2.4} />
            </button>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-xl shadow-blue-500/40 hover:shadow-2xl hover:scale-105 active:scale-95 transition relative"
      >
        <WIcon name={open ? 'x' : 'message-circle'} className="w-6 h-6" strokeWidth={2.2} />
        {!open && (
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white" />
        )}
      </button>
    </div>
  )
}
