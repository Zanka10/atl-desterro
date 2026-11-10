'use client';

import { CalendarClock, MapPin, Plus, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useApp } from '@/components/contexto';
import { ok, useDados } from '@/components/crud';
import { FormModal } from '@/components/formulario';
import { Abas, Botao, Cabecalho, Carregando, Cartao, Selo, TOM_STATUS, Vazio } from '@/components/ui';
import { CAMPOS_PARTIDA, comTemporada, resultado } from '@/lib/campos';
import { STATUS_PARTIDA } from '@/lib/constants';
import { dataExtensa, horaBR } from '@/lib/format';
import type { Linha, Partida } from '@/lib/types';

export default function Partidas() {
  const { supabase, config, sucesso } = useApp();
  const router = useRouter();
  const [aba, setAba] = useState<'proximas' | 'historico'>('proximas');
  const [nova, setNova] = useState(false);
  const { dados, carregando } = useDados<(Partida & { convocacoes: { status: string }[] })[]>(async () =>
    ok(await supabase.from('partidas').select('*, convocacoes(status)').order('data_hora')));

  const salvar = async (v: Linha) => {
    const p = ok(await supabase.from('partidas').insert(comTemporada(v)).select('id').single());
    sucesso('Partida cadastrada. Agora convoque os atletas.');
    router.push(`/partidas/${p.id}`);
  };

  const proximas = (dados ?? []).filter((p) => p.status === 'agendada' || p.status === 'adiada');
  const historico = (dados ?? []).filter((p) => p.status === 'realizada' || p.status === 'cancelada').reverse();
  const lista = aba === 'proximas' ? proximas : historico;

  return (
    <>
      <Cabecalho titulo="Partidas e escalação" descricao="Agenda de jogos, convocações, escalações e resultados.">
        <Botao icone={<Plus className="h-4 w-4" />} onClick={() => setNova(true)}>Nova partida</Botao>
      </Cabecalho>
      <Abas ativa={aba} aoMudar={setAba} abas={[{ id: 'proximas', rotulo: 'Próximos jogos', contador: proximas.length }, { id: 'historico', rotulo: 'Histórico', contador: historico.length }]} />
      {carregando ? <Carregando /> : !lista.length ? (
        <Cartao><Vazio titulo={aba === 'proximas' ? 'Nenhum jogo agendado' : 'Nenhum jogo no histórico'} descricao={aba === 'proximas' ? 'Cadastre a próxima partida para convocar e escalar o time.' : undefined} icone={<Trophy className="h-6 w-6" />} /></Cartao>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((p) => {
            const r = resultado(p);
            const confirmados = p.convocacoes.filter((c) => c.status === 'confirmado').length;
            return (
              <Link key={p.id} href={`/partidas/${p.id}`} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-primary/50 hover:shadow">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium uppercase tracking-wide text-zinc-500">{p.competicao ?? 'Partida'}</span>
                  <Selo tom={TOM_STATUS[p.status]}>{STATUS_PARTIDA[p.status]}</Selo>
                </div>
                <p className="font-display mt-2 text-xl font-bold uppercase leading-tight text-zinc-900">
                  {p.mando === 'casa' ? config.nome_clube : p.adversario}
                  <span className="mx-2 text-primary">{r ? `${p.mando === 'casa' ? p.gols_pro : p.gols_contra} x ${p.mando === 'casa' ? p.gols_contra : p.gols_pro}` : 'x'}</span>
                  {p.mando === 'casa' ? p.adversario : config.nome_clube}
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-zinc-600"><CalendarClock className="h-4 w-4 shrink-0 text-zinc-400" /> {dataExtensa(p.data_hora)} · {horaBR(p.data_hora)}</p>
                {p.local && <p className="mt-0.5 flex items-center gap-1.5 text-sm text-zinc-600"><MapPin className="h-4 w-4 shrink-0 text-zinc-400" /> <span className="truncate">{p.local}</span></p>}
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-zinc-100 pt-2.5">
                  <Selo>{p.mando === 'casa' ? 'Mandante' : 'Visitante'}</Selo>
                  {r ? <Selo tom={r === 'V' ? 'verde' : r === 'D' ? 'vermelho' : 'amarelo'}>{r === 'V' ? 'Vitória' : r === 'D' ? 'Derrota' : 'Empate'}</Selo>
                    : <Selo tom="azul">{confirmados}/{p.convocacoes.length} confirmados</Selo>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <FormModal aberto={nova} titulo="Nova partida" campos={CAMPOS_PARTIDA} inicial={{ mando: 'casa', status: 'agendada' }} aoSalvar={salvar} aoFechar={() => setNova(false)} />
    </>
  );
}
