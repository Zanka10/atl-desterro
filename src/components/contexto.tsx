'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { AlertTriangle, CheckCircle2, Copy, MessageCircle, Send, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Config, Papel, Perfil } from '@/lib/types';
import { linkWhats, numeroWhats } from '@/lib/whatsapp';
import { Botao, Modal, cx, estiloCampo } from './ui';

type Aviso = { id: number; msg: string; tipo: 'sucesso' | 'erro' | 'info' };
type Confirmacao = { titulo: string; mensagem: ReactNode; textoConfirmar?: string; perigo?: boolean };
type EnvioWhats = { msg: string; tel?: string | null; nome?: string };

interface Ctx {
  perfil: Perfil;
  config: Config;
  setConfig: (c: Config) => void;
  supabase: SupabaseClient;
  pode: (...papeis: Papel[]) => boolean;
  sucesso: (msg: string) => void;
  erro: (e: unknown) => void;
  info: (msg: string) => void;
  confirmar: (c: Confirmacao) => Promise<boolean>;
  whats: (e: EnvioWhats) => void;
}

const Contexto = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(Contexto);
  if (!c) throw new Error('useApp fora do provedor');
  return c;
};

const TRADUCOES: [RegExp, string][] = [
  [/duplicate key.*atletas/i, 'Já existe um registro com esses dados.'],
  [/duplicate key/i, 'Registro duplicado: já existe um item com esses dados.'],
  [/row-level security|permission denied/i, 'Você não tem permissão para realizar esta ação.'],
  [/violates foreign key/i, 'Não é possível concluir: existem registros vinculados.'],
  [/violates check constraint/i, 'Algum valor informado é inválido. Revise os campos.'],
  [/Failed to fetch|NetworkError/i, 'Falha de conexão. Verifique sua internet e tente novamente.'],
  [/JWT expired/i, 'Sua sessão expirou. Entre novamente.'],
];
export function mensagemErro(e: unknown): string {
  const bruto = typeof e === 'string' ? e : (e as { message?: string })?.message || 'Ocorreu um erro inesperado.';
  for (const [re, msg] of TRADUCOES) if (re.test(bruto)) return msg;
  return bruto;
}

export function Provedor({ perfil, config: configInicial, children }: { perfil: Perfil; config: Config; children: ReactNode }) {
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, []);
  const [config, setConfig] = useState(configInicial);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [conf, setConf] = useState<Confirmacao | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const [envio, setEnvio] = useState<EnvioWhats | null>(null);
  const [msg, setMsg] = useState('');
  const [apiWhats, setApiWhats] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const avisar = useCallback((m: string, tipo: Aviso['tipo']) => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a.slice(-3), { id, msg: m, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === 'erro' ? 7000 : 4000);
  }, []);

  useEffect(() => {
    if (perfil.papel === 'atleta') return;
    fetch('/api/whatsapp').then((r) => r.json()).then((d) => setApiWhats(!!d.configurado)).catch(() => {});
  }, [perfil.papel]);

  const valor = useMemo<Ctx>(() => ({
    perfil, config, setConfig, supabase,
    pode: (...papeis) => papeis.includes(perfil.papel),
    sucesso: (m) => avisar(m, 'sucesso'),
    info: (m) => avisar(m, 'info'),
    erro: (e) => avisar(mensagemErro(e), 'erro'),
    confirmar: (c) => new Promise<boolean>((ok) => { resolver.current = ok; setConf(c); }),
    whats: (e) => { setMsg(e.msg); setEnvio(e); },
  }), [perfil, config, supabase, avisar]);

  const responder = (v: boolean) => { resolver.current?.(v); resolver.current = null; setConf(null); };

  const enviarApi = async () => {
    if (!envio) return;
    setEnviando(true);
    try {
      const r = await fetch('/api/whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tel: envio.tel, msg }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro || 'Falha no envio');
      avisar('Mensagem enviada pela API oficial do WhatsApp.', 'sucesso');
      setEnvio(null);
    } catch (e) {
      avisar(mensagemErro(e), 'erro');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Contexto.Provider value={valor}>
      <style>{`:root{--cor-primaria:${config.cor_primaria};--cor-secundaria:${config.cor_secundaria};--cor-destaque:${config.cor_destaque};}`}</style>
      {children}

      <Modal aberto={!!conf} titulo={conf?.titulo ?? ''} aoFechar={() => responder(false)}
        rodape={<>
          <Botao variante="secundario" onClick={() => responder(false)}>Cancelar</Botao>
          <Botao variante={conf?.perigo ? 'perigo' : 'primario'} onClick={() => responder(true)}>{conf?.textoConfirmar ?? 'Confirmar'}</Botao>
        </>}>
        <div className="text-sm text-zinc-700">{conf?.mensagem}</div>
      </Modal>

      <Modal aberto={!!envio} titulo="Enviar pelo WhatsApp" aoFechar={() => setEnvio(null)}
        rodape={<>
          <Botao variante="secundario" icone={<Copy className="h-4 w-4" />} onClick={async () => { await navigator.clipboard.writeText(msg); avisar('Mensagem copiada.', 'info'); }}>Copiar</Botao>
          {apiWhats && numeroWhats(envio?.tel) && (
            <Botao variante="secundario" carregando={enviando} icone={<Send className="h-4 w-4" />} onClick={enviarApi}>Enviar pela API oficial</Botao>
          )}
          <Botao variante="whats" icone={<MessageCircle className="h-4 w-4" />} onClick={() => { window.open(linkWhats(msg, envio?.tel), '_blank', 'noopener'); setEnvio(null); }}>
            Abrir no WhatsApp
          </Botao>
        </>}>
        <p className="mb-2 text-sm text-zinc-600">
          {envio?.tel && numeroWhats(envio.tel)
            ? <>Destinatário: <strong>{envio.nome ?? envio.tel}</strong>. Revise a mensagem; o WhatsApp abrirá com o texto pronto para você enviar.</>
            : <>Revise a mensagem. O WhatsApp abrirá para você escolher o contato ou grupo de destino.</>}
        </p>
        <textarea className={cx(estiloCampo, 'min-h-52 font-mono text-xs')} value={msg} onChange={(e) => setMsg(e.target.value)} />
      </Modal>

      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} role="status" className={cx('animar-entrada pointer-events-auto flex max-w-md items-start gap-2 rounded-xl px-4 py-3 text-sm text-white shadow-lg',
            a.tipo === 'sucesso' ? 'bg-green-700' : a.tipo === 'erro' ? 'bg-red-700' : 'bg-zinc-800')}>
            {a.tipo === 'sucesso' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : a.tipo === 'erro' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{a.msg}</span>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}
