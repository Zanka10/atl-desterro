'use client';

import { CalendarClock, Check, Copy, KeyRound, MapPin, Megaphone, Paperclip, Pencil, Pin, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { ArteEscalacao } from '@/components/arte';
import { useApp } from '@/components/contexto';
import { FalhaCarregamento, buscarTudo, ok, useDados } from '@/components/crud';
import { FormModal, type Campo } from '@/components/formulario';
import { Ranking } from '@/components/ranking';
import { Abas, Avatar, Botao, Carregando, Cartao, Indicador, Modal, Selo, TOM_STATUS, Tabela, Vazio } from '@/components/ui';
import { abrirDocumento, enviarArquivo } from '@/lib/arquivos';
import { resultado } from '@/lib/campos';
import { FORMAS, OPCOES_PE, PE, POSICOES, SITUACAO, STATUS_ATLETA, STATUS_CONVOCACAO, TIPOS_EVENTO } from '@/lib/constants';
import { individuais } from '@/lib/estatisticas';
import { atrasada, dataBR, dataExtensa, dataHoraBR, devido, diaBR, hojeBR, horaBR, idade, moeda, refCobranca, situacaoFinanceira, telefoneBR } from '@/lib/format';
import type { Atleta, AtletaBasico, AtletaFinanceiro, Convocacao, Credito, Estatistica, ItemEscalacao, Linha, Mensalidade, Partida } from '@/lib/types';

type Aba = 'inicio' | 'jogos' | 'mensalidades' | 'estatisticas' | 'dados';
type Eu = Omit<Atleta, 'observacoes'>;
type Dados = {
  eu: Eu | null; elenco: AtletaBasico[]; partidas: Partida[]; convocacoes: Convocacao[]; escalacao: (ItemEscalacao & { partida_id: string })[];
  mensalidades: Mensalidade[]; creditos: Credito[]; fin: AtletaFinanceiro | null; stats: Estatistica[]; avisos: Linha[]; eventos: Linha[];
};

const CAMPOS_DADOS: Campo[] = [
  { nome: 'apelido', rotulo: 'Apelido (nome na escalação)' },
  { nome: 'telefone', rotulo: 'Telefone / WhatsApp', tipo: 'tel' },
  { nome: 'email', rotulo: 'E-mail', tipo: 'email' },
  { nome: 'data_nascimento', rotulo: 'Data de nascimento', tipo: 'data', validar: (v) => (v && String(v) > hojeBR() ? 'A data não pode ser futura.' : undefined) },
  { nome: 'pe_dominante', rotulo: 'Pé dominante', tipo: 'selecao', opcoes: OPCOES_PE },
  { nome: 'foto_url', rotulo: 'Foto', tipo: 'imagem', largo: true },
];

export default function Portal() {
  const { supabase, perfil, config, sucesso, erro, info } = useApp();
  const [aba, setAba] = useState<Aba>('inicio');
  const [editando, setEditando] = useState(false);
  const [trocandoPin, setTrocandoPin] = useState(false);
  const [verEscalacao, setVerEscalacao] = useState<Partida | null>(null);
  const [respondendo, setRespondendo] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const alvo = useRef<Mensalidade | null>(null);
  const hoje = hojeBR();

  const { dados, carregando, recarregar, falha } = useDados<Dados>(async () => {
    const [eu, elenco, partidas, esc, mens, fin, cred, avisos, eventos, stats] = await Promise.all([
      supabase.from('meu_atleta').select('*').maybeSingle(),
      supabase.from('atletas_publico').select('*'),
      supabase.from('partidas').select('*').neq('status', 'cancelada').order('data_hora', { ascending: false }).limit(60),
      supabase.from('escalacao').select('*'),
      supabase.from('mensalidades').select('*').order('vencimento', { ascending: false }),
      supabase.from('atleta_financeiro').select('*').maybeSingle(),
      supabase.from('creditos').select('*').order('criado_em', { ascending: false }),
      supabase.from('avisos').select('*').order('fixado', { ascending: false }).order('criado_em', { ascending: false }).limit(10),
      supabase.from('eventos').select('*').gte('data_hora', new Date().toISOString()).order('data_hora').limit(5),
      buscarTudo<Estatistica>((de, ate) => supabase.from('estatisticas_partida').select('*').order('id').range(de, ate)),
    ]);
    const conv = eu.data ? ok(await supabase.from('convocacoes').select('*').eq('atleta_id', eu.data.id)) : [];
    return {
      eu: eu.data, elenco: ok(elenco), partidas: ok(partidas), convocacoes: conv, escalacao: ok(esc), fin: fin.data, creditos: ok(cred).map((c: Credito) => ({ ...c, valor: Number(c.valor) })),
      mensalidades: ok(mens).map((m: Mensalidade) => ({ ...m, valor: Number(m.valor) })), stats, avisos: ok(avisos), eventos: ok(eventos),
    };
  });

  if (falha && !dados) return <FalhaCarregamento mensagem={falha} aoTentar={recarregar} />;
  if (carregando || !dados) return <Carregando />;
  const { eu, elenco, partidas, convocacoes, escalacao, mensalidades, creditos, fin, stats, avisos, eventos } = dados;
  const saldoCredito = creditos.reduce((s, c) => s + c.valor, 0);
  if (!eu) return <Cartao><Vazio titulo="Seu usuário ainda não está vinculado a um atleta" descricao="Peça ao administrador do clube para vincular o seu acesso ao seu cadastro de atleta." /></Cartao>;

  const convDe = (pid: string) => convocacoes.find((c) => c.partida_id === pid);
  const agora = new Date().toISOString();
  const proximas = partidas.filter((p) => (p.status === 'agendada' || p.status === 'adiada') && p.data_hora >= agora).reverse();
  const passadas = partidas.filter((p) => p.status === 'realizada');
  const proxima = proximas[0];
  const situacao = situacaoFinanceira(mensalidades, fin);
  const abertas = mensalidades.filter((m) => m.status === 'pendente');
  const meus = stats.filter((s) => s.atleta_id === eu.id);
  const soma = (k: 'gols' | 'assistencias' | 'amarelos' | 'vermelhos' | 'minutos') => meus.reduce((t, s) => t + Number(s[k] ?? 0), 0);
  const ranking = individuais(stats, elenco);
  const pendentesResposta = proximas.filter((p) => convDe(p.id)?.status === 'aguardando').length;

  const responder = async (p: Partida, status: 'confirmado' | 'ausente') => {
    let obs: string | null = null;
    if (status === 'ausente') {
      obs = window.prompt('Se quiser, informe o motivo da ausência (opcional):');
      if (obs === null) return;
    }
    setRespondendo(p.id);
    const { error } = await supabase.rpc('responder_convocacao', { p_partida: p.id, p_status: status, p_observacao: obs?.trim() || null });
    setRespondendo(null);
    if (error) return erro(error);
    sucesso(status === 'confirmado' ? 'Presença confirmada. Bom jogo!' : 'Ausência registrada. A comissão técnica foi informada.');
    recarregar();
  };

  const anexar = async (f?: File) => {
    const m = alvo.current;
    if (arquivo.current) arquivo.current.value = '';
    if (!f || !m) return;
    try {
      info('Enviando comprovante…');
      const caminho = await enviarArquivo(supabase, 'documentos', `atletas/${eu.id}`, f);
      const { error } = await supabase.rpc('anexar_comprovante', { p_mensalidade: m.id, p_path: caminho });
      if (error) throw error;
      sucesso('Comprovante enviado. O tesoureiro fará a conferência.');
      recarregar();
    } catch (e) {
      erro(e);
    }
  };

  const salvarDados = async (v: Linha) => {
    const { error } = await supabase.rpc('atualizar_meus_dados', {
      p_apelido: v.apelido, p_telefone: v.telefone, p_email: v.email, p_foto_url: v.foto_url, p_pe_dominante: v.pe_dominante, p_data_nascimento: v.data_nascimento,
    });
    if (error) throw error;
    sucesso('Seus dados foram atualizados.');
    await recarregar();
  };

  const trocarPin = async (v: Linha) => {
    const r = await fetch('/api/meu-pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ atual: v.atual ?? '', novo: v.novo }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erro || 'Não foi possível trocar o PIN.');
    sucesso('PIN alterado. Use o novo PIN no próximo acesso.');
  };

  const CartaoJogo = ({ p }: { p: Partida }) => {
    const c = convDe(p.id);
    const podeResponder = c && ['aguardando', 'confirmado', 'ausente'].includes(c.status);
    return (
      <Cartao className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{p.competicao ?? 'Partida'} · {p.mando === 'casa' ? 'Em casa' : 'Fora'}</p>
        <p className="font-display mt-1 text-xl font-bold uppercase text-zinc-900">{p.mando === 'casa' ? `${config.nome_clube} x ${p.adversario}` : `${p.adversario} x ${config.nome_clube}`}</p>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-zinc-600"><CalendarClock className="h-4 w-4 text-zinc-400" /> {dataExtensa(p.data_hora)} às {horaBR(p.data_hora)}</p>
        {p.local && <p className="mt-0.5 flex items-center gap-1.5 text-sm text-zinc-600"><MapPin className="h-4 w-4 text-zinc-400" /> {p.local}</p>}
        {p.observacoes && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-zinc-50 p-2 text-xs text-zinc-600">{p.observacoes}</p>}
        <div className="mt-3 border-t border-zinc-100 pt-3">
          {!c ? <p className="text-sm text-zinc-500">Você não foi convocado para esta partida (até o momento).</p> : (
            <>
              <p className="mb-2 text-sm text-zinc-700">Sua convocação: <Selo tom={TOM_STATUS[c.status]}>{STATUS_CONVOCACAO[c.status]}</Selo></p>
              {podeResponder && (
                <p className="mb-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                  {c.status === 'confirmado' ? 'Presença confirmada: ' : 'Ao confirmar presença, '}taxa de <strong>{moeda(config.valor_jogo)}</strong>, a pagar até <strong>{dataBR(diaBR(p.data_hora))}</strong> (dia do jogo). Se pagar e não puder ir, o valor vira crédito para o próximo jogo.
                </p>
              )}
              {podeResponder && (
                <div className="flex flex-wrap gap-2">
                  <Botao icone={<Check className="h-4 w-4" />} carregando={respondendo === p.id} disabled={c.status === 'confirmado'} onClick={() => responder(p, 'confirmado')}>
                    {c.status === 'confirmado' ? 'Presença confirmada' : 'Confirmar presença'}
                  </Botao>
                  <Botao variante="secundario" icone={<X className="h-4 w-4" />} disabled={c.status === 'ausente' || respondendo === p.id} onClick={() => responder(p, 'ausente')}>Não poderei ir</Botao>
                </div>
              )}
            </>
          )}
          {p.escalacao_publicada && <Botao variante="secundario" tamanho="sm" className="mt-2" onClick={() => setVerEscalacao(p)}>Ver escalação</Botao>}
        </div>
      </Cartao>
    );
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Cartao className="mb-4 overflow-hidden">
        <div className="flex items-center gap-4 bg-secondary p-4 text-white">
          <Avatar nome={eu.nome} foto={eu.foto_url} tamanho={64} />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold uppercase sm:text-2xl">{eu.nome}</h1>
            <p className="text-sm text-white/70">{POSICOES[eu.posicao].label}{eu.numero != null ? ` · Camisa ${eu.numero}` : ''}</p>
            <div className="mt-1"><Selo tom={TOM_STATUS[eu.status]}>{STATUS_ATLETA[eu.status]}</Selo></div>
          </div>
        </div>
      </Cartao>

      <Abas ativa={aba} aoMudar={setAba} abas={[
        { id: 'inicio', rotulo: 'Início' }, { id: 'jogos', rotulo: 'Jogos', contador: pendentesResposta || undefined },
        { id: 'mensalidades', rotulo: 'Pagamentos', contador: abertas.length || undefined }, { id: 'estatisticas', rotulo: 'Estatísticas' }, { id: 'dados', rotulo: 'Meus dados' },
      ]} />

      {aba === 'inicio' && (
        <div className="space-y-4">
          {abertas.some((m) => atrasada(m, hoje)) && situacao === 'inadimplente' && (
            <button onClick={() => setAba('mensalidades')} className="w-full rounded-xl border border-red-200 bg-red-50 p-3 text-left text-sm text-red-800">
              <strong>Você tem pagamento em atraso.</strong> Toque para ver os detalhes e enviar o comprovante.
            </button>
          )}
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-600">Próximo jogo</h2>
          {proxima ? <CartaoJogo p={proxima} /> : <Cartao><Vazio titulo="Nenhum jogo agendado" /></Cartao>}
          {eventos.length > 0 && (
            <Cartao titulo="Próximos eventos">
              <ul className="divide-y divide-zinc-100">
                {eventos.map((e) => <li key={e.id} className="px-4 py-2.5 text-sm"><p className="font-medium text-zinc-900">{e.titulo} <Selo>{TIPOS_EVENTO[e.tipo]}</Selo></p><p className="text-xs text-zinc-500">{dataHoraBR(e.data_hora)}{e.local ? ` · ${e.local}` : ''}</p></li>)}
              </ul>
            </Cartao>
          )}
          <Cartao titulo="Mural de avisos">
            {!avisos.length ? <Vazio titulo="Nenhum aviso no momento" icone={<Megaphone className="h-6 w-6" />} /> : (
              <ul className="divide-y divide-zinc-100">
                {avisos.map((a) => (
                  <li key={a.id} className="px-4 py-3">
                    <p className="flex items-center gap-2 font-semibold text-zinc-900">{a.fixado && <Pin className="h-3.5 w-3.5 text-amber-600" />}{a.titulo}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{a.conteudo}</p>
                    <p className="mt-1 text-xs text-zinc-400">{dataHoraBR(a.criado_em)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>
      )}

      {aba === 'jogos' && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-600">Próximos jogos e convocações</h2>
          {proximas.length ? proximas.map((p) => <CartaoJogo key={p.id} p={p} />) : <Cartao><Vazio titulo="Nenhum jogo agendado" /></Cartao>}
          <Cartao titulo="Jogos realizados">
            <Tabela linhas={passadas} chave={(p) => p.id} vazio={<Vazio titulo="Nenhum jogo realizado ainda" />} colunas={[
              { titulo: 'Data', celula: (p) => dataBR(p.data_hora.slice(0, 10)) },
              { titulo: 'Adversário', celula: (p) => <span className="font-medium">{p.adversario}</span> },
              { titulo: 'Placar', celula: (p) => { const r = resultado(p); return r ? <Selo tom={r === 'V' ? 'verde' : r === 'D' ? 'vermelho' : 'amarelo'}>{p.gols_pro} x {p.gols_contra}</Selo> : '—'; } },
              { titulo: 'Convocação', celula: (p) => { const c = convDe(p.id); return c ? STATUS_CONVOCACAO[c.status] : 'Não convocado'; } },
              { titulo: '', celula: (p) => p.escalacao_publicada && <Botao variante="fantasma" tamanho="sm" onClick={() => setVerEscalacao(p)}>Escalação</Botao> },
            ]} />
          </Cartao>
        </div>
      )}

      {aba === 'mensalidades' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Indicador rotulo="Seu crédito" valor={moeda(saldoCredito)} detalhe="Abatido no próximo jogo" />
            <Indicador rotulo="Sua situação" valor={<Selo tom={TOM_STATUS[situacao]}>{SITUACAO[situacao]}</Selo>} />
            <Indicador rotulo="Em aberto" valor={moeda(abertas.reduce((t, m) => t + devido(m), 0))} detalhe={`${abertas.length} jogo(s)`} />
          </div>
          {saldoCredito > 0 && (
            <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
              Você tem <strong>{moeda(saldoCredito)}</strong> de crédito de jogos que pagou e não foi. Ele é descontado automaticamente quando você confirmar presença no próximo jogo.
            </p>
          )}
          {creditos.length > 0 && (
            <Cartao titulo="Extrato de crédito">
              <ul className="divide-y divide-zinc-100">
                {creditos.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0"><p className="text-zinc-800">{c.descricao}</p><p className="text-xs text-zinc-500">{dataHoraBR(c.criado_em)}</p></div>
                    <span className={c.valor > 0 ? 'shrink-0 font-semibold text-green-700' : 'shrink-0 text-zinc-700'}>{c.valor > 0 ? '+' : '−'} {moeda(Math.abs(c.valor))}</span>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}
          {config.chave_pix && abertas.length > 0 && (
            <Cartao className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div><p className="text-xs uppercase tracking-wide text-zinc-500">Chave Pix do clube</p><p className="break-all font-medium text-zinc-900">{config.chave_pix}</p></div>
              <Botao variante="secundario" tamanho="sm" icone={<Copy className="h-3.5 w-3.5" />} onClick={async () => { await navigator.clipboard.writeText(config.chave_pix!); info('Chave Pix copiada.'); }}>Copiar</Botao>
            </Cartao>
          )}
          <input ref={arquivo} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => anexar(e.target.files?.[0])} />
          <Cartao titulo="Minhas taxas de jogo">
            <Tabela linhas={mensalidades} chave={(m) => m.id} vazio={<Vazio titulo="Nenhuma cobrança lançada" descricao={`Ao confirmar presença em um jogo, a taxa de ${moeda(config.valor_jogo)} aparece aqui. O pagamento deve ser feito até a data do jogo.`} />} colunas={[
              { titulo: 'Referência', celula: (m) => <strong>{refCobranca(m)}</strong> },
              { titulo: 'Pagar até', celula: (m) => dataBR(m.vencimento) },
              { titulo: 'Valor', direita: true, celula: (m) => <>{moeda(m.status === 'pendente' ? devido(m) : m.valor)}{Number(m.abatido) > 0 && <span className="block text-xs text-zinc-500">{moeda(m.abatido)} pago com crédito</span>}</> },
              { titulo: 'Situação', celula: (m) => (
                <div className="flex flex-wrap gap-1">
                  {atrasada(m, hoje) ? <Selo tom="vermelho">Em atraso</Selo> : <Selo tom={TOM_STATUS[m.status]}>{m.status === 'pago' ? `Pago em ${dataBR(m.pago_em)}` : m.status === 'pendente' ? 'Pendente' : m.status === 'isento' ? 'Isento' : m.status === 'creditado' ? 'Virou crédito' : 'Cancelado'}</Selo>}
                  {m.status === 'pago' && m.forma_pagamento && <Selo>{FORMAS[m.forma_pagamento]}</Selo>}
                  {m.status === 'pendente' && m.comprovante_enviado_em && <Selo tom="azul">Comprovante em conferência</Selo>}
                </div>
              ) },
              { titulo: '', celula: (m) => (
                <div className="flex justify-end gap-1.5">
                  {m.comprovante_path?.startsWith(`atletas/${eu.id}/`) && <Botao variante="fantasma" tamanho="sm" icone={<Paperclip className="h-3.5 w-3.5" />} onClick={() => abrirDocumento(supabase, m.comprovante_path!).catch(erro)}>Ver</Botao>}
                  {m.status === 'pendente' && <Botao variante="secundario" tamanho="sm" icone={<Upload className="h-3.5 w-3.5" />} onClick={() => { alvo.current = m; arquivo.current?.click(); }}>{m.comprovante_path ? 'Trocar comprovante' : 'Anexar comprovante'}</Botao>}
                </div>
              ) },
            ]} />
          </Cartao>
        </div>
      )}

      {aba === 'estatisticas' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            <Indicador rotulo="Jogos" valor={meus.length} />
            <Indicador rotulo="Gols" valor={soma('gols')} />
            <Indicador rotulo="Assistências" valor={soma('assistencias')} />
            <Indicador rotulo="Amarelos" valor={soma('amarelos')} />
            <Indicador rotulo="Vermelhos" valor={soma('vermelhos')} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Ranking titulo="Artilharia do time" linhas={ranking} valor={(i) => i.gols} unidade="gols" />
            <Ranking titulo="Assistências" linhas={ranking} valor={(i) => i.assistencias} unidade="assistências" />
          </div>
        </div>
      )}

      {aba === 'dados' && (
        <Cartao titulo="Meus dados" acao={<div className="flex gap-2">
          <Botao variante="secundario" tamanho="sm" icone={<KeyRound className="h-3.5 w-3.5" />} onClick={() => setTrocandoPin(true)}>Trocar PIN</Botao>
          <Botao variante="secundario" tamanho="sm" icone={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditando(true)}>Atualizar</Botao>
        </div>}>
          <dl className="grid grid-cols-2 gap-4 p-4 text-sm">
            {[
              ['Nome completo', eu.nome], ['Apelido', eu.apelido], ['Telefone / WhatsApp', telefoneBR(eu.telefone)], ['E-mail', eu.email],
              ['Nascimento', eu.data_nascimento ? `${dataBR(eu.data_nascimento)} (${idade(eu.data_nascimento)} anos)` : null],
              ['Posição', `${POSICOES[eu.posicao].label}${eu.posicao_secundaria ? ` / ${POSICOES[eu.posicao_secundaria].label}` : ''}`],
              ['Número da camisa', eu.numero], ['Pé dominante', eu.pe_dominante ? PE[eu.pe_dominante] : null], ['No clube desde', eu.data_entrada ? dataBR(eu.data_entrada) : null],
              ['Entrada no portal', `Telefone ${telefoneBR(eu.telefone)} + PIN`],
            ].map(([r, v]) => <div key={String(r)}><dt className="text-xs uppercase tracking-wide text-zinc-500">{r}</dt><dd className="mt-0.5 break-words text-zinc-900">{v || '—'}</dd></div>)}
          </dl>
          <p className="border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500">Nome, posição e número são alterados pela comissão técnica. Se mudar o telefone aqui, use o novo número para entrar no portal.</p>
        </Cartao>
      )}

      <FormModal aberto={trocandoPin} titulo="Trocar PIN" textoBotao="Trocar PIN" aoSalvar={trocarPin} aoFechar={() => setTrocandoPin(false)} campos={[
        { nome: 'atual', rotulo: 'PIN atual', tipo: 'pin', dica: 'Deixe em branco se você nunca recebeu um PIN.' },
        { nome: 'novo', rotulo: 'Novo PIN (4 números)', tipo: 'pin', obrigatorio: true },
        { nome: 'confirma', rotulo: 'Repita o novo PIN', tipo: 'pin', obrigatorio: true, validar: (v, t) => (v === t.novo ? undefined : 'Os PINs não conferem.') },
      ]} />
      <FormModal aberto={editando} titulo="Atualizar meus dados" campos={CAMPOS_DADOS} inicial={eu} aoSalvar={salvarDados} aoFechar={() => setEditando(false)} pasta={`atletas/${eu.id}`} />
      <Modal aberto={!!verEscalacao} titulo={verEscalacao ? `Escalação x ${verEscalacao.adversario}` : ''} aoFechar={() => setVerEscalacao(null)} largo>
        {verEscalacao && <ArteEscalacao partida={verEscalacao} atletas={elenco} escalacao={escalacao.filter((e) => e.partida_id === verEscalacao.id)} somenteLeitura />}
      </Modal>
    </div>
  );
}
