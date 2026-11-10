'use client';

import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, BadgeCheck, CalendarClock, CircleDollarSign, HeartPulse, MapPin, ShieldBan, UserCheck, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useApp } from '@/components/contexto';
import { FalhaCarregamento, buscarTudo, ok, useDados } from '@/components/crud';
import { GraficoReceitasDespesas, GraficoSaldo, serieMensal } from '@/components/graficos';
import { Botao, Cabecalho, Carregando, Cartao, Indicador, Selo, Vazio } from '@/components/ui';
import { FORMAS, PAPEIS_FIN } from '@/lib/constants';
import { atrasada, dataBR, dataExtensa, devido, hojeBR, horaBR, moeda, refCobranca, somarMeses } from '@/lib/format';
import type { Atleta, AtletaFinanceiro, Convocacao, Linha, Mensalidade, Movimentacao, Partida } from '@/lib/types';

type Dados = {
  atletas: Pick<Atleta, 'id' | 'nome' | 'status'>[];
  proximo: Partida | null;
  convocacoes: Pick<Convocacao, 'status'>[];
  mensalidades: Mensalidade[];
  fin: AtletaFinanceiro[];
  movs: Movimentacao[];
  avisos: Linha[];
};

export default function Painel() {
  const { supabase, perfil, config, pode } = useApp();
  const verFin = pode(...PAPEIS_FIN);
  const hoje = hojeBR();
  const mes = hoje.slice(0, 7);
  const termo = 'Taxas de jogo';

  const { dados, carregando, recarregar, falha } = useDados<Dados>(async () => {
    const [atl, prox, mens, fin, movs, avisos] = await Promise.all([
      supabase.from('atletas').select('id, nome, status'),
      supabase.from('partidas').select('*').eq('status', 'agendada').gte('data_hora', new Date().toISOString()).order('data_hora').limit(1).maybeSingle(),
      verFin ? buscarTudo<Mensalidade>((de, ate) => supabase.from('mensalidades').select('*').order('id').range(de, ate)) : null,
      verFin ? supabase.from('atleta_financeiro').select('*') : null,
      verFin ? buscarTudo<Movimentacao>((de, ate) => supabase.from('movimentacoes').select('*').order('data', { ascending: false }).order('criado_em', { ascending: false }).order('id').range(de, ate)) : null,
      supabase.from('avisos').select('id, titulo, criado_em, fixado').order('fixado', { ascending: false }).order('criado_em', { ascending: false }).limit(4),
    ]);
    const proximo = prox.data as Partida | null;
    const conv = proximo ? ok(await supabase.from('convocacoes').select('status').eq('partida_id', proximo.id)) : [];
    return {
      atletas: ok(atl), proximo, convocacoes: conv, avisos: ok(avisos), fin: fin ? ok(fin) : [],
      mensalidades: mens ? mens.map((m) => ({ ...m, valor: Number(m.valor) })) : [],
      movs: movs ? movs.map((m) => ({ ...m, valor: Number(m.valor) })) : [],
    };
  });
  if (falha && !dados) return <FalhaCarregamento mensagem={falha} aoTentar={recarregar} />;
  if (carregando || !dados) return <Carregando />;

  const { atletas, proximo, convocacoes, mensalidades, fin, movs, avisos } = dados;
  const conta = (s: string) => atletas.filter((a) => a.status === s).length;
  const nome = (id: string) => atletas.find((a) => a.id === id)?.nome ?? 'Atleta';
  const isentos = new Set(fin.filter((f) => f.situacao === 'isento').map((f) => f.atleta_id));
  const inadimplentes = new Set(mensalidades.filter((m) => atrasada(m, hoje) && !isentos.has(m.atleta_id)).map((m) => m.atleta_id)).size;
  const soma = (l: { valor: number }[]) => l.reduce((s, x) => s + x.valor, 0);
  const pagasMes = mensalidades.filter((m) => m.status === 'pago' && m.pago_em?.startsWith(mes));
  const pendentes = mensalidades.filter((m) => m.status === 'pendente');
  const conf = movs.filter((m) => m.status === 'confirmado');
  const total = (l: Movimentacao[], t: string) => soma(l.filter((m) => m.tipo === t));
  const saldo = total(conf, 'receita') - total(conf, 'despesa');
  const doMes = conf.filter((m) => m.data.startsWith(mes));
  const serie = serieMensal(movs, Array.from({ length: 6 }, (_, i) => somarMeses(mes, i - 5)));
  const ultimosPagamentos = [...mensalidades].filter((m) => m.status === 'pago').sort((a, b) => (b.pago_em ?? '').localeCompare(a.pago_em ?? '')).slice(0, 5);
  const confirmados = convocacoes.filter((c) => c.status === 'confirmado').length;

  return (
    <>
      <Cabecalho titulo={`Olá, ${perfil.nome.split(' ')[0]}`} descricao={`Visão geral do ${config.nome_clube} · ${dataBR(hoje)}`} />

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <section className="relative overflow-hidden rounded-xl bg-secondary p-5 text-white shadow-sm lg:col-span-2">
          <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-primary/40 blur-3xl" />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Próximo jogo</p>
          {proximo ? (
            <div className="relative">
              <p className="font-display mt-2 text-3xl font-bold uppercase leading-tight sm:text-4xl">
                {proximo.mando === 'casa' ? config.nome_clube : proximo.adversario} <span className="text-accent">x</span> {proximo.mando === 'casa' ? proximo.adversario : config.nome_clube}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/80">
                <span className="flex items-center gap-1.5"><CalendarClock className="h-4 w-4" /> {dataExtensa(proximo.data_hora)} às {horaBR(proximo.data_hora)}</span>
                {proximo.local && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {proximo.local}</span>}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-sm"><UserCheck className="h-4 w-4 text-accent" /> <strong className="font-display text-lg">{confirmados}</strong> de {convocacoes.length} convocados confirmados</span>
                <Link href={`/partidas/${proximo.id}`}><Botao tamanho="sm">Convocação e escalação</Botao></Link>
              </div>
            </div>
          ) : (
            <div className="relative mt-3">
              <p className="text-white/70">Nenhum jogo agendado.</p>
              <Link href="/partidas" className="mt-3 inline-block"><Botao tamanho="sm">Agendar partida</Botao></Link>
            </div>
          )}
        </section>
        <Cartao titulo="Mural de avisos" acao={<Link href="/mural" className="text-xs font-medium text-primary hover:underline">Ver todos</Link>}>
          {!avisos.length ? <Vazio titulo="Sem avisos publicados" /> : (
            <ul className="divide-y divide-zinc-100">
              {avisos.map((a) => (
                <li key={a.id} className="px-4 py-2.5"><p className="truncate text-sm font-medium text-zinc-900">{a.titulo}</p><p className="text-xs text-zinc-500">{dataBR(String(a.criado_em))}</p></li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Atletas cadastrados" valor={atletas.length} icone={<Users className="h-4 w-4" />} tom="primario" />
        <Indicador rotulo="Ativos" valor={conta('ativo')} icone={<BadgeCheck className="h-4 w-4" />} tom="verde" />
        <Indicador rotulo="Lesionados" valor={conta('lesionado')} icone={<HeartPulse className="h-4 w-4" />} tom="amarelo" />
        <Indicador rotulo="Suspensos" valor={conta('suspenso')} icone={<ShieldBan className="h-4 w-4" />} tom="vermelho" />
      </div>

      {verFin && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Indicador rotulo="Saldo do caixa" valor={<span className={saldo < 0 ? 'text-red-700' : undefined}>{moeda(saldo)}</span>} icone={<Wallet className="h-4 w-4" />} tom="primario" />
            <Indicador rotulo="Receitas do mês" valor={moeda(total(doMes, 'receita'))} icone={<ArrowUpCircle className="h-4 w-4" />} tom="verde" />
            <Indicador rotulo="Despesas do mês" valor={moeda(total(doMes, 'despesa'))} icone={<ArrowDownCircle className="h-4 w-4" />} tom="vermelho" />
            <Indicador rotulo={`${termo} recebidas`} valor={moeda(soma(pagasMes))} detalhe={`${pagasMes.length} no mês`} icone={<BadgeCheck className="h-4 w-4" />} tom="verde" />
            <Indicador rotulo={`${termo} pendentes`} valor={moeda(pendentes.reduce((s, m) => s + devido(m), 0))} detalhe={`${pendentes.length} em aberto`} icone={<CircleDollarSign className="h-4 w-4" />} tom="amarelo" />
            <Indicador rotulo="Inadimplentes" valor={inadimplentes} detalhe="atleta(s) com atraso" icone={<AlertTriangle className="h-4 w-4" />} tom="vermelho" />
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Cartao titulo="Receitas x despesas — últimos 6 meses"><div className="p-3"><GraficoReceitasDespesas dados={serie} /></div></Cartao>
            <Cartao titulo="Evolução do saldo — últimos 6 meses"><div className="p-3"><GraficoSaldo dados={serie} /></div></Cartao>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Cartao titulo="Últimos pagamentos dos atletas" acao={<Link href="/mensalidades" className="text-xs font-medium text-primary hover:underline">Taxas de jogo</Link>}>
              {!ultimosPagamentos.length ? <Vazio titulo="Nenhum pagamento registrado" /> : (
                <ul className="divide-y divide-zinc-100">
                  {ultimosPagamentos.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <div className="min-w-0"><p className="truncate font-medium text-zinc-900">{nome(m.atleta_id)}</p><p className="text-xs text-zinc-500">{refCobranca(m)} · {dataBR(m.pago_em)} · {FORMAS[m.forma_pagamento ?? ''] ?? ''}</p></div>
                      <span className="font-semibold tabular-nums text-zinc-900">{moeda(m.valor)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
            <Cartao titulo="Últimas movimentações do caixa" acao={<Link href="/financeiro" className="text-xs font-medium text-primary hover:underline">Caixa</Link>}>
              {!movs.length ? <Vazio titulo="Nenhuma movimentação registrada" /> : (
                <ul className="divide-y divide-zinc-100">
                  {movs.slice(0, 5).map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <div className="min-w-0"><p className="truncate font-medium text-zinc-900">{m.descricao}</p><p className="text-xs text-zinc-500">{dataBR(m.data)} · {m.categoria}</p></div>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {m.status === 'pendente' && <Selo tom="amarelo">Pendente</Selo>}
                        <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-zinc-900">
                          {m.tipo === 'receita' ? <ArrowUpCircle className="h-3.5 w-3.5 text-green-700" /> : <ArrowDownCircle className="h-3.5 w-3.5 text-red-600" />}
                          {m.tipo === 'receita' ? '+' : '−'} {moeda(m.valor)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          </div>
        </>
      )}
    </>
  );
}
