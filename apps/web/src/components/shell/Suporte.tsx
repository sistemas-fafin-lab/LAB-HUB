import { useEffect, useRef, useState } from 'react'
import { Ico, IconBtn } from '../portal'

// Chatbot "Lia" — mesmo comportamento do SupportDock antigo (sem backend de
// suporte: responde com uma confirmação fixa). Só aparece com MOSTRAR_CHATBOT.

interface Mensagem {
  from: 'agent' | 'user'
  text: string
}

export function Suporte({ primeiroNome }: { primeiroNome: string }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Mensagem[]>([])
  const [draft, setDraft] = useState('')
  const listaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listaRef.current) listaRef.current.scrollTop = listaRef.current.scrollHeight
  }, [messages, open])

  useEffect(() => {
    if (!open) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [open])

  // Saudação (texto do design) com o nome real; sem nome (ainda carregando), genérica.
  const saudacao = primeiroNome
    ? `Olá, ${primeiroNome}. Sou a Lia, assistente do Lab Hub. Em que posso ajudar?`
    : 'Olá. Sou a Lia, assistente do Lab Hub. Em que posso ajudar?'

  const send = () => {
    if (!draft.trim()) return
    setMessages((m) => [...m, { from: 'user', text: draft }])
    setDraft('')
    setTimeout(() => {
      setMessages((m) => [...m, { from: 'agent', text: 'Anotado! Vou verificar isso e já te respondo.' }])
    }, 700)
  }

  const balao = (m: Mensagem, key: string | number) => (
    <div
      key={key}
      className={
        'max-w-[85%] rounded-[16px] px-3 py-2 text-[14px] leading-snug ' +
        (m.from === 'user' ? 'self-end bg-action text-white rounded-br-[6px]' : 'self-start bg-card border border-line rounded-bl-[6px]')
      }
    >
      {m.text}
    </div>
  )

  return (
    <div className="lh-dock fixed bottom-5 right-5 z-30 flex flex-col items-end">
      {open && (
        <div
          role="dialog"
          aria-label="Suporte"
          className="mb-3 w-[340px] max-w-[calc(100vw-40px)] h-[460px] max-h-[calc(100vh-120px)] bg-card border border-line rounded-[20px] shadow-float overflow-hidden flex flex-col lh-fade"
        >
          <div className="px-4 py-3 border-b border-line flex items-center gap-3">
            <span className="w-9 h-9 rounded-[10px] bg-subtle text-ink inline-flex items-center justify-center">
              <Ico name="message-circle" size={18} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold">Lia · Suporte Lab Hub</div>
              <div className="text-[12px] text-muted flex items-center gap-1.5">
                <span className="lh-bl" style={{ background: 'var(--lh-brand)' }} />
                {/* O design dizia "Online · responde em 1 min": sem atendimento por
                    trás, não se promete tempo de resposta. */}
                Assistente virtual
              </div>
            </div>
            <IconBtn icon="x" label="Fechar suporte" onClick={() => setOpen(false)} />
          </div>
          <div ref={listaRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 bg-page" aria-live="polite">
            {balao({ from: 'agent', text: saudacao }, 'saudacao')}
            {messages.map((m, i) => balao(m, i))}
          </div>
          <div className="p-3 border-t border-line flex items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Escreva sua mensagem"
              aria-label="Mensagem"
              className="lh-field flex-1 h-10 px-3 rounded-xl bg-subtle text-[14px] text-ink outline-none placeholder:text-muted"
            />
            <IconBtn icon="send" label="Enviar" variant="primary" onClick={send} />
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Fechar suporte' : 'Abrir suporte'}
        aria-expanded={open}
        className="relative h-12 w-12 rounded-[14px] bg-fab text-fab-ink inline-flex items-center justify-center shadow-float"
      >
        <Ico name={open ? 'x' : 'message-circle'} size={20} />
      </button>
    </div>
  )
}
