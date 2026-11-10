'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/components/contexto';
import { buscarTudo, ok } from '@/components/crud';
import { serieMensal } from '@/components/graficos';
import { Botao, Cabecalho, Cartao, Rotulo, estiloCampo } from '@/components/ui';
import { resultado } from '@/lib/campos';
import { FORMAS, PAPEIS_ESP, PAPEIS_FIN, PE, POSICOES, STATUS_ATLETA, STATUS_CONVOCACAO } from '@/lib/constants';
import { individuais } from '@/lib/estatisticas';
import { exportarExcel, exportarPDF, type Tabela } from '@/lib/export';
import { atrasada, dataBR, dataHoraBR, devido, hojeBR, mesCurto, moeda, refCobranca, somarMeses, telefoneBR } from '@/lib/format';
import type { Atleta, Config, Linha, Mensalidade, Movimentacao, Papel, Partida } from '@/lib/types';

type Filtro = { de: string; ate: string };
type Relatorio = {
  id: string; titulo: string; descricao: string; papeis: Papel[]; periodo?: boolean;
  gerar: (s: SupabaseClient, f: Filtro, c: Config) => Promise<Tabela>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noPeriodo = (q: any, coluna: string, f: Filtro, instante = false): any =>
  q.gte(coluna, instante ? `${f.de}T00:00:00-03:00` : f.de).lte(coluna, instante ? `${f.ate}T23:59:59-03:00` : f.ate);

const RELATORIOS: Relatorio[] = [
  { id: 'atletas', titulo: 'Relação de atletas', descricao: 'Elenco completo com posição, contato e status.', papeis: PAPEIS_ESP,
    gerar: async (s) => {
      const a: Atleta[] = ok(await s.from('atletas').select('*').order('nome'));
      return { colunas: ['Nº', 'Nome', 'Posição', 'Pé', 'Nascimento', 'Telefone', 'Entrada', 'Status'],
        linhas: a.map((x) => [x.numero ?? '', x.nome, POSICOES[x.posicao].label, PE[x.pe_dominante ?? ''] ?? '', x.data_nascimento ? dataBR(x.data_nascimento) : '', telefoneBR(x.telefone), x.data_entrada ? dataBR(x.data_entrada) : '', STATUS_ATLETA[x.status]]) };
    } },
  { id: 'convocados', titulo: 'Lista de convocados', descricao: 'Convocações e respostas das partidas do período.', papeis: PAPEIS_ESP, periodo: true,
    gerar: async (s, f) => {
      const p: Linha[] = ok(await noPeriodo(s.from('partidas').select('adversario, data_hora, convocacoes(status, atletas(nome, numero))'), 'data_hora', f, true).order('data_hora'));
      return { colunas: ['Partida', 'Data', 'Nº', 'Atleta', 'Resposta'],
        linhas: p.flatMap((x) => [...x.convocacoes].sort((a: Linha, b: Linha) => String(a.atletas?.nome).localeCompare(String(b.atletas?.nome)))
          .map((c: Linha) => [`x ${x.adversario}`, dataHoraBR(x.data_hora), c.atletas?.numero ?? '', c.atletas?.nome ?? '', STATUS_CONVOCACAO[c.status as keyof typeof STATUS_CONVOCACAO]])) };
    } },
  { id: 'escalacoes', titulo: 'Escalações', descricao: 'Titulares e reservas das partidas do período.', papeis: PAPEIS_ESP, periodo: true,
    gerar: async (s, f) => {
      const p: Linha[] = ok(await noPeriodo(s.from('partidas').select('adversario, data_hora, formacao, capitao_id, escalacao(tipo, slot, funcao, atleta_id, atletas(nome, numero))'), 'data_hora', f, true).order('data_hora'));
      return { colunas: ['Partida', 'Data', 'Formação', 'Condição', 'Nº', 'Atleta', 'Função'],
        linhas: p.flatMap((x) => [...x.escalacao].sort((a: Linha, b: Linha) => (a.tipo === b.tipo ? a.slot - b.slot : a.tipo === 'titular' ? -1 : 1))
          .map((e: Linha) => [`x ${x.adversario}`, dataHoraBR(x.data_hora), x.formacao, e.tipo === 'titular' ? 'Titular' : 'Reserva', e.atletas?.numero ?? '', `${e.atletas?.nome ?? ''}${x.capitao_id === e.atleta_id ? ' (C)' : ''}`, POSICOES[e.funcao as keyof typeof POSICOES]?.label ?? ''])) };
    } },
  { id: 'artilharia', titulo: 'Artilharia', descricao: 'Ranking de gols e assistências no período.', papeis: PAPEIS_ESP, periodo: true,
    gerar: async (s, f) => {
      const ind = await statsPeriodo(s, f);
      return { colunas: ['Posição', 'Atleta', 'Gols', 'Assistências', 'Jogos'], linhas: ind.filter((i) => i.gols > 0 || i.assistencias > 0).map((i, k) => [`${k + 1}º`, i.atleta.nome, i.gols, i.assistencias, i.jogos]) };
    } },
  { id: 'individuais', titulo: 'Estatísticas individuais', descricao: 'Jogos, minutos, gols, assistências e cartões.', papeis: PAPEIS_ESP, periodo: true,
    gerar: async (s, f) => {
      const ind = await statsPeriodo(s, f);
      return { colunas: ['Atleta', 'Jogos', 'Titular', 'Minutos', 'Gols', 'Assistências', 'Amarelos', 'Vermelhos'], linhas: ind.map((i) => [i.atleta.nome, i.jogos, i.titular, i.minutos, i.gols, i.assistencias, i.amarelos, i.vermelhos]) };
    } },
  { id: 'jogos', titulo: 'Histórico de jogos', descricao: 'Partidas do período com placar e resultado.', papeis: PAPEIS_ESP, periodo: true,
    gerar: async (s, f, c) => {
      const p: Partida[] = ok(await noPeriodo(s.from('partidas').select('*'), 'data_hora', f, true).order('data_hora'));
      const rot = { V: 'Vitória', E: 'Empate', D: 'Derrota' };
      return { colunas: ['Data', 'Partida', 'Placar', 'Resultado', 'Competição', 'Local'],
        linhas: p.map((x) => { const r = resultado(x); return [dataHoraBR(x.data_hora), x.mando === 'casa' ? `${c.nome_clube} x ${x.adversario}` : `${x.adversario} x ${c.nome_clube}`, r ? (x.mando === 'casa' ? `${x.gols_pro} x ${x.gols_contra}` : `${x.gols_contra} x ${x.gols_pro}`) : '—', r ? rot[r] : x.status, x.competicao ?? '', x.local ?? '']; }) };
    } },
  { id: 'recebidas', titulo: 'Taxas de jogo recebidas', descricao: 'Pagamentos dos atletas no período.', papeis: PAPEIS_FIN, periodo: true,
    gerar: async (s, f) => {
      const m: Linha[] = ok(await noPeriodo(s.from('mensalidades').select('*, atletas(nome)').eq('status', 'pago'), 'pago_em', f).order('pago_em'));
      return { colunas: ['Pagamento', 'Atleta', 'Jogo', 'Forma', 'Valor'],
        linhas: m.map((x) => [dataBR(x.pago_em), x.atletas?.nome ?? '', refCobranca(x as Mensalidade), FORMAS[x.forma_pagamento] ?? '', moeda(x.valor)]),
        rodape: ['Total', '', '', `${m.length} pagamento(s)`, moeda(m.reduce((t, x) => t + Number(x.valor), 0))] };
    } },
  { id: 'inadimplentes', titulo: 'Inadimplentes', descricao: 'Atletas com taxa de jogo não paga até a data do jogo.', papeis: PAPEIS_FIN,
    gerar: async (s) => {
      const hoje = hojeBR();
      const m: (Mensalidade & { atletas: { nome: string; telefone: string | null } | null })[] = ok(await s.from('mensalidades').select('*, atletas(nome, telefone)').eq('status', 'pendente').lt('vencimento', hoje).order('vencimento'));
      const isentos = new Set(ok(await s.from('atleta_financeiro').select('atleta_id').eq('situacao', 'isento')).map((x: Linha) => x.atleta_id));
      const venc = m.filter((x) => atrasada(x, hoje) && !isentos.has(x.atleta_id));
      return { colunas: ['Atleta', 'Telefone', 'Jogo', 'Pagar até', 'Valor'],
        linhas: venc.sort((a, b) => (a.atletas?.nome ?? '').localeCompare(b.atletas?.nome ?? '')).map((x) => [x.atletas?.nome ?? '', telefoneBR(x.atletas?.telefone), refCobranca(x), dataBR(x.vencimento), moeda(devido(x))]),
        rodape: ['Total', '', '', `${new Set(venc.map((x) => x.atleta_id)).size} atleta(s)`, moeda(venc.reduce((t, x) => t + devido(x), 0))] };
    } },
  { id: 'fluxo', titulo: 'Fluxo de caixa', descricao: 'Receitas, despesas e saldo acumulado mês a mês.', papeis: PAPEIS_FIN, periodo: true,
    gerar: async (s, f) => {
      const movs: Pick<Movimentacao, 'tipo' | 'valor' | 'data' | 'status'>[] = await buscarTudo((de, ate) => s.from('movimentacoes').select('tipo, valor, data, status').lte('data', f.ate).order('id').range(de, ate));
      const meses: string[] = [];
      for (let m = f.de.slice(0, 7); m <= f.ate.slice(0, 7); m = somarMeses(m, 1)) meses.push(m);
      const serie = serieMensal(movs, meses);
      return { colunas: ['Mês', 'Receitas', 'Despesas', 'Resultado', 'Saldo acumulado'],
        linhas: serie.map((p) => [mesCurto(p.mes), moeda(p.receitas), moeda(p.despesas), moeda(p.receitas - p.despesas), moeda(p.saldo)]),
        rodape: ['Total', moeda(serie.reduce((t, p) => t + p.receitas, 0)), moeda(serie.reduce((t, p) => t + p.despesas, 0)), moeda(serie.reduce((t, p) => t + p.receitas - p.despesas, 0)), moeda(serie.at(-1)?.saldo ?? 0)] };
    } },
  { id: 'movimentacoes', titulo: 'Receitas e despesas', descricao: 'Todos os lançamentos do caixa no período.', papeis: PAPEIS_FIN, periodo: true,
    gerar: async (s, f) => {
      const m: Movimentacao[] = ok(await noPeriodo(s.from('movimentacoes').select('*'), 'data', f).order('data'));
      const conf = m.filter((x) => x.status === 'confirmado');
      const tot = (t: string) => conf.filter((x) => x.tipo === t).reduce((a, x) => a + Number(x.valor), 0);
      return { colunas: ['Data', 'Tipo', 'Categoria', 'Descrição', 'Forma', 'Responsável', 'Situação', 'Valor'],
        linhas: m.map((x) => [dataBR(x.data), x.tipo === 'receita' ? 'Receita' : 'Despesa', x.categoria, x.descricao, FORMAS[x.forma_pagamento ?? ''] ?? '', x.responsavel_nome ?? '', x.status === 'confirmado' ? 'Confirmado' : 'Pendente', moeda(x.tipo === 'receita' ? x.valor : -Number(x.valor))]),
        rodape: ['', '', '', `Receitas ${moeda(tot('receita'))} · Despesas ${moeda(tot('despesa'))}`, '', '', 'Resultado', moeda(tot('receita') - tot('despesa'))] };
    } },
];

async function statsPeriodo(s: SupabaseClient, f: Filtro) {
  const partidas = (ok(await noPeriodo(s.from('partidas').select('id'), 'data_hora', f, true)) as Linha[]).map((p) => p.id);
  if (!partidas.length) return [];
  const [stats, atletas] = await Promise.all([s.from('estatisticas_partida').select('*').in('partida_id', partidas), s.from('atletas').select('*')]);
  return individuais(ok(stats), ok(atletas));
}

export default function Relatorios() {
  const { supabase, config, perfil, erro, info } = useApp();
  const hoje = hojeBR();
  const [filtro, setFiltro] = useState<Filtro>({ de: `${hoje.slice(0, 4)}-01-01`, ate: hoje });
  const [gerando, setGerando] = useState<string | null>(null);

  const gerar = async (r: Relatorio, formato: 'pdf' | 'excel') => {
    if (r.periodo && filtro.de > filtro.ate) return erro('A data inicial deve ser anterior à data final.');
    setGerando(`${r.id}-${formato}`);
    try {
      const tabela = await r.gerar(supabase, filtro, config);
      if (!tabela.linhas.length) return info('Não há dados para este relatório no período selecionado.');
      const periodo = r.periodo ? `${dataBR(filtro.de)} a ${dataBR(filtro.ate)}` : `Posição em ${dataBR(hoje)}`;
      if (formato === 'pdf') await exportarPDF(r.titulo, tabela, config, periodo);
      else await exportarExcel(r.titulo, tabela);
    } catch (e) {
      erro(e);
    } finally {
      setGerando(null);
    }
  };

  const disponiveis = RELATORIOS.filter((r) => r.papeis.includes(perfil.papel));
  return (
    <>
      <Cabecalho titulo="Relatórios" descricao="Exporte os dados do clube em PDF ou Excel." />
      <Cartao className="mb-4">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Rotulo rotulo="Período — de"><input type="date" className={estiloCampo} value={filtro.de} max={filtro.ate} onChange={(e) => e.target.value && setFiltro({ ...filtro, de: e.target.value })} /></Rotulo>
          <Rotulo rotulo="até"><input type="date" className={estiloCampo} value={filtro.ate} min={filtro.de} onChange={(e) => e.target.value && setFiltro({ ...filtro, ate: e.target.value })} /></Rotulo>
          <p className="pb-2 text-xs text-zinc-500">O período se aplica aos relatórios marcados com “por período”.</p>
        </div>
      </Cartao>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {disponiveis.map((r) => (
          <Cartao key={r.id} className="flex flex-col p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-5 w-5" /></span>
              <div className="min-w-0">
                <h2 className="text-base font-bold uppercase text-zinc-900">{r.titulo}</h2>
                <p className="text-sm text-zinc-500">{r.descricao}</p>
                <p className="mt-1 text-xs text-zinc-400">{r.periodo ? 'Por período' : 'Posição atual'}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Botao variante="secundario" tamanho="sm" className="flex-1" carregando={gerando === `${r.id}-pdf`} icone={<FileText className="h-3.5 w-3.5" />} onClick={() => gerar(r, 'pdf')}>PDF</Botao>
              <Botao variante="secundario" tamanho="sm" className="flex-1" carregando={gerando === `${r.id}-excel`} icone={<FileSpreadsheet className="h-3.5 w-3.5" />} onClick={() => gerar(r, 'excel')}>Excel</Botao>
            </div>
          </Cartao>
        ))}
      </div>
    </>
  );
}
