'use client';

import { Loader2, X } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEffect } from 'react';
import { iniciais } from '@/lib/format';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ------------------------------------------------------------------ Botão
type Variante = 'primario' | 'secundario' | 'perigo' | 'fantasma' | 'whats';
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-primary text-white hover:brightness-110 shadow-sm',
  secundario: 'bg-white text-zinc-800 border border-zinc-300 hover:bg-zinc-50',
  perigo: 'bg-red-600 text-white hover:bg-red-700',
  fantasma: 'text-zinc-600 hover:bg-zinc-100',
  whats: 'bg-[#128c4b] text-white hover:brightness-110',
};
export function Botao({
  variante = 'primario', tamanho = 'md', carregando, icone, children, className, ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; tamanho?: 'sm' | 'md'; carregando?: boolean; icone?: ReactNode }) {
  return (
    <button
      type="button"
      {...p}
      disabled={p.disabled || carregando}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 whitespace-nowrap',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        tamanho === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        VARIANTES[variante], className,
      )}
    >
      {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : icone}
      {children}
    </button>
  );
}

export function BotaoIcone({ titulo, children, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { titulo: string }) {
  return (
    <button type="button" title={titulo} aria-label={titulo} {...p}
      className={cx('inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40', className)}>
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ Estrutura
export function Cartao({ children, className, titulo, acao }: { children: ReactNode; className?: string; titulo?: ReactNode; acao?: ReactNode }) {
  return (
    <section className={cx('rounded-xl border border-zinc-200 bg-white shadow-sm', className)}>
      {(titulo || acao) && (
        <header className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-700">{titulo}</h2>
          {acao}
        </header>
      )}
      {children}
    </section>
  );
}

export function Cabecalho({ titulo, descricao, children }: { titulo: string; descricao?: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold uppercase text-zinc-900 sm:text-3xl">{titulo}</h1>
        {descricao && <p className="mt-0.5 text-sm text-zinc-500">{descricao}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export type Tom = 'verde' | 'vermelho' | 'amarelo' | 'azul' | 'cinza' | 'roxo';
const TONS: Record<Tom, string> = {
  verde: 'bg-green-100 text-green-800',
  vermelho: 'bg-red-100 text-red-800',
  amarelo: 'bg-amber-100 text-amber-900',
  azul: 'bg-sky-100 text-sky-800',
  cinza: 'bg-zinc-100 text-zinc-700',
  roxo: 'bg-violet-100 text-violet-800',
};
export function Selo({ tom = 'cinza', children }: { tom?: Tom; children: ReactNode }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', TONS[tom])}>{children}</span>;
}

export const TOM_STATUS: Record<string, Tom> = {
  ativo: 'verde', inativo: 'cinza', lesionado: 'amarelo', suspenso: 'vermelho', afastado: 'roxo',
  em_dia: 'verde', pendente: 'amarelo', inadimplente: 'vermelho', isento: 'azul', negociacao: 'roxo',
  confirmado: 'verde', ausente: 'vermelho', aguardando: 'amarelo',
  pago: 'verde', cancelado: 'cinza', creditado: 'azul', agendada: 'azul', realizada: 'verde', cancelada: 'cinza', adiada: 'amarelo',
  disponivel: 'verde', entregue: 'azul', extraviado: 'vermelho', baixado: 'cinza',
};

export function Indicador({ rotulo, valor, detalhe, icone, tom = 'cinza' }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode; icone?: ReactNode; tom?: Tom | 'primario' }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{rotulo}</p>
        {icone && (
          <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tom === 'primario' ? 'bg-primary/10 text-primary' : TONS[tom])}>
            {icone}
          </span>
        )}
      </div>
      <p className="font-display mt-1 text-2xl font-bold text-zinc-900 tabular-nums">{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-zinc-500">{detalhe}</p>}
    </div>
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
      <Loader2 className="h-5 w-5 animate-spin text-primary" /> {texto}
    </div>
  );
}

export function Vazio({ titulo, descricao, children, icone }: { titulo: string; descricao?: string; children?: ReactNode; icone?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      {icone && <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">{icone}</div>}
      <p className="font-medium text-zinc-800">{titulo}</p>
      {descricao && <p className="mt-1 max-w-md text-sm text-zinc-500">{descricao}</p>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function Avatar({ nome, foto, numero, tamanho = 40 }: { nome: string; foto?: string | null; numero?: number | null; tamanho?: number }) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: tamanho, height: tamanho }}>
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} alt="" className="h-full w-full rounded-full border border-zinc-200 object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full bg-secondary font-semibold text-white" style={{ fontSize: tamanho * 0.36 }}>
          {iniciais(nome)}
        </span>
      )}
      {numero != null && (
        <span className="absolute -bottom-1 -right-1 flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-white">
          {numero}
        </span>
      )}
    </span>
  );
}

// ------------------------------------------------------------------ Modal
export function Modal({ aberto, titulo, aoFechar, children, largo, rodape }: {
  aberto: boolean; titulo: ReactNode; aoFechar: () => void; children: ReactNode; largo?: boolean; rodape?: ReactNode;
}) {
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    document.addEventListener('keydown', tecla);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = '';
    };
  }, [aberto, aoFechar]);
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div role="dialog" aria-modal="true" className={cx('animar-entrada flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', largo ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <header className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3.5">
          <h2 className="text-lg font-bold uppercase text-zinc-900">{titulo}</h2>
          <BotaoIcone titulo="Fechar" onClick={aoFechar}><X className="h-5 w-5" /></BotaoIcone>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <footer className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 px-5 py-3">{rodape}</footer>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Campos
export const estiloCampo =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:bg-zinc-100';

export function Rotulo({ rotulo, obrigatorio, erro, children, dica }: { rotulo: string; obrigatorio?: boolean; erro?: string; children: ReactNode; dica?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-700">
        {rotulo} {obrigatorio && <span className="text-red-600">*</span>}
      </span>
      {children}
      {dica && !erro && <span className="mt-1 block text-xs text-zinc-500">{dica}</span>}
      {erro && <span className="mt-1 block text-xs text-red-600">{erro}</span>}
    </label>
  );
}

export function Abas<T extends string>({ abas, ativa, aoMudar }: { abas: { id: T; rotulo: string; contador?: number }[]; ativa: T; aoMudar: (id: T) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-zinc-200" role="tablist">
      {abas.map((a) => (
        <button key={a.id} role="tab" aria-selected={ativa === a.id} onClick={() => aoMudar(a.id)}
          className={cx('-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition',
            ativa === a.id ? 'border-primary text-primary' : 'border-transparent text-zinc-500 hover:text-zinc-800')}>
          {a.rotulo}
          {a.contador != null && <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">{a.contador}</span>}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Tabela
export type Coluna<T> = { titulo: string; celula: (linha: T) => ReactNode; direita?: boolean; classe?: string };
export function Tabela<T>({ colunas, linhas, chave, aoClicar, vazio }: {
  colunas: Coluna<T>[]; linhas: T[]; chave: (l: T) => string; aoClicar?: (l: T) => void; vazio?: ReactNode;
}) {
  if (!linhas.length) return <>{vazio ?? <Vazio titulo="Nenhum registro encontrado" />}</>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            {colunas.map((c) => (
              <th key={c.titulo} className={cx('px-4 py-2.5 font-medium whitespace-nowrap', c.direita && 'text-right')}>{c.titulo}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {linhas.map((l) => (
            <tr key={chave(l)} onClick={aoClicar ? () => aoClicar(l) : undefined} className={cx(aoClicar && 'cursor-pointer', 'hover:bg-zinc-50')}>
              {colunas.map((c) => (
                <td key={c.titulo} className={cx('px-4 py-2.5 align-middle', c.direita && 'text-right tabular-nums', c.classe)}>{c.celula(l)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
