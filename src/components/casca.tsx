'use client';

import {
  BarChart3, Bell, CalendarDays, FileText, Handshake, Images, LayoutDashboard, LogOut, Megaphone, Menu, Receipt,
  Settings, ShieldAlert, Shirt, Smartphone, Trophy, UserCog, Users, Wallet, X, type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { MENU, PAPEIS, PAPEIS_ESP, PAPEIS_FIN, podeAcessar } from '@/lib/constants';
import { dataHoraBR, hojeBR, somarDias } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import { useApp } from './contexto';
import { Botao, Vazio, cx } from './ui';

const ICONES: Record<string, LucideIcon> = {
  LayoutDashboard, Smartphone, CalendarDays, Megaphone, Users, Trophy, BarChart3, ShieldAlert, Shirt, Receipt, Wallet,
  Handshake, Images, FileText, UserCog, Settings,
};

async function sair() {
  await createClient().auth.signOut();
  window.location.href = '/login';
}

export function SemAcesso({ email, motivo }: { email: string; motivo?: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/escudo.jpg" alt="" className="mx-auto mb-4 h-20 w-20 rounded-2xl" />
        <h1 className="text-xl font-bold uppercase">Acesso não liberado</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {motivo ?? <>A conta <strong>{email}</strong> ainda não foi liberada. Peça ao administrador do clube para ativar o seu acesso.</>}
        </p>
        <Botao variante="secundario" className="mt-5" onClick={sair} icone={<LogOut className="h-4 w-4" />}>Sair</Botao>
      </div>
    </main>
  );
}

type Notificacao = { texto: string; href: string; tom: 'vermelho' | 'amarelo' | 'azul' };

function useNotificacoes(): Notificacao[] {
  const { supabase, perfil, config, pode } = useApp();
  const [lista, setLista] = useState<Notificacao[]>([]);
  const caminho = usePathname();

  useEffect(() => {
    let vivo = true;
    (async () => {
      const n: Notificacao[] = [];
      const hoje = hojeBR();
      if (pode(...PAPEIS_FIN)) {
        const { data } = await supabase.from('mensalidades').select('vencimento, comprovante_enviado_em').eq('status', 'pendente');
        const pend = data ?? [];
        const atrasadas = pend.filter((m) => m.vencimento < hoje).length;
        const limite = somarDias(hoje, config.dias_alerta);
        const vencendo = pend.filter((m) => m.vencimento >= hoje && m.vencimento <= limite).length;
        const comprovantes = pend.filter((m) => m.comprovante_enviado_em).length;
        if (atrasadas) n.push({ texto: `${atrasadas} taxa(s) de jogo em atraso`, href: '/mensalidades', tom: 'vermelho' });
        if (vencendo) n.push({ texto: `${vencendo} taxa(s) de jogo a pagar nos próximos ${config.dias_alerta} dias`, href: '/mensalidades', tom: 'amarelo' });
        if (comprovantes) n.push({ texto: `${comprovantes} comprovante(s) enviado(s) aguardando conferência`, href: '/mensalidades', tom: 'azul' });
      }
      if (pode(...PAPEIS_ESP)) {
        const { data: prox } = await supabase.from('partidas').select('id, adversario, data_hora').eq('status', 'agendada')
          .gte('data_hora', new Date().toISOString()).order('data_hora').limit(1).maybeSingle();
        if (prox) {
          n.push({ texto: `Próximo jogo: ${prox.adversario} em ${dataHoraBR(prox.data_hora)}`, href: `/partidas/${prox.id}`, tom: 'azul' });
          const { count } = await supabase.from('convocacoes').select('id', { count: 'exact', head: true }).eq('partida_id', prox.id).eq('status', 'aguardando');
          if (count) n.push({ texto: `${count} atleta(s) ainda não responderam à convocação`, href: `/partidas/${prox.id}`, tom: 'amarelo' });
        }
      }
      if (vivo) setLista(n);
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caminho === '/painel', perfil.id]);
  return lista;
}

export function Casca({ children }: { children: ReactNode }) {
  const { perfil, config } = useApp();
  const caminho = usePathname();
  const router = useRouter();
  const [menuAberto, setMenuAberto] = useState(false);
  const [sino, setSino] = useState(false);
  const notificacoes = useNotificacoes();
  const permitido = podeAcessar(caminho, perfil.papel);

  useEffect(() => { setMenuAberto(false); setSino(false); }, [caminho]);
  useEffect(() => {
    if (perfil.papel === 'atleta' && !caminho.startsWith('/portal')) router.replace('/portal');
  }, [perfil.papel, caminho, router]);

  const grupos = MENU.map((g) => ({ ...g, itens: g.itens.filter((i) => i.papeis.includes(perfil.papel)) })).filter((g) => g.itens.length);
  const cores = { vermelho: 'bg-red-500', amarelo: 'bg-amber-500', azul: 'bg-sky-500' };

  return (
    <div className="min-h-dvh lg:pl-64">
      {menuAberto && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setMenuAberto(false)} />}
      <aside className={cx('nao-imprimir fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-secondary text-white transition-transform lg:translate-x-0', menuAberto ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={config.escudo_url || '/escudo.jpg'} alt="Escudo" className="h-12 w-12 rounded-xl object-cover ring-1 ring-white/20" />
          <div className="min-w-0 leading-tight">
            <p className="font-display truncate text-lg font-bold uppercase">{config.nome_clube}</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-accent">Futebol Clube</p>
          </div>
          <button className="ml-auto rounded p-1 text-white/70 hover:bg-white/10 lg:hidden" onClick={() => setMenuAberto(false)} aria-label="Fechar menu"><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {grupos.map((g) => (
            <div key={g.grupo} className="mb-3">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/40">{g.grupo}</p>
              {g.itens.map((i) => {
                const Icone = ICONES[i.icone];
                const ativo = caminho === i.href || caminho.startsWith(i.href + '/');
                return (
                  <Link key={i.href} href={i.href} aria-current={ativo ? 'page' : undefined}
                    className={cx('mb-0.5 flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition', ativo ? 'bg-primary font-medium text-white' : 'text-white/75 hover:bg-white/10 hover:text-white')}>
                    <Icone className="h-[18px] w-[18px] shrink-0" /> {i.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="mb-2 px-1 leading-tight">
            <p className="truncate text-sm font-medium">{perfil.nome}</p>
            <p className="text-xs text-white/50">{PAPEIS[perfil.papel]}</p>
          </div>
          <button onClick={sair} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-white/75 hover:bg-white/10 hover:text-white">
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>

      <header className="nao-imprimir sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-zinc-200 bg-white/90 px-4 backdrop-blur">
        <button className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 lg:hidden" onClick={() => setMenuAberto(true)} aria-label="Abrir menu"><Menu className="h-5 w-5" /></button>
        <p className="font-display text-sm font-semibold uppercase tracking-wide text-zinc-500 lg:hidden">{config.nome_clube}</p>
        <div className="relative ml-auto">
          {perfil.papel !== 'atleta' && (
            <button onClick={() => setSino(!sino)} className="relative rounded-lg p-2 text-zinc-600 hover:bg-zinc-100" aria-label={`Notificações (${notificacoes.length})`}>
              <Bell className="h-5 w-5" />
              {notificacoes.length > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{notificacoes.length}</span>}
            </button>
          )}
          {sino && (
            <div className="animar-entrada absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-200 bg-white p-2 shadow-xl">
              <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Notificações</p>
              {notificacoes.length === 0 && <p className="px-2 py-4 text-center text-sm text-zinc-500">Tudo em dia por aqui.</p>}
              {notificacoes.map((n, i) => (
                <Link key={i} href={n.href} className="flex items-start gap-2.5 rounded-lg px-2 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
                  <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', cores[n.tom])} /> {n.texto}
                </Link>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        {permitido ? children : <Vazio titulo="Você não tem permissão para acessar esta área" descricao="Seu perfil de acesso não inclui este módulo. Fale com o administrador do clube." icone={<ShieldAlert className="h-6 w-6" />} />}
      </main>
    </div>
  );
}
