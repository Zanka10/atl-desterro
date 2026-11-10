'use client';

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { mesCurto, moeda } from '@/lib/format';
import type { Movimentacao } from '@/lib/types';

// Cores validadas para daltonismo (par receita/despesa) — independem das cores do clube.
export const COR_RECEITA = '#15803d';
export const COR_DESPESA = '#dc2626';
const COR_SALDO = '#2563eb';
const EIXO = { fontSize: 11, fill: '#71717a' };
const compacto = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(v));

export type PontoMes = { mes: string; receitas: number; despesas: number; saldo: number };

/** Agrupa movimentações confirmadas por mês e calcula o saldo acumulado ao fim de cada mês. */
export function serieMensal(movs: Pick<Movimentacao, 'tipo' | 'valor' | 'data' | 'status'>[], meses: string[]): PontoMes[] {
  const conf = movs.filter((m) => m.status === 'confirmado');
  const sinal = (m: (typeof conf)[number]) => (m.tipo === 'receita' ? Number(m.valor) : -Number(m.valor));
  let saldo = conf.filter((m) => m.data.slice(0, 7) < meses[0]).reduce((s, m) => s + sinal(m), 0);
  return meses.map((mes) => {
    const doMes = conf.filter((m) => m.data.slice(0, 7) === mes);
    const receitas = doMes.filter((m) => m.tipo === 'receita').reduce((s, m) => s + Number(m.valor), 0);
    const despesas = doMes.filter((m) => m.tipo === 'despesa').reduce((s, m) => s + Number(m.valor), 0);
    saldo += receitas - despesas;
    return { mes, receitas, despesas, saldo };
  });
}

function Dica({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-zinc-900">{label ? mesCurto(label) : ''}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-zinc-700">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} /> {p.name}: <strong className="tabular-nums">{moeda(p.value)}</strong>
        </p>
      ))}
    </div>
  );
}

export function GraficoReceitasDespesas({ dados }: { dados: PontoMes[] }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Gráfico de barras: receitas e despesas por mês">
      <ResponsiveContainer>
        <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="#e4e4e7" strokeDasharray="3 3" />
          <XAxis dataKey="mes" tickFormatter={mesCurto} tick={EIXO} tickLine={false} axisLine={{ stroke: '#d4d4d8' }} />
          <YAxis tickFormatter={compacto} tick={EIXO} tickLine={false} axisLine={false} width={52} />
          <Tooltip content={<Dica />} cursor={{ fill: '#f4f4f5' }} />
          <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 12, color: '#3f3f46' }} formatter={(v) => <span className="text-zinc-700">{v}</span>} />
          <Bar dataKey="receitas" name="Receitas" fill={COR_RECEITA} radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="despesas" name="Despesas" fill={COR_DESPESA} radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoSaldo({ dados }: { dados: PontoMes[] }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Gráfico de linha: evolução do saldo do caixa">
      <ResponsiveContainer>
        <AreaChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e4e4e7" strokeDasharray="3 3" />
          <XAxis dataKey="mes" tickFormatter={mesCurto} tick={EIXO} tickLine={false} axisLine={{ stroke: '#d4d4d8' }} />
          <YAxis tickFormatter={compacto} tick={EIXO} tickLine={false} axisLine={false} width={52} />
          <Tooltip content={<Dica />} cursor={{ stroke: '#a1a1aa', strokeDasharray: '3 3' }} />
          <ReferenceLine y={0} stroke="#a1a1aa" />
          <Area type="monotone" dataKey="saldo" name="Saldo" stroke={COR_SALDO} strokeWidth={2} fill={COR_SALDO} fillOpacity={0.08}
            dot={{ r: 3, fill: COR_SALDO, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
