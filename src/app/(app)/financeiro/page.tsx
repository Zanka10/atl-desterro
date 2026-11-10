'use client';

import { ArrowDownCircle, ArrowUpCircle, FileSpreadsheet, FileText, Paperclip, Plus, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/components/contexto';
import { AcoesLinha, BuscaTexto, FalhaCarregamento, buscarTudo, ok, useDados } from '@/components/crud';
import { FormModal, type Campo } from '@/components/formulario';
import { GraficoReceitasDespesas, GraficoSaldo, serieMensal } from '@/components/graficos';
import { Abas, Botao, BotaoIcone, Cabecalho, Carregando, Cartao, Indicador, Selo, Tabela, Vazio, estiloCampo } from '@/components/ui';
import { abrirDocumento } from '@/lib/arquivos';
import { CATEGORIAS_AUTOMATICAS, CATEGORIAS_DESPESA, CATEGORIAS_RECEITA, FORMAS, OPCOES_FORMA } from '@/lib/constants';
import { exportarExcel, exportarPDF, type Tabela as TabelaExp } from '@/lib/export';
import { dataBR, dataHoraBR, hojeBR, mesCurto, moeda } from '@/lib/format';
import type { Linha, Movimentacao } from '@/lib/types';

type Aba = 'lancamentos' | 'fluxo' | 'auditoria';

const CAMPOS: Campo[] = [
  { nome: 'tipo', rotulo: 'Tipo de movimentação', tipo: 'selecao', obrigatorio: true, opcoes: [{ value: 'receita', label: 'Receita (entrada)' }, { value: 'despesa', label: 'Despesa (saída)' }] },
  { nome: 'categoria', rotulo: 'Categoria', tipo: 'selecao', obrigatorio: true,
    opcoes: (v) => (v.tipo === 'despesa' ? CATEGORIAS_DESPESA : v.tipo === 'receita' ? CATEGORIAS_RECEITA.filter((c) => !CATEGORIAS_AUTOMATICAS.includes(c)) : []).map((c) => ({ value: c, label: c })),
    dica: 'Taxas de jogo são lançadas automaticamente ao registrar o pagamento.' },
  { nome: 'descricao', rotulo: 'Descrição', obrigatorio: true, largo: true },
  { nome: 'valor', rotulo: 'Valor (R$)', tipo: 'dinheiro', obrigatorio: true, min: 0.01 },
  { nome: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true },
  { nome: 'forma_pagamento', rotulo: 'Forma de pagamento', tipo: 'selecao', opcoes: OPCOES_FORMA, obrigatorio: true },
  { nome: 'status', rotulo: 'Situação', tipo: 'selecao', obrigatorio: true, opcoes: [{ value: 'confirmado', label: 'Confirmado (entra no saldo)' }, { value: 'pendente', label: 'Pendente / previsto' }] },
  { nome: 'anexo_path', rotulo: 'Comprovante ou anexo', tipo: 'arquivo', largo: true },
];
const ACOES: Record<string, string> = { INSERT: 'Inclusão', UPDATE: 'Alteração', DELETE: 'Exclusão' };
const TABELAS: Record<string, string> = { movimentacoes: 'Caixa', mensalidades: 'Taxa de jogo', creditos: 'Crédito de atleta' };

export default function Financeiro() {
  const { supabase, config, sucesso, erro, confirmar } = useApp();
  const hoje = hojeBR();
  const [aba, setAba] = useState<Aba>('lancamentos');
  const [periodo, setPeriodo] = useState(hoje.slice(0, 7));
  const [ano, setAno] = useState(hoje.slice(0, 4));
  const [tipo, setTipo] = useState('');
  const [categoria, setCategoria] = useState('');
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<Movimentacao | null | undefined>(undefined);

  const { dados: movs, carregando, recarregar, falha } = useDados<Movimentacao[]>(async () =>
    (await buscarTudo<Movimentacao>((de, ate) => supabase.from('movimentacoes').select('*').order('data', { ascending: false }).order('criado_em', { ascending: false }).order('id').range(de, ate)))
      .map((m) => ({ ...m, valor: Number(m.valor) })));
  const { dados: auditoria } = useDados<Linha[]>(async () =>
    (aba === 'auditoria' ? ok(await supabase.from('auditoria').select('*').order('criado_em', { ascending: false }).limit(300)) : []), [aba, movs]);

  if (falha && !movs) return <FalhaCarregamento mensagem={falha} aoTentar={recarregar} />;
  if (carregando || !movs) return <Carregando />;

  const conf = movs.filter((m) => m.status === 'confirmado');
  const total = (l: Movimentacao[], t: string) => l.filter((m) => m.tipo === t).reduce((s, m) => s + m.valor, 0);
  const saldo = total(conf, 'receita') - total(conf, 'despesa');
  const doMes = conf.filter((m) => m.data.startsWith(hoje.slice(0, 7)));
  const termo = busca.trim().toLowerCase();
  const filtrados = movs.filter((m) =>
    (!periodo || m.data.startsWith(periodo)) && (!tipo || m.tipo === tipo) && (!categoria || m.categoria === categoria) &&
    (!termo || `${m.descricao} ${m.categoria} ${m.responsavel_nome ?? ''}`.toLowerCase().includes(termo)));
  const filtConf = filtrados.filter((m) => m.status === 'confirmado');
  const anos = [...new Set([hoje.slice(0, 4), ...movs.map((m) => m.data.slice(0, 4))])].sort().reverse();
  const serie = serieMensal(movs, Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`));
  const doAno = conf.filter((m) => m.data.startsWith(ano));
  const porCategoria = (t: string) => Object.entries(doAno.filter((m) => m.tipo === t).reduce<Record<string, number>>((acc, m) => ({ ...acc, [m.categoria]: (acc[m.categoria] ?? 0) + m.valor }), {})).sort((a, b) => b[1] - a[1]);

  const salvar = async (v: Linha) => {
    if (editando) ok(await supabase.from('movimentacoes').update(v).eq('id', editando.id).select('id'));
    else ok(await supabase.from('movimentacoes').insert(v).select('id'));
    sucesso(editando ? 'Lançamento atualizado. Saldo recalculado.' : 'Lançamento registrado. Saldo atualizado.');
    recarregar();
  };
  const excluir = async (m: Movimentacao) => {
    if (!(await confirmar({ titulo: 'Excluir lançamento', perigo: true, textoConfirmar: 'Excluir',
      mensagem: m.mensalidade_id ? 'Este lançamento veio de uma taxa de jogo. Ao excluí-lo, a taxa voltará a ficar pendente (estorno).' : `Excluir "${m.descricao}" (${moeda(m.valor)})? A exclusão fica registrada na auditoria.` }))) return;
    const { error } = await supabase.from('movimentacoes').delete().eq('id', m.id);
    if (error) return erro(error);
    sucesso('Lançamento excluído. Saldo atualizado.');
    recarregar();
  };

  const expLancamentos = (): TabelaExp => ({
    colunas: ['Data', 'Tipo', 'Categoria', 'Descrição', 'Forma', 'Responsável', 'Situação', 'Valor'],
    linhas: filtrados.map((m) => [dataBR(m.data), m.tipo === 'receita' ? 'Receita' : 'Despesa', m.categoria, m.descricao, FORMAS[m.forma_pagamento ?? ''] ?? '', m.responsavel_nome ?? '', m.status === 'confirmado' ? 'Confirmado' : 'Pendente', moeda(m.tipo === 'receita' ? m.valor : -m.valor)]),
    rodape: ['', '', '', '', '', '', 'Resultado', moeda(total(filtConf, 'receita') - total(filtConf, 'despesa'))],
  });
  const expFluxo = (): TabelaExp => ({
    colunas: ['Mês', 'Receitas', 'Despesas', 'Resultado', 'Saldo acumulado'],
    linhas: serie.map((p) => [mesCurto(p.mes), moeda(p.receitas), moeda(p.despesas), moeda(p.receitas - p.despesas), moeda(p.saldo)]),
    rodape: [`Total ${ano}`, moeda(total(doAno, 'receita')), moeda(total(doAno, 'despesa')), moeda(total(doAno, 'receita') - total(doAno, 'despesa')), moeda(serie[11].saldo)],
  });
  const BotoesExp = ({ titulo, t }: { titulo: string; t: () => TabelaExp }) => (
    <>
      <Botao variante="secundario" tamanho="sm" icone={<FileText className="h-3.5 w-3.5" />} onClick={() => exportarPDF(titulo, t(), config)}>PDF</Botao>
      <Botao variante="secundario" tamanho="sm" icone={<FileSpreadsheet className="h-3.5 w-3.5" />} onClick={() => exportarExcel(titulo, t())}>Excel</Botao>
    </>
  );

  return (
    <>
      <Cabecalho titulo="Caixa" descricao="Receitas, despesas e fluxo de caixa do clube.">
        <Botao icone={<Plus className="h-4 w-4" />} onClick={() => setEditando(null)}>Novo lançamento</Botao>
      </Cabecalho>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Saldo atual" valor={<span className={saldo < 0 ? 'text-red-700' : undefined}>{moeda(saldo)}</span>} detalhe="Lançamentos confirmados" tom="primario" icone={<Wallet className="h-4 w-4" />} />
        <Indicador rotulo="Receitas do mês" valor={moeda(total(doMes, 'receita'))} tom="verde" icone={<ArrowUpCircle className="h-4 w-4" />} />
        <Indicador rotulo="Despesas do mês" valor={moeda(total(doMes, 'despesa'))} tom="vermelho" icone={<ArrowDownCircle className="h-4 w-4" />} />
        <Indicador rotulo="Resultado do mês" valor={moeda(total(doMes, 'receita') - total(doMes, 'despesa'))} detalhe={mesCurto(hoje.slice(0, 7))} />
      </div>

      <Abas ativa={aba} aoMudar={setAba} abas={[{ id: 'lancamentos', rotulo: 'Lançamentos' }, { id: 'fluxo', rotulo: 'Fluxo de caixa' }, { id: 'auditoria', rotulo: 'Auditoria' }]} />

      {aba === 'lancamentos' && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input type="month" className={`${estiloCampo} !w-auto`} value={periodo} onChange={(e) => setPeriodo(e.target.value)} aria-label="Mês" />
            {periodo && <Botao variante="fantasma" tamanho="sm" onClick={() => setPeriodo('')}>Ver tudo</Botao>}
            <select className={`${estiloCampo} !w-auto`} value={tipo} onChange={(e) => { setTipo(e.target.value); setCategoria(''); }} aria-label="Tipo">
              <option value="">Receitas e despesas</option><option value="receita">Receitas</option><option value="despesa">Despesas</option>
            </select>
            <select className={`${estiloCampo} !w-auto`} value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria">
              <option value="">Todas as categorias</option>
              {(tipo === 'receita' ? CATEGORIAS_RECEITA : tipo === 'despesa' ? CATEGORIAS_DESPESA : [...CATEGORIAS_RECEITA, ...CATEGORIAS_DESPESA]).map((c) => <option key={c}>{c}</option>)}
            </select>
            <BuscaTexto valor={busca} aoMudar={setBusca} />
            <div className="ml-auto flex gap-2"><BotoesExp titulo={`Movimentações${periodo ? ` ${mesCurto(periodo)}` : ''}`} t={expLancamentos} /></div>
          </div>
          <Cartao>
            <Tabela linhas={filtrados} chave={(m) => m.id} vazio={<Vazio titulo="Nenhuma movimentação no período" descricao="Registre receitas e despesas para acompanhar o caixa." icone={<Wallet className="h-6 w-6" />} />} colunas={[
              { titulo: 'Data', celula: (m) => dataBR(m.data) },
              { titulo: 'Descrição', celula: (m) => <div><p className="font-medium text-zinc-900">{m.descricao}</p><p className="text-xs text-zinc-500">{m.categoria} · {FORMAS[m.forma_pagamento ?? ''] ?? '—'}</p></div> },
              { titulo: 'Responsável', celula: (m) => m.responsavel_nome ?? '—' },
              { titulo: 'Situação', celula: (m) => <Selo tom={m.status === 'confirmado' ? 'verde' : 'amarelo'}>{m.status === 'confirmado' ? 'Confirmado' : 'Pendente'}</Selo> },
              { titulo: 'Valor', direita: true, celula: (m) => <span className="inline-flex items-center gap-1 font-semibold text-zinc-900">{m.tipo === 'receita' ? <ArrowUpCircle className="h-3.5 w-3.5 text-green-700" /> : <ArrowDownCircle className="h-3.5 w-3.5 text-red-600" />}{m.tipo === 'receita' ? '+' : '−'} {moeda(m.valor)}</span> },
              { titulo: '', celula: (m) => (
                <AcoesLinha aoEditar={m.mensalidade_id ? undefined : () => setEditando(m)} aoExcluir={() => excluir(m)}>
                  {m.anexo_path && <BotaoIcone titulo="Ver comprovante" onClick={() => abrirDocumento(supabase, m.anexo_path!).catch(erro)}><Paperclip className="h-4 w-4" /></BotaoIcone>}
                </AcoesLinha>
              ) },
            ]} />
            {filtrados.length > 0 && (
              <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-zinc-100 px-4 py-3 text-sm">
                <span>Receitas: <strong>{moeda(total(filtConf, 'receita'))}</strong></span>
                <span>Despesas: <strong>{moeda(total(filtConf, 'despesa'))}</strong></span>
                <span>Resultado: <strong>{moeda(total(filtConf, 'receita') - total(filtConf, 'despesa'))}</strong></span>
              </div>
            )}
          </Cartao>
        </>
      )}

      {aba === 'fluxo' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <select className={`${estiloCampo} !w-auto`} value={ano} onChange={(e) => setAno(e.target.value)} aria-label="Ano">
              {anos.map((a) => <option key={a}>{a}</option>)}
            </select>
            <div className="ml-auto flex gap-2"><BotoesExp titulo={`Fluxo de caixa ${ano}`} t={expFluxo} /></div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Cartao titulo={`Receitas x despesas — ${ano}`}><div className="p-3"><GraficoReceitasDespesas dados={serie} /></div></Cartao>
            <Cartao titulo={`Evolução do saldo — ${ano}`}><div className="p-3"><GraficoSaldo dados={serie} /></div></Cartao>
          </div>
          <Cartao titulo={`Relatório mensal e anual — ${ano}`}>
            <Tabela linhas={serie} chave={(p) => p.mes} colunas={[
              { titulo: 'Mês', celula: (p) => mesCurto(p.mes) },
              { titulo: 'Receitas', direita: true, celula: (p) => moeda(p.receitas) },
              { titulo: 'Despesas', direita: true, celula: (p) => moeda(p.despesas) },
              { titulo: 'Resultado', direita: true, celula: (p) => <span className={p.receitas - p.despesas < 0 ? 'text-red-700' : undefined}>{moeda(p.receitas - p.despesas)}</span> },
              { titulo: 'Saldo acumulado', direita: true, celula: (p) => <strong>{moeda(p.saldo)}</strong> },
            ]} />
            <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <span>Receitas {ano}: <strong>{moeda(total(doAno, 'receita'))}</strong></span>
              <span>Despesas {ano}: <strong>{moeda(total(doAno, 'despesa'))}</strong></span>
              <span>Resultado {ano}: <strong>{moeda(total(doAno, 'receita') - total(doAno, 'despesa'))}</strong></span>
            </div>
          </Cartao>
          <div className="grid gap-4 lg:grid-cols-2">
            {(['receita', 'despesa'] as const).map((t) => (
              <Cartao key={t} titulo={`${t === 'receita' ? 'Receitas' : 'Despesas'} por categoria — ${ano}`}>
                {!porCategoria(t).length ? <Vazio titulo="Sem lançamentos no ano" /> : (
                  <ul className="space-y-2.5 p-4">
                    {porCategoria(t).map(([cat, v]) => (
                      <li key={cat}>
                        <div className="mb-1 flex justify-between text-sm"><span className="text-zinc-700">{cat}</span><span className="font-medium tabular-nums">{moeda(v)}</span></div>
                        <div className="h-1.5 rounded-full bg-zinc-100"><div className="h-full rounded-full" style={{ width: `${(v / porCategoria(t)[0][1]) * 100}%`, background: t === 'receita' ? '#15803d' : '#dc2626' }} /></div>
                      </li>
                    ))}
                  </ul>
                )}
              </Cartao>
            ))}
          </div>
        </div>
      )}

      {aba === 'auditoria' && (
        <Cartao titulo="Registro de auditoria das movimentações financeiras">
          {!auditoria ? <Carregando /> : (
            <Tabela linhas={auditoria} chave={(a) => String(a.id)} vazio={<Vazio titulo="Nenhum registro de auditoria" />} colunas={[
              { titulo: 'Quando', celula: (a) => dataHoraBR(a.criado_em) },
              { titulo: 'Usuário', celula: (a) => a.usuario_nome ?? 'Sistema' },
              { titulo: 'Origem', celula: (a) => TABELAS[a.tabela] ?? a.tabela },
              { titulo: 'Ação', celula: (a) => <Selo tom={a.acao === 'INSERT' ? 'verde' : a.acao === 'DELETE' ? 'vermelho' : 'amarelo'}>{ACOES[a.acao]}</Selo> },
              { titulo: 'Detalhes', classe: 'text-xs text-zinc-600', celula: (a) => {
                const d = a.depois ?? a.antes ?? {};
                const base = a.tabela === 'movimentacoes' || a.tabela === 'creditos' ? `${d.descricao} · ${moeda(d.valor)}` : `${d.descricao ?? `Mensalidade ${String(d.competencia ?? '').slice(5, 7)}/${String(d.competencia ?? '').slice(0, 4)}`} · ${moeda(d.valor)} · ${d.status}`;
                const mudou = a.acao === 'UPDATE' && a.antes && a.depois ? Object.keys(a.depois).filter((k) => JSON.stringify(a.antes[k]) !== JSON.stringify(a.depois[k])) : [];
                return <>{base}{mudou.length > 0 && <span className="block text-zinc-400">Alterado: {mudou.map((k) => `${k} (${a.antes[k] ?? '—'} → ${a.depois[k] ?? '—'})`).join('; ')}</span>}</>;
              } },
            ]} />
          )}
        </Cartao>
      )}

      <FormModal aberto={editando !== undefined} titulo={editando ? 'Editar lançamento' : 'Novo lançamento'} campos={CAMPOS} pasta="financeiro"
        inicial={editando ?? { tipo: 'despesa', data: hoje, forma_pagamento: 'pix', status: 'confirmado' }} aoSalvar={salvar} aoFechar={() => setEditando(undefined)} />
    </>
  );
}
