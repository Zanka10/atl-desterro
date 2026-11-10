'use client';

import { ArrowLeft, KeyRound, MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { CartaoAcesso } from '@/components/acesso-atleta';
import { useApp } from '@/components/contexto';
import { FalhaCarregamento, AcoesLinha, ok, useDados } from '@/components/crud';
import { FormModal, type Campo } from '@/components/formulario';
import { Abas, Avatar, Botao, Carregando, Cartao, Indicador, Selo, TOM_STATUS, Tabela, Vazio } from '@/components/ui';
import { CAMPOS_ATLETA, camposLesao, camposOcorrencia, sincronizarLesao, sincronizarSuspensao } from '@/lib/campos';
import {
  FORMAS, GRAVIDADE, PAPEIS_COMISSAO, PAPEIS_FIN, PE, POSICOES, SITUACAO, STATUS_ATLETA, STATUS_CONVOCACAO, TIPOS_OCORRENCIA,
} from '@/lib/constants';
import { atrasada, dataBR, dataHoraBR, devido, hojeBR, idade, moeda, refCobranca, situacaoFinanceira, telefoneBR } from '@/lib/format';
import type { Atleta, AtletaFinanceiro, Credito, Linha, Mensalidade } from '@/lib/types';

type Aba = 'dados' | 'financeiro' | 'convocacoes' | 'jogos' | 'disciplina' | 'comissao';
type Dados = {
  atleta: Atleta; stats: Linha[]; convocacoes: Linha[]; ocorrencias: Linha[];
  mensalidades: Mensalidade[]; creditos: Credito[]; fin: AtletaFinanceiro | null; lesoes: Linha[]; notas: Linha[]; acesso: Linha | null;
};

const CAMPOS_FIN: Campo[] = [
  { nome: 'situacao', rotulo: 'Situação especial', tipo: 'selecao', obrigatorio: true, opcoes: [
    { value: 'normal', label: 'Normal (classificação automática)' }, { value: 'isento', label: 'Isento da taxa de jogo' }, { value: 'negociacao', label: 'Em negociação' },
  ] },
  { nome: 'observacao', rotulo: 'Observação', tipo: 'area' },
];
const CAMPOS_ACESSO: Campo[] = [
  { nome: 'email', rotulo: 'E-mail de acesso', tipo: 'email', obrigatorio: true, largo: true },
  { nome: 'senha', rotulo: 'Senha provisória', tipo: 'senha', obrigatorio: true, largo: true, dica: 'Informe ao atleta; ele poderá trocá-la em "Esqueci minha senha".' },
];

const Dado = ({ rotulo, children }: { rotulo: string; children: ReactNode }) => (
  <div><dt className="text-xs uppercase tracking-wide text-zinc-500">{rotulo}</dt><dd className="mt-0.5 text-sm text-zinc-900">{children || '—'}</dd></div>
);

export default function FichaAtleta() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { supabase, perfil, pode, sucesso, erro, confirmar, whats } = useApp();
  const verFin = pode(...PAPEIS_FIN);
  const verComissao = pode(...PAPEIS_COMISSAO);
  const [aba, setAba] = useState<Aba>('dados');
  const [modal, setModal] = useState<{ tipo: 'atleta' | 'fin' | 'ocorrencia' | 'lesao' | 'nota' | 'acesso'; item?: Linha } | null>(null);

  const { dados, carregando, recarregar, falha } = useDados<Dados | null>(async () => {
    const { data: atleta } = await supabase.from('atletas').select('*').eq('id', id).maybeSingle();
    if (!atleta) return null;
    const jogo = 'partidas(id, adversario, data_hora, competicao, gols_pro, gols_contra, status)';
    const [stats, conv, oco, mens, fin, cred, les, notas, acesso] = await Promise.all([
      supabase.from('estatisticas_partida').select(`*, ${jogo}`).eq('atleta_id', id),
      supabase.from('convocacoes').select(`*, ${jogo}`).eq('atleta_id', id),
      supabase.from('ocorrencias').select('*').eq('atleta_id', id).order('data', { ascending: false }),
      verFin ? supabase.from('mensalidades').select('*').eq('atleta_id', id).order('vencimento', { ascending: false }) : null,
      verFin ? supabase.from('atleta_financeiro').select('*').eq('atleta_id', id).maybeSingle() : null,
      verFin ? supabase.from('creditos').select('*').eq('atleta_id', id).order('criado_em', { ascending: false }) : null,
      verComissao ? supabase.from('lesoes').select('*').eq('atleta_id', id).order('data_lesao', { ascending: false }) : null,
      verComissao ? supabase.from('notas_comissao').select('*').eq('atleta_id', id).order('criado_em', { ascending: false }) : null,
      supabase.from('profiles').select('id, email, ativo').eq('atleta_id', id).maybeSingle(),
    ]);
    const porData = (a: Linha, b: Linha) => String(b.partidas?.data_hora).localeCompare(String(a.partidas?.data_hora));
    return {
      atleta, stats: ok(stats).sort(porData), convocacoes: ok(conv).sort(porData), ocorrencias: ok(oco),
      mensalidades: mens ? ok(mens) : [], creditos: cred ? ok(cred).map((c: Credito) => ({ ...c, valor: Number(c.valor) })) : [], fin: fin?.data ?? null, lesoes: les ? ok(les) : [], notas: notas ? ok(notas) : [], acesso: acesso.data,
    };
  }, [id]);

  if (carregando) return <Carregando />;
  if (falha) return <FalhaCarregamento mensagem={falha} aoTentar={recarregar} />;
  if (!dados) return <Cartao><Vazio titulo="Atleta não encontrado"><Link href="/atletas" className="text-primary hover:underline">Voltar para a lista</Link></Vazio></Cartao>;
  const { atleta: a, stats, convocacoes, ocorrencias, mensalidades, creditos, fin, lesoes, notas, acesso } = dados;
  const saldoCredito = creditos.reduce((s, c) => s + c.valor, 0);
  const soma = (k: string) => stats.reduce((s, e) => s + Number(e[k] ?? 0), 0);
  const situacao = situacaoFinanceira(mensalidades, fin);
  const emAberto = mensalidades.filter((m) => m.status === 'pendente');

  const excluirAtleta = async () => {
    if (!(await confirmar({ titulo: 'Excluir atleta', perigo: true, textoConfirmar: 'Excluir definitivamente',
      mensagem: <>Excluir <strong>{a.nome}</strong> apaga também o histórico de pagamentos, convocações e estatísticas. Para preservar o histórico, prefira alterar o status para <strong>Inativo</strong>.</> }))) return;
    const { error } = await supabase.from('atletas').delete().eq('id', a.id);
    if (error) return erro(error);
    sucesso('Atleta excluído.');
    router.replace('/atletas');
  };

  const remover = async (tabela: string, registro: string, nome: string) => {
    if (!(await confirmar({ titulo: `Excluir ${nome}`, mensagem: 'Esta ação não pode ser desfeita.', textoConfirmar: 'Excluir', perigo: true }))) return;
    const { error } = await supabase.from(tabela).delete().eq('id', registro);
    if (error) return erro(error);
    sucesso('Registro excluído.');
    recarregar();
  };

  const salvar = async (v: Linha) => {
    const item = modal?.item;
    switch (modal?.tipo) {
      case 'atleta': ok(await supabase.from('atletas').update(v).eq('id', a.id).select('id')); break;
      case 'fin': ok(await supabase.from('atleta_financeiro').upsert({ atleta_id: a.id, ...v, atualizado_em: new Date().toISOString() }).select('atleta_id')); break;
      case 'ocorrencia':
        if (item) ok(await supabase.from('ocorrencias').update(v).eq('id', item.id).select('id'));
        else ok(await supabase.from('ocorrencias').insert({ ...v, atleta_id: a.id }).select('id'));
        await sincronizarSuspensao(supabase, v, a.id);
        break;
      case 'lesao':
        if (item) ok(await supabase.from('lesoes').update(v).eq('id', item.id).select('id'));
        else ok(await supabase.from('lesoes').insert({ ...v, atleta_id: a.id }).select('id'));
        await sincronizarLesao(supabase, v, a.id);
        break;
      case 'nota': ok(await supabase.from('notas_comissao').insert({ ...v, atleta_id: a.id, autor_nome: perfil.nome }).select('id')); break;
      case 'acesso': {
        const r = await fetch('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: a.nome, email: v.email, senha: v.senha, papel: 'atleta', atleta_id: a.id }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.erro);
      }
    }
    sucesso(modal?.tipo === 'acesso' ? 'Acesso ao portal criado. Informe o e-mail e a senha ao atleta.' : 'Dados salvos com sucesso.');
    await recarregar();
  };

  const config: Record<string, { titulo: string; campos: Campo[]; inicial?: Linha }> = {
    atleta: { titulo: 'Editar atleta', campos: CAMPOS_ATLETA, inicial: a },
    fin: { titulo: 'Situação financeira', campos: CAMPOS_FIN, inicial: fin ?? { situacao: 'normal' } },
    ocorrencia: { titulo: 'Ocorrência disciplinar', campos: camposOcorrencia(), inicial: modal?.item ?? { data: hojeBR() } },
    lesao: { titulo: 'Registro de lesão', campos: camposLesao(), inicial: modal?.item ?? { data_lesao: hojeBR() } },
    nota: { titulo: 'Observação da comissão técnica', campos: [{ nome: 'texto', rotulo: 'Observação', tipo: 'area', obrigatorio: true }] },
    acesso: { titulo: 'Criar acesso ao portal', campos: CAMPOS_ACESSO, inicial: { email: a.email } },
  };
  const atual = modal ? config[modal.tipo] : null;

  const abas: { id: Aba; rotulo: string; contador?: number }[] = [
    { id: 'dados', rotulo: 'Dados' },
    ...(verFin ? [{ id: 'financeiro' as Aba, rotulo: 'Financeiro' }] : []),
    { id: 'convocacoes', rotulo: 'Convocações', contador: convocacoes.length },
    { id: 'jogos', rotulo: 'Jogos', contador: stats.length },
    { id: 'disciplina', rotulo: 'Disciplina', contador: ocorrencias.length },
    ...(verComissao ? [{ id: 'comissao' as Aba, rotulo: 'Comissão técnica' }] : []),
  ];
  const jogoTexto = (p: Linha) => (p ? `x ${p.adversario}` : 'Partida removida');

  return (
    <>
      <Link href="/atletas" className="mb-3 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"><ArrowLeft className="h-4 w-4" /> Atletas</Link>
      <Cartao className="mb-4 overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 bg-secondary p-5 text-white">
          <Avatar nome={a.nome} foto={a.foto_url} tamanho={88} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold uppercase sm:text-3xl">{a.nome}</h1>
              {a.numero != null && <span className="font-display rounded-lg bg-primary px-2 py-0.5 text-xl font-bold">#{a.numero}</span>}
            </div>
            <p className="mt-0.5 text-sm text-white/70">
              {POSICOES[a.posicao].label}{a.posicao_secundaria ? ` / ${POSICOES[a.posicao_secundaria].label}` : ''}{a.apelido ? ` · "${a.apelido}"` : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Selo tom={TOM_STATUS[a.status]}>{STATUS_ATLETA[a.status]}</Selo>
              {verFin && <Selo tom={TOM_STATUS[situacao]}>{SITUACAO[situacao]}</Selo>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {a.telefone && <Botao variante="whats" tamanho="sm" icone={<MessageCircle className="h-4 w-4" />} onClick={() => whats({ tel: a.telefone, nome: a.nome, msg: `Olá, ${a.apelido || a.nome.split(' ')[0]}! ` })}>WhatsApp</Botao>}
            <Botao variante="secundario" tamanho="sm" icone={<Pencil className="h-4 w-4" />} onClick={() => setModal({ tipo: 'atleta' })}>Editar</Botao>
            {pode('admin', 'diretoria') && <Botao variante="perigo" tamanho="sm" icone={<Trash2 className="h-4 w-4" />} onClick={excluirAtleta}>Excluir</Botao>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-zinc-100 sm:grid-cols-5">
          {[['Jogos', stats.length], ['Gols', soma('gols')], ['Assistências', soma('assistencias')], ['Amarelos', soma('amarelos')], ['Vermelhos', soma('vermelhos')]].map(([r, v]) => (
            <div key={r} className="bg-white px-4 py-3 text-center">
              <p className="font-display text-2xl font-bold tabular-nums text-zinc-900">{v}</p>
              <p className="text-xs uppercase tracking-wide text-zinc-500">{r}</p>
            </div>
          ))}
        </div>
      </Cartao>

      <Abas abas={abas} ativa={aba} aoMudar={setAba} />

      {aba === 'dados' && (
        <div className="space-y-4">
        <Cartao titulo="Dados pessoais">
          <dl className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
            <Dado rotulo="Nascimento">{a.data_nascimento ? `${dataBR(a.data_nascimento)} (${idade(a.data_nascimento)} anos)` : null}</Dado>
            <Dado rotulo="Telefone / WhatsApp">{telefoneBR(a.telefone)}</Dado>
            <Dado rotulo="E-mail">{a.email}</Dado>
            <Dado rotulo="Pé dominante">{a.pe_dominante ? PE[a.pe_dominante] : null}</Dado>
            <Dado rotulo="Entrada no clube">{dataBR(a.data_entrada)}</Dado>
            <Dado rotulo="Minutos jogados">{soma('minutos') || null}</Dado>
            <div className="col-span-2 sm:col-span-3"><Dado rotulo="Observações"><span className="whitespace-pre-wrap">{a.observacoes}</span></Dado></div>
          </dl>
        </Cartao>
          {pode('admin', 'diretoria', 'comissao') && <CartaoAcesso atleta={a} />}
        </div>
      )}

      {aba === 'financeiro' && verFin && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Indicador rotulo="Crédito disponível" valor={moeda(saldoCredito)} detalhe="Usado automaticamente no próximo jogo" />
            <Indicador rotulo="Situação" valor={<Selo tom={TOM_STATUS[situacao]}>{SITUACAO[situacao]}</Selo>} detalhe={fin?.observacao ?? undefined} />
            <Indicador rotulo="Em aberto" valor={moeda(emAberto.reduce((s, m) => s + devido(m), 0))} detalhe={`${emAberto.length} cobrança(s)`} />
            <Indicador rotulo="Total pago" valor={moeda(mensalidades.filter((m) => m.status === 'pago').reduce((s, m) => s + Number(m.valor), 0))} />
          </div>
          <Cartao titulo="Histórico de taxas de jogo" acao={<Botao variante="secundario" tamanho="sm" onClick={() => setModal({ tipo: 'fin' })}>Isenção / negociação</Botao>}>
            <Tabela linhas={mensalidades} chave={(m) => m.id} vazio={<Vazio titulo="Nenhuma taxa de jogo" descricao="A taxa é gerada quando o atleta confirma presença em um jogo." />} colunas={[
              { titulo: 'Referência', celula: (m) => refCobranca(m) },
              { titulo: 'Pagar até', celula: (m) => dataBR(m.vencimento) },
              { titulo: 'Valor', direita: true, celula: (m) => <>{moeda(m.valor)}{Number(m.abatido) > 0 && <span className="block text-xs text-zinc-500">{moeda(m.abatido)} de crédito</span>}</> },
              { titulo: 'Situação', celula: (m) => (atrasada(m) ? <Selo tom="vermelho">Em atraso</Selo> : <Selo tom={TOM_STATUS[m.status]}>{m.status === 'pago' ? 'Pago' : m.status === 'pendente' ? 'Pendente' : m.status === 'isento' ? 'Isento' : m.status === 'creditado' ? 'Virou crédito' : 'Cancelado'}</Selo>) },
              { titulo: 'Pagamento', celula: (m) => (m.pago_em ? `${dataBR(m.pago_em)} · ${FORMAS[m.forma_pagamento ?? ''] ?? ''}` : '—') },
            ]} />
          </Cartao>
          <Cartao titulo="Extrato de crédito">
            <Tabela linhas={creditos} chave={(c) => c.id} vazio={<Vazio titulo="Sem movimentação de crédito" descricao="Se o atleta pagar e não for ao jogo, o valor aparece aqui como crédito." />} colunas={[
              { titulo: 'Data', celula: (c) => dataHoraBR(c.criado_em) },
              { titulo: 'Descrição', celula: (c) => c.descricao },
              { titulo: 'Valor', direita: true, celula: (c) => <span className={c.valor > 0 ? 'font-semibold text-green-700' : 'text-zinc-700'}>{c.valor > 0 ? '+' : '−'} {moeda(Math.abs(c.valor))}</span> },
            ]} />
          </Cartao>
        </div>
      )}

      {aba === 'convocacoes' && (
        <Cartao>
          <Tabela linhas={convocacoes} chave={(c) => c.id} vazio={<Vazio titulo="Nenhuma convocação registrada" />} aoClicar={(c) => c.partidas && router.push(`/partidas/${c.partidas.id}`)} colunas={[
            { titulo: 'Partida', celula: (c) => <span className="font-medium">{jogoTexto(c.partidas)}</span> },
            { titulo: 'Data', celula: (c) => dataHoraBR(c.partidas?.data_hora) },
            { titulo: 'Competição', celula: (c) => c.partidas?.competicao ?? '—' },
            { titulo: 'Resposta', celula: (c) => <Selo tom={TOM_STATUS[c.status]}>{STATUS_CONVOCACAO[c.status as keyof typeof STATUS_CONVOCACAO]}</Selo> },
          ]} />
        </Cartao>
      )}

      {aba === 'jogos' && (
        <Cartao>
          <Tabela linhas={stats} chave={(e) => e.id} vazio={<Vazio titulo="Nenhum jogo disputado" descricao="As estatísticas são lançadas no resultado de cada partida." />} colunas={[
            { titulo: 'Partida', celula: (e) => <span className="font-medium">{jogoTexto(e.partidas)}</span> },
            { titulo: 'Data', celula: (e) => dataHoraBR(e.partidas?.data_hora) },
            { titulo: 'Placar', celula: (e) => (e.partidas?.gols_pro != null ? `${e.partidas.gols_pro} x ${e.partidas.gols_contra}` : '—') },
            { titulo: 'Titular', celula: (e) => (e.titular ? 'Sim' : 'Não') },
            { titulo: 'Min', direita: true, celula: (e) => e.minutos ?? '—' },
            { titulo: 'Gols', direita: true, celula: (e) => e.gols },
            { titulo: 'Assist.', direita: true, celula: (e) => e.assistencias },
            { titulo: 'CA', direita: true, celula: (e) => e.amarelos },
            { titulo: 'CV', direita: true, celula: (e) => e.vermelhos },
          ]} />
        </Cartao>
      )}

      {aba === 'disciplina' && (
        <Cartao titulo="Ocorrências disciplinares" acao={<Botao tamanho="sm" icone={<Plus className="h-3.5 w-3.5" />} onClick={() => setModal({ tipo: 'ocorrencia' })}>Registrar</Botao>}>
          <Tabela linhas={ocorrencias} chave={(o) => o.id} vazio={<Vazio titulo="Nenhuma ocorrência registrada" />} colunas={[
            { titulo: 'Data', celula: (o) => dataBR(o.data) },
            { titulo: 'Tipo', celula: (o) => <Selo tom={o.tipo === 'cartao_amarelo' ? 'amarelo' : o.tipo === 'advertencia' || o.tipo === 'outro' ? 'cinza' : 'vermelho'}>{TIPOS_OCORRENCIA[o.tipo]}</Selo> },
            { titulo: 'Suspensão', celula: (o) => (o.jogos_suspensao ? `${o.jogos_suspensao} jogo(s) · ${o.cumprida ? 'cumprida' : 'a cumprir'}` : '—') },
            { titulo: 'Descrição', celula: (o) => o.descricao ?? '—', classe: 'max-w-xs' },
            { titulo: '', celula: (o) => <AcoesLinha aoEditar={() => setModal({ tipo: 'ocorrencia', item: o })} aoExcluir={() => remover('ocorrencias', o.id, 'ocorrência')} /> },
          ]} />
        </Cartao>
      )}

      {aba === 'comissao' && verComissao && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Cartao titulo="Histórico de lesões" acao={<Botao tamanho="sm" icone={<Plus className="h-3.5 w-3.5" />} onClick={() => setModal({ tipo: 'lesao' })}>Registrar</Botao>}>
            {!lesoes.length ? <Vazio titulo="Nenhuma lesão registrada" /> : (
              <ul className="divide-y divide-zinc-100">
                {lesoes.map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-2 px-4 py-3">
                    <div className="min-w-0 text-sm">
                      <p className="font-medium text-zinc-900">{l.descricao} {l.gravidade && <Selo tom={l.gravidade === 'grave' ? 'vermelho' : l.gravidade === 'moderada' ? 'amarelo' : 'cinza'}>{GRAVIDADE[l.gravidade]}</Selo>}</p>
                      <p className="text-xs text-zinc-500">
                        Lesão em {dataBR(l.data_lesao)} · {l.data_retorno ? `retornou em ${dataBR(l.data_retorno)}` : `previsão de retorno: ${dataBR(l.previsao_retorno)}`}
                      </p>
                      {l.observacoes && <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-600">{l.observacoes}</p>}
                    </div>
                    <AcoesLinha aoEditar={() => setModal({ tipo: 'lesao', item: l })} aoExcluir={() => remover('lesoes', l.id, 'lesão')} />
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
          <Cartao titulo="Observações da comissão" acao={<Botao tamanho="sm" icone={<Plus className="h-3.5 w-3.5" />} onClick={() => setModal({ tipo: 'nota' })}>Adicionar</Botao>}>
            {!notas.length ? <Vazio titulo="Nenhuma observação" descricao="Anotações visíveis apenas para a comissão técnica e o administrador." /> : (
              <ul className="divide-y divide-zinc-100">
                {notas.map((n) => (
                  <li key={n.id} className="flex items-start justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="whitespace-pre-wrap text-sm text-zinc-800">{n.texto}</p>
                      <p className="mt-1 text-xs text-zinc-500">{n.autor_nome ?? '—'} · {dataHoraBR(n.criado_em)}</p>
                    </div>
                    <AcoesLinha aoExcluir={() => remover('notas_comissao', n.id, 'observação')} />
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>
      )}

      {atual && <FormModal aberto titulo={atual.titulo} campos={atual.campos} inicial={atual.inicial} aoSalvar={salvar} aoFechar={() => setModal(null)} pasta="atletas" />}
    </>
  );
}
