'use client';

import { BadgeCheck, CalendarClock, ChevronLeft, ChevronRight, CircleDollarSign, FileSpreadsheet, FileText, MessageCircle, Paperclip, PiggyBank, RefreshCw, RotateCcw, Settings, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useApp } from '@/components/contexto';
import { AcoesLinha, BuscaTexto, buscarTudo, ok, useDados } from '@/components/crud';
import { FormModal, type Campo } from '@/components/formulario';
import { Abas, Avatar, Botao, BotaoIcone, Cabecalho, Carregando, Cartao, Indicador, Selo, TOM_STATUS, Tabela, Vazio, estiloCampo } from '@/components/ui';
import { abrirDocumento } from '@/lib/arquivos';
import { FORMAS, OPCOES_FORMA, SITUACAO } from '@/lib/constants';
import { exportarExcel, exportarPDF, type Tabela as TabelaExp } from '@/lib/export';
import { atrasada, dataBR, dataExtensa, dataHoraBR, devido, hojeBR, horaBR, mesCurto, moeda, refCobranca, situacaoFinanceira, somarMeses } from '@/lib/format';
import type { Atleta, AtletaFinanceiro, Credito, Linha, Mensalidade, Partida, SituacaoFinanceira } from '@/lib/types';
import { MSG } from '@/lib/whatsapp';

type Aba = 'jogos' | 'inadimplencia' | 'creditos' | 'situacao';
type Dados = { atletas: Atleta[]; cobrancas: Mensalidade[]; creditos: Credito[]; fin: AtletaFinanceiro[]; partidas: Pick<Partida, 'id' | 'adversario' | 'data_hora' | 'status'>[] };
type ModalTipo = { tipo: 'pagar' | 'editar' | 'config' | 'situacao' | 'ajuste'; m?: Mensalidade; atleta?: Atleta };

const ROTULO_STATUS: Record<string, string> = { pago: 'Pago', pendente: 'Pendente', isento: 'Isento', cancelado: 'Cancelado', creditado: 'Virou crédito' };
const editavel = (m: Mensalidade) => m.status === 'pendente' || m.status === 'isento' || m.status === 'cancelado';

export default function TaxasDeJogo() {
  const { supabase, config, setConfig, sucesso, erro, confirmar, whats } = useApp();
  const hoje = hojeBR();
  const [aba, setAba] = useState<Aba>('jogos');
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('');
  const [modal, setModal] = useState<ModalTipo | null>(null);
  const [recalculando, setRecalculando] = useState(false);

  const { dados, carregando, recarregar } = useDados<Dados>(async () => {
    const [a, m, c, f, p] = await Promise.all([
      supabase.from('atletas').select('*').order('nome'),
      buscarTudo<Mensalidade>((de, ate) => supabase.from('mensalidades').select('*').order('vencimento').order('id').range(de, ate)),
      buscarTudo<Credito>((de, ate) => supabase.from('creditos').select('*').order('criado_em', { ascending: false }).order('id').range(de, ate)),
      supabase.from('atleta_financeiro').select('*'),
      supabase.from('partidas').select('id, adversario, data_hora, status'),
    ]);
    return {
      atletas: ok(a), fin: ok(f), partidas: ok(p),
      cobrancas: m.map((x) => ({ ...x, valor: Number(x.valor), abatido: Number(x.abatido ?? 0) })),
      creditos: c.map((x) => ({ ...x, valor: Number(x.valor) })),
    };
  });
  if (carregando || !dados) return <Carregando />;

  const { atletas, cobrancas, creditos, fin, partidas } = dados;
  const saldoDe = (id: string) => creditos.filter((c) => c.atleta_id === id).reduce((s, c) => s + c.valor, 0);
  const comCredito = atletas.map((a) => ({ atleta: a, saldo: saldoDe(a.id) })).filter((x) => x.saldo !== 0).sort((a, b) => b.saldo - a.saldo);
  const totalCredito = comCredito.reduce((s, x) => s + x.saldo, 0);
  const aPagar = (l: Mensalidade[]) => l.reduce((s, m) => s + devido(m), 0);
  const atletaDe = (id: string) => atletas.find((a) => a.id === id);
  const nome = (id: string) => atletaDe(id)?.nome ?? 'Atleta removido';
  const primeiroNome = (a?: Atleta) => a?.apelido || a?.nome.split(' ')[0] || '';
  const soma = (l: Mensalidade[]) => l.reduce((s, m) => s + m.valor, 0);
  const termo = busca.trim().toLowerCase();

  // Taxas do mês selecionado (pela data do jogo), agrupadas por jogo
  const doMes = cobrancas.filter((m) => m.vencimento.startsWith(mes));
  const filtradas = doMes.filter((m) =>
    (!termo || nome(m.atleta_id).toLowerCase().includes(termo)) &&
    (!filtro || (filtro === 'atrasada' ? atrasada(m, hoje) : m.status === filtro)));
  const grupos = [...new Set(filtradas.map((m) => m.partida_id ?? `sem-${m.descricao ?? m.competencia}`))].map((chave) => {
    const itens = filtradas.filter((m) => (m.partida_id ?? `sem-${m.descricao ?? m.competencia}`) === chave);
    const partida = partidas.find((p) => p.id === chave);
    return { chave, partida, titulo: partida ? `Jogo x ${partida.adversario}` : refCobranca(itens[0]), vencimento: itens[0].vencimento, itens };
  }).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const validas = doMes.filter((m) => m.status === 'pago' || m.status === 'pendente');

  // Inadimplência: taxa de jogo não paga até a data do jogo
  const inadimplentes = atletas.map((a) => {
    const venc = cobrancas.filter((m) => m.atleta_id === a.id && atrasada(m, hoje));
    return { atleta: a, vencidas: venc, total: aPagar(venc), situacao: fin.find((f) => f.atleta_id === a.id)?.situacao };
  }).filter((x) => x.vencidas.length && x.situacao !== 'isento').sort((a, b) => b.total - a.total);

  const situacoes = atletas.filter((a) => a.status !== 'inativo').map((a) => {
    const minhas = cobrancas.filter((m) => m.atleta_id === a.id);
    const f = fin.find((x) => x.atleta_id === a.id) ?? null;
    return { atleta: a, fin: f, situacao: situacaoFinanceira(minhas, f), aberto: aPagar(minhas.filter((m) => m.status === 'pendente')), saldo: saldoDe(a.id) };
  });
  const contaSit = (s: SituacaoFinanceira) => situacoes.filter((x) => x.situacao === s).length;

  const recalcular = async () => {
    setRecalculando(true);
    const { data, error } = await supabase.rpc('sincronizar_cobrancas_jogos');
    setRecalculando(false);
    if (error) return erro(error);
    sucesso(`Taxas conferidas com as confirmações. ${data} em aberto no total.`);
    recarregar();
  };

  const estornar = async (m: Mensalidade) => {
    if (!(await confirmar({ titulo: 'Estornar pagamento', perigo: true, textoConfirmar: 'Estornar',
      mensagem: <>O pagamento de <strong>{nome(m.atleta_id)}</strong> ({refCobranca(m)}) será desfeito e a receita removida do caixa.</> }))) return;
    const { error } = await supabase.rpc('estornar_pagamento', { p_mensalidade: m.id });
    if (error) return erro(error);
    sucesso('Pagamento estornado. A taxa voltou a ficar pendente.');
    recarregar();
  };

  const excluir = async (m: Mensalidade) => {
    if (!(await confirmar({ titulo: 'Excluir cobrança', perigo: true, textoConfirmar: 'Excluir',
      mensagem: <>Excluir a taxa de <strong>{nome(m.atleta_id)}</strong> ({refCobranca(m)})? Se o atleta continuar confirmado, a taxa será gerada de novo — para dispensar o pagamento, prefira editar e marcar como <strong>Isento</strong>.</> }))) return;
    const { error } = await supabase.from('mensalidades').delete().eq('id', m.id);
    if (error) return erro(error);
    sucesso('Cobrança excluída.');
    recarregar();
  };

  const cobrar = (a: Atleta, pendentes: Mensalidade[]) => whats({ tel: a.telefone, nome: a.nome, msg: MSG.cobranca(primeiroNome(a), pendentes, config) });

  const salvar = async (v: Linha) => {
    const m = modal?.m;
    switch (modal?.tipo) {
      case 'pagar': {
        const { error } = await supabase.rpc('registrar_pagamento', { p_mensalidade: m!.id, p_data: v.pago_em, p_forma: v.forma_pagamento, p_observacao: v.observacao, p_comprovante: v.comprovante_path });
        if (error) throw error;
        sucesso('Pagamento registrado e lançado no caixa.');
        break;
      }
      case 'editar':
        ok(await supabase.from('mensalidades').update(v).eq('id', m!.id).select('id'));
        sucesso('Cobrança atualizada.');
        break;
      case 'config': {
        let alteradas = 0;
        if (Number(v.valor_jogo) !== Number(config.valor_jogo)) {
          const { data, error } = await supabase.rpc('alterar_valor_jogo', { p_valor: v.valor_jogo, p_aplicar_abertas: !!v.aplicar_abertas });
          if (error) throw error;
          alteradas = data ?? 0;
        }
        const novo = ok(await supabase.from('configuracoes').update({ dias_alerta: v.dias_alerta, chave_pix: v.chave_pix }).eq('id', 1).select('*').single());
        setConfig({ ...novo, valor_mensalidade: Number(novo.valor_mensalidade), valor_jogo: Number(novo.valor_jogo) });
        sucesso(alteradas ? `Configurações salvas. ${alteradas} taxa(s) em aberto passaram para ${moeda(v.valor_jogo)}.` : 'Configurações salvas.');
        break;
      }
      case 'ajuste': {
        const valor = (v.operacao === 'retirar' ? -1 : 1) * Number(v.valor);
        const { data, error } = await supabase.rpc('ajustar_credito', { p_atleta: modal.atleta!.id, p_valor: valor, p_descricao: v.motivo });
        if (error) throw error;
        sucesso(`Crédito ajustado. Saldo atual de ${modal.atleta!.nome}: ${moeda(data)}.`);
        break;
      }
      case 'situacao':
        ok(await supabase.from('atleta_financeiro').upsert({ atleta_id: modal.atleta!.id, ...v, atualizado_em: new Date().toISOString() }).select('atleta_id'));
        await supabase.rpc('sincronizar_cobrancas_jogos');
        sucesso('Situação financeira atualizada.');
    }
    await recarregar();
  };

  const formularios: Record<ModalTipo['tipo'], { titulo: string; campos: Campo[]; inicial?: Linha; botao?: string }> = {
    pagar: {
      titulo: `Receber ${modal?.m ? `${moeda(devido(modal.m))} — ${nome(modal.m.atleta_id)} (${refCobranca(modal.m)})` : ''}`, botao: 'Confirmar pagamento',
      inicial: { pago_em: hoje, forma_pagamento: 'pix', comprovante_path: modal?.m?.comprovante_path },
      campos: [
        { nome: 'pago_em', rotulo: 'Data do pagamento', tipo: 'data', obrigatorio: true, validar: (v) => (String(v) > hoje ? 'A data não pode ser futura.' : undefined) },
        { nome: 'forma_pagamento', rotulo: 'Forma de pagamento', tipo: 'selecao', opcoes: OPCOES_FORMA, obrigatorio: true },
        { nome: 'comprovante_path', rotulo: 'Comprovante', tipo: 'arquivo', largo: true },
        { nome: 'observacao', rotulo: 'Observação', tipo: 'area' },
      ],
    },
    editar: {
      titulo: 'Editar cobrança', inicial: modal?.m,
      campos: [
        { nome: 'valor', rotulo: 'Valor (R$)', tipo: 'dinheiro', obrigatorio: true, min: 0 },
        { nome: 'vencimento', rotulo: 'Pagar até', tipo: 'data', obrigatorio: true },
        { nome: 'status', rotulo: 'Situação', tipo: 'selecao', obrigatorio: true, opcoes: [{ value: 'pendente', label: 'Pendente' }, { value: 'isento', label: 'Isento neste jogo' }, { value: 'cancelado', label: 'Cancelado' }] },
        { nome: 'observacao', rotulo: 'Observação', tipo: 'area' },
      ],
    },
    config: {
      titulo: 'Configurar taxa de jogo', inicial: { ...config, aplicar_abertas: true },
      campos: [
        { nome: 'valor_jogo', rotulo: 'Valor por jogo (R$)', tipo: 'dinheiro', obrigatorio: true, min: 0, dica: 'Cobrado de cada atleta que confirma presença.' },
        { nome: 'aplicar_abertas', rotulo: 'Taxas já geradas', tipo: 'caixa', dica: 'Aplicar o novo valor às taxas em aberto dos próximos jogos (taxas pagas não mudam)', largo: true,
          mostrar: (v) => Number(v.valor_jogo) !== Number(config.valor_jogo) },
        { nome: 'dias_alerta', rotulo: 'Alertar quantos dias antes do jogo', tipo: 'numero', obrigatorio: true, min: 0, max: 30 },
        { nome: 'chave_pix', rotulo: 'Chave Pix do clube', largo: true, dica: 'Aparece nas mensagens de cobrança e no portal do atleta.' },
      ],
    },
    situacao: {
      titulo: `Situação financeira — ${modal?.atleta?.nome ?? ''}`, inicial: fin.find((f) => f.atleta_id === modal?.atleta?.id) ?? { situacao: 'normal' },
      campos: [
        { nome: 'situacao', rotulo: 'Situação especial', tipo: 'selecao', obrigatorio: true, largo: true, opcoes: [
          { value: 'normal', label: 'Normal (classificação automática)' }, { value: 'isento', label: 'Isento da taxa de jogo' }, { value: 'negociacao', label: 'Em negociação' }] },
        { nome: 'observacao', rotulo: 'Observação', tipo: 'area' },
      ],
    },
    ajuste: {
      titulo: `Ajustar crédito — ${modal?.atleta?.nome ?? ''}`, botao: 'Ajustar', inicial: { operacao: 'adicionar' },
      campos: [
        { nome: 'operacao', rotulo: 'Operação', tipo: 'selecao', obrigatorio: true, opcoes: [
          { value: 'adicionar', label: 'Adicionar crédito' }, { value: 'retirar', label: 'Retirar crédito (ex.: devolvido em dinheiro)' }] },
        { nome: 'valor', rotulo: 'Valor (R$)', tipo: 'dinheiro', obrigatorio: true, min: 0.01,
          validar: (v, t) => (t.operacao === 'retirar' && modal?.atleta && Number(v) > saldoDe(modal.atleta.id) ? `O saldo é ${moeda(saldoDe(modal.atleta.id))}.` : undefined) },
        { nome: 'motivo', rotulo: 'Motivo', obrigatorio: true, largo: true, placeholder: 'Ex.: devolução em dinheiro, correção de lançamento…' },
      ],
    },
  };
  const atual = modal ? formularios[modal.tipo] : null;

  const relatorio = (): TabelaExp => ({
    colunas: ['Atleta', 'Telefone', 'Jogos em atraso', 'Qtd.', 'Total devido'],
    linhas: inadimplentes.map((x) => [x.atleta.nome, x.atleta.telefone ?? '', x.vencidas.map(refCobranca).join(', '), x.vencidas.length, moeda(x.total)]),
    rodape: ['Total', '', '', inadimplentes.reduce((s, x) => s + x.vencidas.length, 0), moeda(inadimplentes.reduce((s, x) => s + x.total, 0))],
  });

  return (
    <>
      <Cabecalho titulo="Taxas de jogo" descricao={`${moeda(config.valor_jogo)} por jogo · cobrada de quem confirma presença · pagamento até a data do jogo`}>
        <Botao variante="secundario" icone={<Settings className="h-4 w-4" />} onClick={() => setModal({ tipo: 'config' })}>Configurar</Botao>
      </Cabecalho>

      <Abas ativa={aba} aoMudar={setAba} abas={[
        { id: 'jogos', rotulo: 'Por jogo' },
        { id: 'inadimplencia', rotulo: 'Inadimplência', contador: inadimplentes.length },
        { id: 'creditos', rotulo: 'Créditos', contador: comCredito.length || undefined },
        { id: 'situacao', rotulo: 'Situação dos atletas' },
      ]} />

      {aba === 'jogos' && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador rotulo="Previsto no mês" valor={moeda(soma(validas))} detalhe={`${validas.length} taxa(s)`} />
            <Indicador rotulo="Recebido" valor={moeda(soma(doMes.filter((m) => m.status === 'pago')))} detalhe={`${doMes.filter((m) => m.status === 'pago').length} pagamento(s)`} tom="verde" icone={<BadgeCheck className="h-4 w-4" />} />
            <Indicador rotulo="A receber" valor={moeda(aPagar(doMes.filter((m) => m.status === 'pendente' && !atrasada(m, hoje))))} detalhe="dentro do prazo" tom="amarelo" icone={<CircleDollarSign className="h-4 w-4" />} />
            <Indicador rotulo="Em atraso" valor={moeda(aPagar(doMes.filter((m) => atrasada(m, hoje))))} detalhe={`${doMes.filter((m) => atrasada(m, hoje)).length} após o jogo`} tom="vermelho" icone={<CircleDollarSign className="h-4 w-4" />} />
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-zinc-300 bg-white">
              <BotaoIcone titulo="Mês anterior" onClick={() => setMes(somarMeses(mes, -1))}><ChevronLeft className="h-4 w-4" /></BotaoIcone>
              <span className="font-display w-20 text-center text-sm font-semibold uppercase">{mesCurto(mes)}</span>
              <BotaoIcone titulo="Próximo mês" onClick={() => setMes(somarMeses(mes, 1))}><ChevronRight className="h-4 w-4" /></BotaoIcone>
            </div>
            <BuscaTexto valor={busca} aoMudar={setBusca} placeholder="Buscar atleta…" />
            <select className={`${estiloCampo} !w-auto`} value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por situação">
              <option value="">Todas as situações</option>
              <option value="pendente">Pendentes</option>
              <option value="atrasada">Em atraso</option>
              <option value="pago">Pagas</option>
              <option value="isento">Isentas</option>
            </select>
            <Botao className="ml-auto" variante="secundario" icone={<RefreshCw className="h-4 w-4" />} carregando={recalculando} onClick={recalcular}>Conferir taxas</Botao>
          </div>

          {!grupos.length ? (
            <Cartao><Vazio icone={<Trophy className="h-6 w-6" />} titulo={doMes.length ? 'Nenhuma taxa com esses filtros' : `Nenhuma taxa de jogo em ${mesCurto(mes)}`}
              descricao={doMes.length ? undefined : 'As taxas aparecem aqui sozinhas quando os atletas confirmam presença nos jogos do mês.'} /></Cartao>
          ) : (
            <div className="space-y-4">
              {grupos.map((g) => {
                const pagos = g.itens.filter((m) => m.status === 'pago').length;
                const prazo = g.vencimento >= hoje;
                return (
                  <Cartao key={g.chave} titulo={
                    <span className="flex flex-wrap items-center gap-2 normal-case">
                      <span className="uppercase">{g.titulo}</span>
                      <span className="flex items-center gap-1 text-xs font-normal text-zinc-500">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {g.partida ? `${dataExtensa(g.partida.data_hora)} · ${horaBR(g.partida.data_hora)}` : dataBR(g.vencimento)}
                      </span>
                      {g.partida?.status === 'cancelada' && <Selo>Cancelado</Selo>}
                    </span>
                  } acao={
                    <span className="flex items-center gap-2">
                      <Selo tom={pagos === g.itens.length ? 'verde' : prazo ? 'amarelo' : 'vermelho'}>{pagos}/{g.itens.length} pagos</Selo>
                      {g.partida && <Link href={`/partidas/${g.partida.id}`} className="text-xs font-medium text-primary hover:underline">Abrir jogo</Link>}
                    </span>
                  }>
                    <Tabela linhas={g.itens} chave={(m) => m.id} colunas={[
                      { titulo: 'Atleta', celula: (m) => <span className="font-medium text-zinc-900">{nome(m.atleta_id)}</span> },
                      { titulo: 'Valor', direita: true, celula: (m) => (
                        <>{moeda(m.status === 'pendente' ? devido(m) : m.valor)}{Number(m.abatido) > 0 && <span className="block text-xs text-zinc-500">{moeda(m.abatido)} de crédito</span>}</>
                      ) },
                      { titulo: 'Situação', celula: (m) => (
                        <div className="flex flex-wrap items-center gap-1">
                          {atrasada(m, hoje) ? <Selo tom="vermelho">Em atraso</Selo> : <Selo tom={TOM_STATUS[m.status]}>{m.status === 'pendente' ? `Pagar até ${dataBR(m.vencimento)}` : ROTULO_STATUS[m.status]}</Selo>}
                          {m.status === 'pendente' && m.comprovante_enviado_em && <Selo tom="azul">Comprovante enviado</Selo>}
                        </div>
                      ) },
                      { titulo: 'Pagamento', celula: (m) => (m.pago_em ? `${dataBR(m.pago_em)} · ${FORMAS[m.forma_pagamento ?? ''] ?? ''}` : '—') },
                      { titulo: '', celula: (m) => {
                        const a = atletaDe(m.atleta_id);
                        return (
                          <AcoesLinha aoEditar={editavel(m) ? () => setModal({ tipo: 'editar', m }) : undefined} aoExcluir={editavel(m) && !Number(m.abatido) ? () => excluir(m) : undefined}>
                            {m.comprovante_path && <BotaoIcone titulo="Ver comprovante" onClick={() => abrirDocumento(supabase, m.comprovante_path!).catch(erro)}><Paperclip className="h-4 w-4" /></BotaoIcone>}
                            {m.status === 'pendente' && <Botao tamanho="sm" onClick={() => setModal({ tipo: 'pagar', m })}>Receber</Botao>}
                            {m.status === 'pendente' && a && <BotaoIcone titulo="Cobrar pelo WhatsApp" onClick={() => cobrar(a, [m])}><MessageCircle className="h-4 w-4" /></BotaoIcone>}
                            {m.status === 'pago' && a && <BotaoIcone titulo="Enviar confirmação de pagamento" onClick={() => whats({ tel: a.telefone, nome: a.nome, msg: MSG.pagamento(primeiroNome(a), m, m.pago_em!, config) })}><MessageCircle className="h-4 w-4" /></BotaoIcone>}
                            {m.status === 'pago' && <BotaoIcone titulo="Estornar pagamento" onClick={() => estornar(m)}><RotateCcw className="h-4 w-4" /></BotaoIcone>}
                          </AcoesLinha>
                        );
                      } },
                    ]} />
                    <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-zinc-100 px-4 py-2.5 text-sm">
                      <span>Recebido: <strong>{moeda(soma(g.itens.filter((m) => m.status === 'pago')))}</strong></span>
                      <span>Em aberto: <strong>{moeda(aPagar(g.itens.filter((m) => m.status === 'pendente')))}</strong></span>
                    </div>
                  </Cartao>
                );
              })}
            </div>
          )}
        </>
      )}

      {aba === 'inadimplencia' && (
        <Cartao titulo={`${inadimplentes.length} atleta(s) com taxa em atraso · ${moeda(inadimplentes.reduce((s, x) => s + x.total, 0))}`}
          acao={inadimplentes.length > 0 && <div className="flex gap-2">
            <Botao variante="secundario" tamanho="sm" icone={<FileText className="h-3.5 w-3.5" />} onClick={() => exportarPDF('Relatório de inadimplência', relatorio(), config)}>PDF</Botao>
            <Botao variante="secundario" tamanho="sm" icone={<FileSpreadsheet className="h-3.5 w-3.5" />} onClick={() => exportarExcel('Inadimplência', relatorio())}>Excel</Botao>
          </div>}>
          <Tabela linhas={inadimplentes} chave={(x) => x.atleta.id} vazio={<Vazio titulo="Nenhum atleta inadimplente" descricao="Todas as taxas dos jogos já realizados estão quitadas." icone={<BadgeCheck className="h-6 w-6" />} />} colunas={[
            { titulo: 'Atleta', celula: (x) => <div className="flex items-center gap-3"><Avatar nome={x.atleta.nome} foto={x.atleta.foto_url} tamanho={34} /><span className="font-medium text-zinc-900">{x.atleta.nome}</span>{x.situacao === 'negociacao' && <Selo tom="roxo">Em negociação</Selo>}</div> },
            { titulo: 'Jogos em atraso', celula: (x) => x.vencidas.map(refCobranca).join(', '), classe: 'max-w-sm' },
            { titulo: 'Total devido', direita: true, celula: (x) => <strong>{moeda(x.total)}</strong> },
            { titulo: '', celula: (x) => <div className="flex justify-end"><Botao variante="whats" tamanho="sm" icone={<MessageCircle className="h-3.5 w-3.5" />} onClick={() => cobrar(x.atleta, x.vencidas)}>Cobrar</Botao></div> },
          ]} />
        </Cartao>
      )}

      {aba === 'creditos' && (
        <div className="space-y-4">
          <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            Quando um atleta paga e não vai ao jogo (avisa ausência, é retirado da convocação, o jogo é cancelado ou a comissão marca que não compareceu),
            o valor vira crédito e é descontado automaticamente no próximo jogo em que ele confirmar presença.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Indicador rotulo="Crédito total dos atletas" valor={moeda(totalCredito)} detalhe="Valor já recebido, a ser usado em jogos" tom="azul" icone={<PiggyBank className="h-4 w-4" />} />
            <Indicador rotulo="Atletas com crédito" valor={comCredito.filter((x) => x.saldo > 0).length} />
          </div>
          <Cartao titulo="Saldo por atleta">
            <Tabela linhas={comCredito} chave={(x) => x.atleta.id} vazio={<Vazio titulo="Nenhum atleta com crédito" icone={<PiggyBank className="h-6 w-6" />} />} colunas={[
              { titulo: 'Atleta', celula: (x) => <div className="flex items-center gap-3"><Avatar nome={x.atleta.nome} foto={x.atleta.foto_url} tamanho={34} /><span className="font-medium text-zinc-900">{x.atleta.nome}</span></div> },
              { titulo: 'Saldo', direita: true, celula: (x) => <strong>{moeda(x.saldo)}</strong> },
              { titulo: '', celula: (x) => <div className="flex justify-end"><Botao variante="secundario" tamanho="sm" onClick={() => setModal({ tipo: 'ajuste', atleta: x.atleta })}>Ajustar</Botao></div> },
            ]} />
          </Cartao>
          <Cartao titulo="Extrato de créditos">
            <Tabela linhas={creditos.slice(0, 200)} chave={(c) => c.id} vazio={<Vazio titulo="Nenhuma movimentação de crédito" />} colunas={[
              { titulo: 'Data', celula: (c) => dataHoraBR(c.criado_em) },
              { titulo: 'Atleta', celula: (c) => nome(c.atleta_id) },
              { titulo: 'Descrição', celula: (c) => c.descricao, classe: 'max-w-md' },
              { titulo: 'Por', celula: (c) => c.usuario_nome ?? 'Sistema' },
              { titulo: 'Valor', direita: true, celula: (c) => <span className={c.valor > 0 ? 'font-semibold text-green-700' : 'text-zinc-700'}>{c.valor > 0 ? '+' : '−'} {moeda(Math.abs(c.valor))}</span> },
            ]} />
          </Cartao>
        </div>
      )}

      {aba === 'situacao' && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(Object.keys(SITUACAO) as SituacaoFinanceira[]).map((s) => <Indicador key={s} rotulo={SITUACAO[s]} valor={contaSit(s)} />)}
          </div>
          <Cartao>
            <Tabela linhas={situacoes} chave={(x) => x.atleta.id} colunas={[
              { titulo: 'Atleta', celula: (x) => <span className="font-medium text-zinc-900">{x.atleta.nome}</span> },
              { titulo: 'Classificação', celula: (x) => <Selo tom={TOM_STATUS[x.situacao]}>{SITUACAO[x.situacao]}</Selo> },
              { titulo: 'Em aberto', direita: true, celula: (x) => moeda(x.aberto) },
              { titulo: 'Crédito', direita: true, celula: (x) => (x.saldo ? moeda(x.saldo) : '—') },
              { titulo: 'Observação', celula: (x) => x.fin?.observacao ?? '—', classe: 'max-w-xs' },
              { titulo: '', celula: (x) => (
                <AcoesLinha aoEditar={() => setModal({ tipo: 'situacao', atleta: x.atleta })}>
                  <BotaoIcone titulo="Ajustar crédito" onClick={() => setModal({ tipo: 'ajuste', atleta: x.atleta })}><PiggyBank className="h-4 w-4" /></BotaoIcone>
                </AcoesLinha>
              ) },
            ]} />
          </Cartao>
        </>
      )}

      {atual && <FormModal aberto titulo={atual.titulo} campos={atual.campos} inicial={atual.inicial} aoSalvar={salvar} aoFechar={() => setModal(null)} textoBotao={atual.botao}
        pasta={modal?.m ? `atletas/${modal.m.atleta_id}` : 'geral'} />}
    </>
  );
}
