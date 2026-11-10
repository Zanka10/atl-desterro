'use client';

import type { Individual } from '@/lib/estatisticas';
import { nomeCurto } from '@/lib/format';
import { Avatar, Cartao, Vazio } from './ui';

export function Ranking({ titulo, linhas, valor, unidade }: { titulo: string; linhas: Individual[]; valor: (i: Individual) => number; unidade: string }) {
  const top = linhas.filter((i) => valor(i) > 0).sort((a, b) => valor(b) - valor(a)).slice(0, 8);
  const max = top[0] ? valor(top[0]) : 1;
  return (
    <Cartao titulo={titulo}>
      {!top.length ? <Vazio titulo={`Nenhum registro de ${unidade}`} /> : (
        <ol className="space-y-3 p-4">
          {top.map((i, k) => (
            <li key={i.atleta.id} className="flex items-center gap-3">
              <span className="font-display w-5 text-center text-sm font-bold text-zinc-400">{k + 1}</span>
              <Avatar nome={i.atleta.nome} foto={i.atleta.foto_url} tamanho={34} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2 text-sm"><span className="truncate font-medium text-zinc-900">{nomeCurto(i.atleta)}</span><span className="font-display font-bold tabular-nums">{valor(i)}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-zinc-100"><div className="h-full rounded-full bg-primary" style={{ width: `${(valor(i) / max) * 100}%` }} /></div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Cartao>
  );
}
