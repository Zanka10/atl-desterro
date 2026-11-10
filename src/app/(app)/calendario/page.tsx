'use client';

import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useApp } from '@/components/contexto';
import { AcoesLinha, ok, useDados } from '@/components/crud';
import { FormModal, type Campo } from '@/components/formulario';
import { Botao, BotaoIcone, Cabecalho, Carregando, Cartao, Selo, Vazio, cx } from '@/components/ui';
import { TIPOS_EVENTO, paraOpcoes } from '@/lib/constants';
import { dataExtensa, diaBR, hojeBR, horaBR, somarMeses } from '@/lib/format';
import type { Linha } from '@/lib/types';

const CAMPOS: Campo[] = [
  { nome: 'titulo', rotulo: 'Título', obrigatorio: true, largo: true },
  { nome: 'tipo', rotulo: 'Tipo', tipo: 'selecao', opcoes: paraOpcoes(TIPOS_EVENTO), obrigatorio: true },
  { nome: 'data_hora', rotulo: 'Data e horário', tipo: 'datahora', obrigatorio: true },
  { nome: 'local', rotulo: 'Local', largo: true },
  { nome: 'descricao', rotulo: 'Descrição', tipo: 'area' },
];
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

type Item = { id: string; dia: string; hora: string; titulo: string; jogo: boolean; iso: string; bruto: Linha };

export default function Calendario() {
  const { supabase, sucesso, erro, confirmar } = useApp();
  const hoje = hojeBR();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [editando, setEditando] = useState<Linha | null | undefined>(undefined);

  const { dados, carregando, recarregar } = useDados<Item[]>(async () => {
    const de = `${somarMeses(mes, -1)}-25T00:00:00-03:00`;
    const ate = `${somarMeses(mes, 1)}-07T00:00:00-03:00`;
    const [partidas, eventos] = await Promise.all([
      supabase.from('partidas').select('*').gte('data_hora', de).lt('data_hora', ate).neq('status', 'cancelada'),
      supabase.from('eventos').select('*').gte('data_hora', de).lt('data_hora', ate),
    ]);
    const itens: Item[] = [
      ...ok(partidas).map((p: Linha) => ({ id: p.id, dia: diaBR(p.data_hora), hora: horaBR(p.data_hora), titulo: `Jogo x ${p.adversario}`, jogo: true, iso: p.data_hora, bruto: p })),
      ...ok(eventos).map((e: Linha) => ({ id: e.id, dia: diaBR(e.data_hora), hora: horaBR(e.data_hora), titulo: e.titulo, jogo: false, iso: e.data_hora, bruto: e })),
    ];
    return itens.sort((a, b) => a.iso.localeCompare(b.iso));
  }, [mes]);

  const ano = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7));
  const primeiroDiaSemana = new Date(Date.UTC(ano, m - 1, 1)).getUTCDay();
  const diasNoMes = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  const celulas: (string | null)[] = [
    ...Array(primeiroDiaSemana).fill(null),
    ...Array.from({ length: diasNoMes }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`),
  ];
  const doMes = (dados ?? []).filter((i) => i.dia.startsWith(mes));

  const salvar = async (v: Linha) => {
    if (editando) ok(await supabase.from('eventos').update(v).eq('id', editando.id).select('id'));
    else ok(await supabase.from('eventos').insert(v).select('id'));
    sucesso('Evento salvo no calendário.');
    recarregar();
  };
  const excluir = async (e: Linha) => {
    if (!(await confirmar({ titulo: 'Excluir evento', mensagem: `Excluir "${e.titulo}"?`, textoConfirmar: 'Excluir', perigo: true }))) return;
    const { error } = await supabase.from('eventos').delete().eq('id', e.id);
    if (error) return erro(error);
    sucesso('Evento excluído.');
    recarregar();
  };

  return (
    <>
      <Cabecalho titulo="Calendário" descricao="Jogos, treinos e eventos do clube.">
        <Botao icone={<Plus className="h-4 w-4" />} onClick={() => setEditando(null)}>Novo evento</Botao>
      </Cabecalho>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Cartao>
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
            <BotaoIcone titulo="Mês anterior" onClick={() => setMes(somarMeses(mes, -1))}><ChevronLeft className="h-5 w-5" /></BotaoIcone>
            <h2 className="text-lg font-bold uppercase">{MESES[m - 1]} de {ano}</h2>
            <BotaoIcone titulo="Próximo mês" onClick={() => setMes(somarMeses(mes, 1))}><ChevronRight className="h-5 w-5" /></BotaoIcone>
          </div>
          <div className="grid grid-cols-7 border-b border-zinc-100 text-center text-xs font-medium uppercase text-zinc-500">
            {SEMANA.map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {celulas.map((dia, i) => {
              const itens = dia ? doMes.filter((x) => x.dia === dia) : [];
              return (
                <div key={i} className={cx('min-h-16 border-b border-r border-zinc-100 p-1 sm:min-h-24', i % 7 === 6 && 'border-r-0')}>
                  {dia && (
                    <>
                      <span className={cx('inline-flex h-6 w-6 items-center justify-center rounded-full text-xs', dia === hoje ? 'bg-primary font-bold text-white' : 'text-zinc-600')}>{Number(dia.slice(8))}</span>
                      <div className="mt-0.5 space-y-0.5">
                        {itens.map((x) => (
                          <div key={x.id} title={`${x.hora} — ${x.titulo}`} className={cx('truncate rounded px-1 py-0.5 text-[10px] font-medium sm:text-xs', x.jogo ? 'bg-primary/15 text-primary' : 'bg-amber-100 text-amber-900')}>
                            <span className="hidden sm:inline">{x.hora} </span>{x.titulo}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Cartao>

        <Cartao titulo="Agenda do mês">
          {carregando ? <Carregando /> : !doMes.length ? <Vazio titulo="Nada agendado neste mês" /> : (
            <ul className="divide-y divide-zinc-100">
              {doMes.map((x) => (
                <li key={x.id} className="flex items-start justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-500">{dataExtensa(x.iso)} · {x.hora}</p>
                    <p className="truncate font-medium text-zinc-900">{x.titulo}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Selo tom={x.jogo ? 'verde' : 'amarelo'}>{x.jogo ? 'Jogo' : TIPOS_EVENTO[x.bruto.tipo]}</Selo>
                      {x.bruto.local && <span className="truncate text-xs text-zinc-500">{x.bruto.local}</span>}
                    </div>
                  </div>
                  {x.jogo
                    ? <Link href={`/partidas/${x.id}`} className="shrink-0 text-xs font-medium text-primary hover:underline">Abrir</Link>
                    : <AcoesLinha aoEditar={() => setEditando(x.bruto)} aoExcluir={() => excluir(x.bruto)} />}
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
      <FormModal aberto={editando !== undefined} titulo={editando ? 'Editar evento' : 'Novo evento'} campos={CAMPOS} inicial={editando ?? { tipo: 'treino' }} aoSalvar={salvar} aoFechar={() => setEditando(undefined)} />
    </>
  );
}
