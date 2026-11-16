import { useState } from 'react'
import type { FormEvent } from 'react'
import { Btn, Modal } from '../portal'
import { AvisoErro, CampoSenha, RegrasSenha } from '../acesso/pecas'
import { conferirSenha, supabase } from '../../lib/supabase'
import { errosDaTrocaDeSenha } from '../../lib/validators'
import type { ErrosDaTrocaDeSenha as Erros } from '../../lib/validators'
import { avisar } from '../../lib/avisos'
import { track } from '../../lib/analytics'

export function CaixaAlterarSenha({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erros, setErros] = useState<Erros>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const fechar = () => {
    setAtual('')
    setNova('')
    setConfirmacao('')
    setErros({})
    setErroGeral(null)
    onFechar()
  }

  const salvar = async (e?: FormEvent) => {
    e?.preventDefault()
    setErroGeral(null)
    const proximos = errosDaTrocaDeSenha(atual, nova, confirmacao)
    setErros(proximos)
    if (Object.values(proximos).some(Boolean)) return

    setSalvando(true)
    try {
      const { data } = await supabase.auth.getUser()
      const email = data.user?.email
      if (!email || !(await conferirSenha(email, atual))) {
        setErros({ atual: 'Senha atual incorreta.' })
        return
      }
      const { error } = await supabase.auth.updateUser({ password: nova })
      if (error) {
        setErroGeral('Não foi possível alterar a senha. Tente de novo em instantes.')
        return
      }
      track('senha_alterada')
      avisar({ title: 'Senha alterada', message: 'Use a nova senha no próximo acesso.' })
      fechar()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      open={aberta}
      title="Alterar senha"
      {...(salvando ? {} : { onClose: fechar })}
      footer={
        <>
          <Btn variant="secondary" disabled={salvando} onClick={fechar}>
            Cancelar
          </Btn>
          <Btn loading={salvando} onClick={() => void salvar()}>
            {salvando ? 'Salvando…' : 'Salvar senha'}
          </Btn>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => void salvar(e)} noValidate>
        <CampoSenha id="senha-atual" label="Senha atual" value={atual} onChange={setAtual} error={erros.atual} autoComplete="current-password" />
        <CampoSenha id="senha-nova" label="Nova senha" value={nova} onChange={setNova} error={erros.nova} autoComplete="new-password" />
        <RegrasSenha senha={nova} />
        <CampoSenha
          id="senha-confirmacao"
          label="Confirmar nova senha"
          value={confirmacao}
          onChange={setConfirmacao}
          error={erros.confirmacao}
          autoComplete="new-password"
        />
        {erroGeral && <AvisoErro>{erroGeral}</AvisoErro>}
        {/* Enter num campo envia o formulário. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  )
}
