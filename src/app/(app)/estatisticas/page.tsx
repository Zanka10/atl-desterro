'use client';

import { FileSpreadsheet, FileText } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useApp } from '@/components/contexto';
import { buscarTudo, ok, useDados } from '@/components/crud';
import { Abas, Avatar, Botao, Cabecalho, Carregando, Cartao, Indicador, Selo, Tabela, Vazio, estiloCampo } from '@/components/ui';
import { resultado } from '@/lib/campos';
import { Ranking } from '@/components/ranking';
import { coletivo, individuais } from '@/lib/estatisticas';
import { exportarExcel, exportarPDF, type Tabela as TabelaExp } from '@/lib/export';
import { dataHoraBR, nomeCurto } from '@/lib/format';
import type { Atleta, Estatistica, Partida } from '@/lib/types';

type Aba = 'geral' | 'individual' | 'jogos' | 'temporadas';
type Dados = { partidas: Partida[]; stats: Estatistica[]; atletas: Atleta[] };

export default function Estatisticas() {
  const { supabase, config } = useApp();
  const [aba, setAba] = useState<Aba>('geral');
  const [temporada, setTemporada] = useState('');
  const { dados, carregando } = useDados<Dados>(async () => {
    const [p, s, a] = await Promise.all([
      supabase.from('partidas').select('*').order('data_hora', { ascending: false }),
      buscarTudo<Estatistica>((de, ate) => supabase.from('estatisticas_partida').select('*').order('id').range(de, ate)),
      supabase.from('atletas').select('*'),
    ]);
    return { partidas: ok(p), stats: s, atletas: ok(a) };
  });
  if (carregando || !dados) return <Carregando />;

  const anos = [...new Set(dados.partidas.map((p) => p.temporada))].sort((a, b) => b - a);
  const partidas = dados.partidas.filter((p) => !temporada || p.temporada === Number(temporada));
  const idsPartidas = new Set(partidas.map((p) => p.id));
  const stats = dados.stats.filter((s) => idsPartidas.has(s.partida_id));
  const c = coletivo(partidas);
  const ind = individuais(stats, dados.atletas);
  const realizadas = partidas.filter((p) => p.status === 'realizada');
  const sufixo = temporada ? `Temporada ${temporada}` : 'Todas as temporadas';

  const expInd = (): TabelaExp => ({
    colunas: ['Atleta', 'Jogos', 'Titular', 'Minutos', 'Gols', 'Assistências', 'Amarelos', 'Vermelhos'],
    linhas: ind.map((i) => [i.atleta.nome, i.jogos, i.titular, i.minutos, i.gols, i.assistencias, i.amarelos, i.vermelhos]),
  });
  const temporadas = anos.map((ano) => {
    const ps = dados.partidas.filter((p) => p.temporada === ano);
    const ids = new Set(ps.map((p) => p.id));
    const top = individuais(dados.stats.filter((s) => ids.has(s.partida_id)), dados.atletas)[0];
    return { ano, ...coletivo(ps), artilheiro: top && top.gols > 0 ? `${nomeCurto(top.atleta)} (${top.gols})` : '—' };
  });

  return (
    <>
      <Cabecalho titulo="Estatísticas" descricao={sufixo}>
        <select className={`${estiloCampo} !w-auto`} value={temporada} onChange={(e) => setTemporada(e.target.value)} aria-label="Temporada">
          <option value="">Todas as temporadas</option>
          {anos.map((a) => <option key={a} value={a}>Temporada {a}</option>)}
        </select>
      </Cabecalho>
      <Abas ativa={aba} aoMudar={setAba} abas={[
        { id: 'geral', rotulo: 'Visão geral' }, { id: 'individual', rotulo: 'Individuais' },
        { id: 'jogos', rotulo: 'Histórico de jogos', contador: realizadas.length }, { id: 'temporadas', rotulo: 'Temporadas' },
      ]} />

      {aba === 'geral' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <Indicador rotulo="Jogos" valor={c.jogos} />
            <Indicador rotulo="Vitórias" valor={c.v} />
            <Indicador rotulo="Empates" valor={c.e} />
            <Indicador rotulo="Derrotas" valor={c.d} />
            <Indicador rotulo="Aproveitamento" valor={`${c.aproveitamento.toLocaleString('pt-BR')}%`} />
            <Indicador rotulo="Gols marcados" valor={c.gp} />
            <Indicador rotulo="Gols sofridos" valor={c.gc} detalhe={`Saldo ${c.gp - c.gc >= 0 ? '+' : ''}${c.gp - c.gc}`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Ranking titulo="Artilharia" linhas={ind} valor={(i) => i.gols} unidade="gols" />
            <Ranking titulo="Assistências" linhas={ind} valor={(i) => i.assistencias} unidade="assistências" />
          </div>
        </div>
      )}

      {aba === 'individual' && (
        <Cartao titulo="Estatísticas individuais" acao={ind.length > 0 && <div className="flex gap-2">
          <Botao variante="secundario" tamanho="sm" icone={<FileText className="h-3.5 w-3.5" />} onClick={() => exportarPDF('Estatísticas individuais', expInd(), config, sufixo)}>PDF</Botao>
          <Botao variante="secundario" tamanho="sm" icone={<FileSpreadsheet className="h-3.5 w-3.5" />} onClick={() => exportarExcel('Estatísticas individuais', expInd())}>Excel</Botao>
        </div>}>
          <Tabela linhas={ind} chave={(i) => i.atleta.id} vazio={<Vazio titulo="Nenhuma estatística lançada" descricao="Lance o resultado das partidas para alimentar as estatísticas." />} colunas={[
            { titulo: 'Atleta', celula: (i) => <Link href={`/atletas/${i.atleta.id}`} className="flex items-center gap-3 hover:underline"><Avatar nome={i.atleta.nome} foto={i.atleta.foto_url} numero={i.atleta.numero} tamanho={34} /><span className="font-medium text-zinc-900">{i.atleta.nome}</span></Link> },
            { titulo: 'Jogos', direita: true, celula: (i) => i.jogos },
            { titulo: 'Titular', direita: true, celula: (i) => i.titular },
            { titulo: 'Minutos', direita: true, celula: (i) => i.minutos || '—' },
            { titulo: 'Gols', direita: true, celula: (i) => <strong>{i.gols}</strong> },
            { titulo: 'Assist.', direita: true, celula: (i) => i.assistencias },
            { titulo: 'CA', direita: true, celula: (i) => i.amarelos },
            { titulo: 'CV', direita: true, celula: (i) => i.vermelhos },
          ]} />
        </Cartao>
      )}

      {aba === 'jogos' && (
        <Cartao>
          <Tabela linhas={realizadas} chave={(p) => p.id} vazio={<Vazio titulo="Nenhum jogo realizado" />} colunas={[
            { titulo: 'Data', celula: (p) => dataHoraBR(p.data_hora) },
            { titulo: 'Partida', celula: (p) => <Link href={`/partidas/${p.id}`} className="font-medium text-zinc-900 hover:underline">{p.mando === 'casa' ? `${config.nome_clube} x ${p.adversario}` : `${p.adversario} x ${config.nome_clube}`}</Link> },
            { titulo: 'Placar', celula: (p) => (p.gols_pro != null ? <strong>{p.mando === 'casa' ? `${p.gols_pro} x ${p.gols_contra}` : `${p.gols_contra} x ${p.gols_pro}`}</strong> : '—') },
            { titulo: 'Resultado', celula: (p) => { const r = resultado(p); return r ? <Selo tom={r === 'V' ? 'verde' : r === 'D' ? 'vermelho' : 'amarelo'}>{r === 'V' ? 'Vitória' : r === 'D' ? 'Derrota' : 'Empate'}</Selo> : '—'; } },
            { titulo: 'Competição', celula: (p) => p.competicao ?? '—' },
            { titulo: 'Local', celula: (p) => p.local ?? '—' },
          ]} />
        </Cartao>
      )}

      {aba === 'temporadas' && (
        <Cartao titulo="Histórico de temporadas">
          <Tabela linhas={temporadas} chave={(t) => String(t.ano)} vazio={<Vazio titulo="Nenhuma temporada registrada" />} colunas={[
            { titulo: 'Temporada', celula: (t) => <strong>{t.ano}</strong> },
            { titulo: 'J', direita: true, celula: (t) => t.jogos },
            { titulo: 'V', direita: true, celula: (t) => t.v },
            { titulo: 'E', direita: true, celula: (t) => t.e },
            { titulo: 'D', direita: true, celula: (t) => t.d },
            { titulo: 'GP', direita: true, celula: (t) => t.gp },
            { titulo: 'GC', direita: true, celula: (t) => t.gc },
            { titulo: 'Aproveitamento', direita: true, celula: (t) => `${t.aproveitamento.toLocaleString('pt-BR')}%` },
            { titulo: 'Artilheiro', celula: (t) => t.artilheiro },
          ]} />
        </Cartao>
      )}
    </>
  );
}
