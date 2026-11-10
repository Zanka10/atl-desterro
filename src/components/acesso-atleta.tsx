'use client';

import { KeyRound, MessageCircle, ShieldOff, Smartphone, Wand2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { dataHoraBR, telefoneBR } from '@/lib/format';
import { chaveTelefone } from '@/lib/telefone';
import type { Atleta } from '@/lib/types';
import { MSG } from '@/lib/whatsapp';
import { mensagemErro, useApp } from './contexto';
import { Avatar, Botao, BotaoIcone, Cartao, Modal, Rotulo, Selo, Tabela, cx, estiloCampo } from './ui';

export type Acesso = { atleta_id: string; definido_em: string; definido_por: string | null; ultimo_acesso: string | null; bloqueado_ate: string | null };

export const linkEntrada = () => (typeof window !== 'undefined' ? `${window.location.origin}/entrar` : '/entrar');

async function chamar(metodo: 'GET' | 'POST' | 'DELETE', corpo?: object, query = '') {
  const r = await fetch(`/api/acesso-atleta${query}`, {
    method: metodo, headers: corpo ? { 'Content-Type': 'application/json' } : undefined, body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro || 'Falha na operação.');
  return d;
}

/** Situação de acesso por telefone de todos os atletas. */
export function useAcessos() {
  const [acessos, setAcessos] = useState<Map<string, Acesso> | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const recarregar = useCallback(async () => {
    try {
      const d = await chamar('GET');
      setAcessos(new Map((d.acessos as Acesso[]).map((a) => [a.atleta_id, a])));
      setFalha(null);
    } catch (e) {
      setFalha(mensagemErro(e));
    }
  }, []);
  useEffect(() => { recarregar(); }, [recarregar]);
  return { acessos, falha, recarregar };
}

/** Ações de PIN de um atleta: gerar/definir, enviar pelo WhatsApp e remover. */
function useAcoesPin(aoMudar: () => void) {
  const { config, sucesso, erro, confirmar, whats } = useApp();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [definindo, setDefinindo] = useState<Atleta | null>(null);

  const enviar = (a: Atleta, pin: string) =>
    whats({ tel: a.telefone, nome: a.nome, msg: MSG.acesso(a.apelido || a.nome.split(' ')[0], telefoneBR(a.telefone), pin, linkEntrada(), config) });

  const salvar = async (a: Atleta, pin?: string) => {
    setOcupado(a.id);
    try {
      const d = await chamar('POST', { atleta_id: a.id, pin });
      sucesso(`PIN de ${a.nome} definido: ${d.pin}. Envie a mensagem para o atleta.`);
      aoMudar();
      enviar(a, d.pin);
      return true;
    } catch (e) {
      erro(e);
      return false;
    } finally {
      setOcupado(null);
    }
  };

  const remover = async (a: Atleta) => {
    if (!(await confirmar({ titulo: 'Remover acesso', perigo: true, textoConfirmar: 'Remover',
      mensagem: <>{a.nome} não conseguirá mais entrar com telefone e PIN até receber um novo PIN.</> }))) return;
    try {
      await chamar('DELETE', undefined, `?atleta_id=${a.id}`);
      sucesso('Acesso removido.');
      aoMudar();
    } catch (e) {
      erro(e);
    }
  };

  return { ocupado, definindo, setDefinindo, salvar, remover };
}

function ModalDefinirPin({ atleta, aoFechar, aoSalvar }: { atleta: Atleta | null; aoFechar: () => void; aoSalvar: (a: Atleta, pin?: string) => Promise<boolean> }) {
  const [pin, setPin] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => setPin(''), [atleta]);
  const ok = /^\d{4}$/.test(pin);
  return (
    <Modal aberto={!!atleta} titulo={`PIN de ${atleta?.nome ?? ''}`} aoFechar={aoFechar}
      rodape={<>
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao carregando={salvando} disabled={!ok} onClick={async () => { setSalvando(true); if (await aoSalvar(atleta!, pin)) aoFechar(); setSalvando(false); }}>Salvar e enviar</Botao>
      </>}>
      <Rotulo rotulo="Novo PIN (4 números)" dica="Evite sequências (1234) e números repetidos (1111).">
        <input className={cx(estiloCampo, 'font-display text-center text-2xl tracking-[0.5em]')} inputMode="numeric" maxLength={4} autoFocus
          value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
      </Rotulo>
    </Modal>
  );
}

/** Cartão de acesso na ficha do atleta. */
export function CartaoAcesso({ atleta }: { atleta: Atleta }) {
  const { acessos, falha, recarregar } = useAcessos();
  const { ocupado, definindo, setDefinindo, salvar, remover } = useAcoesPin(recarregar);
  const acesso = acessos?.get(atleta.id);
  const semTelefone = !chaveTelefone(atleta.telefone);
  const bloqueado = acesso?.bloqueado_ate && new Date(acesso.bloqueado_ate) > new Date();

  return (
    <Cartao titulo="Acesso ao portal (telefone + PIN)">
      <div className="space-y-3 p-4 text-sm">
        {falha ? <p className="text-red-700">{falha}</p> : !acessos ? <p className="text-zinc-500">Carregando…</p> : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {acesso ? <Selo tom={bloqueado ? 'vermelho' : 'verde'}>{bloqueado ? 'Bloqueado por tentativas' : 'PIN definido'}</Selo> : <Selo>Sem acesso</Selo>}
              <span className="text-zinc-600">Telefone de entrada: <strong>{telefoneBR(atleta.telefone)}</strong></span>
            </div>
            {acesso && (
              <p className="text-xs text-zinc-500">
                PIN definido em {dataHoraBR(acesso.definido_em)}{acesso.definido_por ? ` por ${acesso.definido_por}` : ''} ·
                {' '}{acesso.ultimo_acesso ? `último acesso em ${dataHoraBR(acesso.ultimo_acesso)}` : 'ainda não entrou'}
              </p>
            )}
            {semTelefone && <p className="text-amber-800">Cadastre o telefone com DDD (botão Editar) para liberar o acesso.</p>}
            <div className="flex flex-wrap gap-2">
              <Botao tamanho="sm" icone={<Wand2 className="h-3.5 w-3.5" />} disabled={semTelefone} carregando={ocupado === atleta.id} onClick={() => salvar(atleta)}>
                {acesso ? 'Gerar novo PIN e enviar' : 'Gerar PIN e enviar'}
              </Botao>
              <Botao variante="secundario" tamanho="sm" icone={<KeyRound className="h-3.5 w-3.5" />} disabled={semTelefone} onClick={() => setDefinindo(atleta)}>Escolher PIN</Botao>
              {acesso && <Botao variante="fantasma" tamanho="sm" icone={<ShieldOff className="h-3.5 w-3.5" />} onClick={() => remover(atleta)}>Remover acesso</Botao>}
            </div>
            <p className="text-xs text-zinc-500">O PIN é mostrado só no momento em que é criado. Se o atleta esquecer, gere um novo.</p>
          </>
        )}
      </div>
      <ModalDefinirPin atleta={definindo} aoFechar={() => setDefinindo(null)} aoSalvar={salvar} />
    </Cartao>
  );
}

/** Lista de acessos de todo o elenco, com geração em lote. */
export function ModalAcessos({ aberto, aoFechar, atletas }: { aberto: boolean; aoFechar: () => void; atletas: Atleta[] }) {
  const { acessos, falha, recarregar } = useAcessos();
  const { ocupado, definindo, setDefinindo, salvar, remover } = useAcoesPin(recarregar);
  const elenco = atletas.filter((a) => a.status !== 'inativo');
  const semAcesso = elenco.filter((a) => acessos && !acessos.has(a.id));

  return (
    <Modal aberto={aberto} titulo="Acesso dos atletas ao portal" aoFechar={aoFechar} largo>
      <p className="mb-3 text-sm text-zinc-600">
        Cada atleta entra em <strong>{linkEntrada().replace(/^https?:\/\//, '')}</strong> com o telefone cadastrado e um PIN de 4 números.
        Ao gerar o PIN, o WhatsApp abre com a mensagem pronta para você enviar ao atleta. {semAcesso.length > 0 && <>Faltam <strong>{semAcesso.length}</strong> atleta(s) sem acesso.</>}
      </p>
      {falha ? <p className="text-sm text-red-700">{falha}</p> : (
        <Cartao>
          <Tabela linhas={elenco} chave={(a) => a.id} colunas={[
            { titulo: 'Atleta', celula: (a) => <div className="flex items-center gap-2"><Avatar nome={a.nome} foto={a.foto_url} tamanho={30} /><span className="font-medium text-zinc-900">{a.nome}</span></div> },
            { titulo: 'Telefone', celula: (a) => (chaveTelefone(a.telefone) ? telefoneBR(a.telefone) : <span className="text-amber-700">sem telefone válido</span>) },
            { titulo: 'Acesso', celula: (a) => {
              const ac = acessos?.get(a.id);
              if (!acessos) return '…';
              if (!ac) return <Selo>Sem PIN</Selo>;
              return <Selo tom={ac.ultimo_acesso ? 'verde' : 'amarelo'}>{ac.ultimo_acesso ? 'Já entrou' : 'PIN enviado'}</Selo>;
            } },
            { titulo: '', celula: (a) => {
              const ac = acessos?.get(a.id);
              const valido = !!chaveTelefone(a.telefone);
              return (
                <div className="flex justify-end gap-1">
                  <Botao tamanho="sm" variante={ac ? 'secundario' : 'primario'} icone={<MessageCircle className="h-3.5 w-3.5" />} disabled={!valido || !acessos} carregando={ocupado === a.id} onClick={() => salvar(a)}>
                    {ac ? 'Novo PIN' : 'Gerar e enviar'}
                  </Botao>
                  <BotaoIcone titulo="Escolher PIN" disabled={!valido} onClick={() => setDefinindo(a)}><KeyRound className="h-4 w-4" /></BotaoIcone>
                  {ac && <BotaoIcone titulo="Remover acesso" onClick={() => remover(a)}><ShieldOff className="h-4 w-4" /></BotaoIcone>}
                </div>
              );
            } },
          ]} />
        </Cartao>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500"><Smartphone className="h-3.5 w-3.5" /> O PIN aparece só uma vez, na mensagem. Se o atleta esquecer, gere um novo.</p>
      <ModalDefinirPin atleta={definindo} aoFechar={() => setDefinindo(null)} aoSalvar={salvar} />
    </Modal>
  );
}
