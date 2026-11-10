import type { AtletaFinanceiro, Mensalidade, SituacaoFinanceira } from './types';

export const TZ = 'America/Sao_Paulo';

export const moeda = (v: number | string | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v ?? 0));

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY' (sem conversão de fuso). */
export const dataBR = (d: string | null | undefined) => {
  if (!d) return '—';
  const [a, m, dia] = d.slice(0, 10).split('-');
  return `${dia}/${m}/${a}`;
};

export const dataHoraBR = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : '—';

export const horaBR = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export const dataExtensa = (iso: string) => {
  const s = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Data de hoje em Brasília, 'YYYY-MM-DD'. */
export const hojeBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

/** Data (Brasília) de um instante ISO, 'YYYY-MM-DD'. */
export const diaBR = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));

/** ISO -> valor para <input type="datetime-local"> no horário de Brasília. */
export const isoParaInput = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)).replace(' ', 'T') : '';

/** Valor de <input type="datetime-local"> (horário de Brasília, UTC-3) -> ISO. */
export const inputParaISO = (v: string) => new Date(`${v.slice(0, 16)}:00-03:00`).toISOString();

/** 'YYYY-MM-01' -> 'MM/YYYY'. */
export const mesBR = (competencia: string) => `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const mesCurto = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;

/** Soma n meses a 'YYYY-MM' e devolve 'YYYY-MM'. */
export const somarMeses = (ym: string, n: number) => {
  const total = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
};

export const somarDias = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const idade = (nasc: string | null | undefined) => {
  if (!nasc) return null;
  const hoje = hojeBR();
  let anos = Number(hoje.slice(0, 4)) - Number(nasc.slice(0, 4));
  if (hoje.slice(5) < nasc.slice(5)) anos--;
  return anos;
};

export const telefoneBR = (t: string | null | undefined) => {
  const d = (t ?? '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t || '—';
};

export const nomeCurto = (a: { nome: string; apelido?: string | null }) => a.apelido?.trim() || a.nome.split(' ')[0];
export const iniciais = (nome: string) => nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

/** Referência curta da cobrança: "Jogo x Rival (15/11)" ou "11/2026". */
export const refCobranca = (m: Pick<Mensalidade, 'competencia' | 'descricao'>) => m.descricao ?? mesBR(m.competencia);

/** Nome completo da cobrança, para mensagens. */
export const nomeCobranca = (m: Pick<Mensalidade, 'competencia' | 'descricao'>) =>
  m.descricao ? `Taxa — ${m.descricao}` : `Mensalidade ${mesBR(m.competencia)}`;

/** Quanto falta pagar (valor menos o crédito já abatido). */
export const devido = (m: Pick<Mensalidade, 'valor' | 'abatido'>) => Math.max(0, Number(m.valor) - Number(m.abatido ?? 0));

/** Cobrança vencida e não paga (taxa de jogo não paga até o dia do jogo)? */
export const atrasada = (m: Pick<Mensalidade, 'status' | 'vencimento'>, hoje = hojeBR()) =>
  m.status === 'pendente' && m.vencimento < hoje;

/** Classificação automática da situação financeira do atleta. */
export function situacaoFinanceira(
  mensalidades: Pick<Mensalidade, 'status' | 'vencimento'>[],
  fin?: Pick<AtletaFinanceiro, 'situacao'> | null,
): SituacaoFinanceira {
  if (fin?.situacao === 'isento') return 'isento';
  if (fin?.situacao === 'negociacao') return 'negociacao';
  const hoje = hojeBR();
  if (mensalidades.some((m) => atrasada(m, hoje))) return 'inadimplente';
  if (mensalidades.some((m) => m.status === 'pendente')) return 'pendente';
  return 'em_dia';
}
