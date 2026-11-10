'use client';

import { ArrowLeft, BellRing, CalendarClock, Clock, FileText, MapPin, MessageCircle, Pencil, Save, Trash2, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArteEscalacao } from '@/components/arte';
import { useApp } from '@/components/contexto';
import { FalhaCarregamento, ok, useDados } from '@/components/crud';
import { EditorEscalacao } from '@/components/escalacao';
import { FormModal } from '@/components/formulario';
import { Abas, Avatar, Botao, BotaoIcone, Carregando, Cartao, Selo, TOM_STATUS, Tabela, Vazio, cx, estiloCampo } from '@/components/ui';
import { CAMPOS_PARTIDA, comTemporada, resultado } from '@/lib/campos';
import { OPCOES_CONVOCACAO, POSICOES, STATUS_CONVOCACAO, STATUS_PARTIDA } from '@/lib/constants';
import { exportarPDF } from '@/lib/export';
import { dataBR, dataExtensa, dataHoraBR, diaBR, horaBR, moeda, nomeCurto } from '@/lib/format';
import type { Atleta, Convocacao, Estatistica, ItemEscalacao, Linha, Partida, StatusConvocacao, Substituicao } from '@/lib/types';
import { MSG } from '@/lib/whatsapp';

type Aba = 'convocacao' | 'escalacao' | 'arte' | 'resultado';
type Dados = { partida: Partida; atletas: Atleta[]; convocacoes: Convocacao[]; escalacao: ItemEscalacao[]; subs: Substituicao[]; stats: Estatistica[] };
type LinhaStat = { jogou: boolean; titular: boolean; minutos: string; gols: number; assistencias: number; amarelos: number; vermelhos: number };

export default function DetalhePartida() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { supabase, config, sucesso, erro, confirmar, whats } = useApp();
  const [aba, setAba] = useState<Aba>('convocacao');
  const [editando, setEditando] = useState(false);
  const [adicionar, setAdicionar] = useState('');
  const [versao, setVersao] = useState(0);

  const { dados, carregando, recarregar, falha } = useDados<Dados | null>(async () => {
    const { data: partida } = await supabase.from('partidas').select('*').eq('id', id).maybeSingle();
    if (!partida) return null;
    const [a, c, e, s, st] = await Promise.all([
      supabase.from('atletas').select('*').order('nome'),
      supabase.from('convocacoes').select('*').eq('partida_id', id),
      supabase.from('escalacao').select('*').eq('partida_id', id),
      supabase.from('substituicoes_planejadas').select('sai_id, entra_id, minuto, observacao').eq('partida_id', id),
      supabase.from('estatisticas_partida').select('*').eq('partida_id', id),
    ]);
    return { partida, atletas: ok(a), convocacoes: ok(c), escalacao: ok(e), subs: ok(s), stats: ok(st) };
  }, [id]);

  // ---- Resultado e estatísticas (estado do formulário)
  const [placar, setPlacar] = useState({ pro: '', contra: '' });
  const [linhas, setLinhas] = useState<Record<string, LinhaStat>>({});
  const [salvandoRes, setSalvandoRes] = useState(false);
  useEffect(() => {
    if (!dados) return;
    const { partida: p, stats, escalacao, convocacoes } = dados;
    setPlacar({ pro: p.gols_pro?.toString() ?? '', contra: p.gols_contra?.toString() ?? '' });
    const mapa: Record<string, LinhaStat> = {};
    const ids = new Set([...escalacao.map((e) => e.atleta_id), ...convocacoes.filter((c) => c.status === 'confirmado').map((c) => c.atleta_id), ...stats.map((s) => s.atleta_id)]);
    ids.forEach((aid) => {
      const s = stats.find((x) => x.atleta_id === aid);
      const titular = escalacao.some((e) => e.atleta_id === aid && e.tipo === 'titular');
      mapa[aid] = s
        ? { jogou: true, titular: s.titular, minutos: s.minutos?.toString() ?? '', gols: s.gols, assistencias: s.assistencias, amarelos: s.amarelos, vermelhos: s.vermelhos }
        : { jogou: stats.length === 0 && titular, titular, minutos: '', gols: 0, assistencias: 0, amarelos: 0, vermelhos: 0 };
    });
    setLinhas(mapa);
  }, [dados]);

  if (carregando) return <Carregando />;
  if (falha) return <FalhaCarregamento mensagem={falha} aoTentar={recarregar} />;
  if (!dados) return <Cartao><Vazio titulo="Partida não encontrada"><Link href="/partidas" className="text-primary hover:underline">Voltar para as partidas</Link></Vazio></Cartao>;
  const { partida: p, atletas, convocacoes, escalacao, subs } = dados;
  const porId = new Map(atletas.map((a) => [a.id, a]));
  const convocados = new Set(convocacoes.map((c) => c.atleta_id));
  const foraDaLista = atletas.filter((a) => !convocados.has(a.id) && a.status !== 'inativo');
  const conta = (s: StatusConvocacao) => convocacoes.filter((c) => c.status === s).length;
  const r = resultado(p);
  const linkPortal = typeof window !== 'undefined' ? `${window.location.origin}/portal` : '/portal';
  const atualizar = async () => { await recarregar(); setVersao((v) => v + 1); };

  const statusInicial = (a: Atleta): StatusConvocacao => (a.status === 'lesionado' ? 'lesionado' : a.status === 'suspenso' ? 'suspenso' : 'aguardando');
  const convocar = async (lista: Atleta[]) => {
    if (!lista.length) return;
    const { error } = await supabase.from('convocacoes').insert(lista.map((a) => ({ partida_id: p.id, atleta_id: a.id, status: statusInicial(a) })));
    if (error) return erro(error);
    sucesso(`${lista.length} atleta(s) convocado(s). Envie a convocação pelo WhatsApp.`);
    setAdicionar('');
    atualizar();
  };
  const mudarStatus = async (c: Convocacao, status: string) => {
    const { error } = await supabase.from('convocacoes').update({ status, respondido_em: new Date().toISOString() }).eq('id', c.id);
    if (error) return erro(error);
    atualizar();
  };
  const desconvocar = async (c: Convocacao) => {
    const { error } = await supabase.from('convocacoes').delete().eq('id', c.id);
    if (error) return erro(error);
    await supabase.from('escalacao').delete().eq('partida_id', p.id).eq('atleta_id', c.atleta_id);
    atualizar();
  };

  const salvarPartida = async (v: Linha) => {
    ok(await supabase.from('partidas').update(comTemporada(v)).eq('id', p.id).select('id'));
    const mudouHorario = v.data_hora !== new Date(p.data_hora).toISOString() || (v.local ?? null) !== p.local;
    sucesso(mudouHorario && convocacoes.length ? 'Partida atualizada. Avise os atletas sobre a alteração de horário/local.' : 'Partida atualizada.');
    atualizar();
  };
  const excluirPartida = async () => {
    if (!(await confirmar({ titulo: 'Excluir partida', perigo: true, textoConfirmar: 'Excluir', mensagem: 'A partida, a convocação, a escalação e as estatísticas deste jogo serão apagadas definitivamente.' }))) return;
    const { error } = await supabase.from('partidas').delete().eq('id', p.id);
    if (error) return erro(error);
    sucesso('Partida excluída.');
    router.replace('/partidas');
  };

  const salvarResultado = async () => {
    const [pro, contra] = [Number(placar.pro), Number(placar.contra)];
    if (placar.pro === '' || placar.contra === '' || pro < 0 || contra < 0 || !Number.isInteger(pro) || !Number.isInteger(contra)) return erro('Informe o placar com números inteiros.');
    const jogaram = Object.entries(linhas).filter(([, l]) => l.jogou);
    const gols = jogaram.reduce((s, [, l]) => s + l.gols, 0);
    if (gols > pro) return erro(`A soma dos gols dos atletas (${gols}) é maior que os gols marcados pelo time (${pro}).`);
    setSalvandoRes(true);
    try {
      ok(await supabase.from('partidas').update({ gols_pro: pro, gols_contra: contra, status: 'realizada' }).eq('id', p.id).select('id'));
      const ids = jogaram.map(([aid]) => aid);
      const apagar = supabase.from('estatisticas_partida').delete().eq('partida_id', p.id);
      const { error } = await (ids.length ? apagar.not('atleta_id', 'in', `(${ids.join(',')})`) : apagar);
      if (error) throw error;
      if (ids.length) {
        ok(await supabase.from('estatisticas_partida').upsert(jogaram.map(([aid, l]) => ({
          partida_id: p.id, atleta_id: aid, titular: l.titular, minutos: l.minutos === '' ? null : Number(l.minutos),
          gols: l.gols, assistencias: l.assistencias, amarelos: l.amarelos, vermelhos: l.vermelhos,
        })), { onConflict: 'partida_id,atleta_id' }).select('id'));
      }
      sucesso('Resultado e estatísticas salvos.');
      atualizar();
    } catch (e) {
      erro(e);
    } finally {
      setSalvandoRes(false);
    }
  };
  const mudarLinha = (aid: string, campo: Partial<LinhaStat>) => setLinhas((l) => ({ ...l, [aid]: { ...l[aid], ...campo } }));
  const numero = (aid: string, campo: 'gols' | 'assistencias' | 'amarelos' | 'vermelhos', max: number) => (
    <input type="number" min={0} max={max} disabled={!linhas[aid].jogou} className={`${estiloCampo} !w-16 !px-2 !py-1 text-center`} value={linhas[aid][campo]}
      onChange={(e) => mudarLinha(aid, { [campo]: Math.min(max, Math.max(0, Math.trunc(Number(e.target.value) || 0))) })} aria-label={campo} />
  );

  const ordenadas = [...convocacoes].sort((a, b) => (porId.get(a.atleta_id)?.nome ?? '').localeCompare(porId.get(b.atleta_id)?.nome ?? ''));
  const pdfConvocados = () => exportarPDF('Lista de convocados', {
    colunas: ['Nº', 'Atleta', 'Posição', 'Resposta'],
    linhas: ordenadas.map((c) => { const a = porId.get(c.atleta_id); return [a?.numero ?? '', a?.nome ?? '', a ? POSICOES[a.posicao].label : '', STATUS_CONVOCACAO[c.status]]; }),
  }, config, `x ${p.adversario} — ${dataHoraBR(p.data_hora)}`);

  return (
    <>
      <Link href="/partidas" className="mb-3 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"><ArrowLeft className="h-4 w-4" /> Partidas</Link>
      <Cartao className="mb-4 overflow-hidden">
        <div className="bg-secondary p-5 text-white">
          <div className="flex flex-wrap items-center gap-2">
            <Selo tom={TOM_STATUS[p.status]}>{STATUS_PARTIDA[p.status]}</Selo>
            <span className="text-xs uppercase tracking-wide text-white/60">{p.competicao ?? 'Partida'} · {p.mando === 'casa' ? 'Mandante' : 'Visitante'} · Temporada {p.temporada}</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold uppercase sm:text-4xl">
            {p.mando === 'casa' ? config.nome_clube : p.adversario}
            <span className="mx-3 text-accent">{r ? `${p.mando === 'casa' ? p.gols_pro : p.gols_contra} x ${p.mando === 'casa' ? p.gols_contra : p.gols_pro}` : 'x'}</span>
            {p.mando === 'casa' ? p.adversario : config.nome_clube}
          </h1>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/80">
            <span className="flex items-center gap-1.5"><CalendarClock className="h-4 w-4" /> {dataExtensa(p.data_hora)} às {horaBR(p.data_hora)}</span>
            {p.local && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {p.local}</span>}
          </div>
          {p.observacoes && <p className="mt-2 whitespace-pre-wrap text-sm text-white/60">{p.observacoes}</p>}
        </div>
        <div className="flex flex-wrap gap-2 p-3">
          <Botao variante="whats" tamanho="sm" icone={<BellRing className="h-3.5 w-3.5" />} onClick={() => whats({ msg: MSG.lembrete(p, config) })}>Lembrete de jogo</Botao>
          <Botao variante="whats" tamanho="sm" icone={<Clock className="h-3.5 w-3.5" />} onClick={() => whats({ msg: MSG.alteracao(p, config) })}>Aviso de alteração de horário</Botao>
          <span className="flex-1" />
          <Botao variante="secundario" tamanho="sm" icone={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditando(true)}>Editar</Botao>
          <Botao variante="perigo" tamanho="sm" icone={<Trash2 className="h-3.5 w-3.5" />} onClick={excluirPartida}>Excluir</Botao>
        </div>
      </Cartao>

      <Abas ativa={aba} aoMudar={setAba} abas={[
        { id: 'convocacao', rotulo: 'Convocação', contador: convocacoes.length },
        { id: 'escalacao', rotulo: 'Escalação' },
        { id: 'arte', rotulo: 'Arte da escalação' },
        { id: 'resultado', rotulo: 'Resultado e estatísticas' },
      ]} />

      {aba === 'convocacao' && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(Object.keys(STATUS_CONVOCACAO) as StatusConvocacao[]).map((s) => (
              <div key={s} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                <p className="font-display text-xl font-bold tabular-nums">{conta(s)}</p>
                <p className="text-xs text-zinc-500">{STATUS_CONVOCACAO[s]}</p>
              </div>
            ))}
          </div>
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Taxa deste jogo: <strong>{moeda(config.valor_jogo)}</strong> por atleta confirmado, a pagar até <strong>{dataBR(diaBR(p.data_hora))}</strong>.
            {' '}{conta('confirmado')} confirmado(s) = <strong>{moeda(conta('confirmado') * config.valor_jogo)}</strong> previstos. <Link href="/mensalidades" className="font-medium underline">Ver pagamentos</Link>
            <span className="mt-1 block text-xs">Confirmou, pagou e não compareceu? Marque <strong>Não poderá comparecer</strong> abaixo: o valor pago vira crédito para o próximo jogo.</span>
          </p>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Botao icone={<Users className="h-4 w-4" />} disabled={!foraDaLista.length} onClick={() => convocar(foraDaLista.filter((a) => a.status !== 'afastado'))}>
              {convocacoes.length ? 'Convocar restante do elenco' : 'Convocar todo o elenco'}
            </Botao>
            <select className={`${estiloCampo} !w-auto`} value={adicionar} onChange={(e) => setAdicionar(e.target.value)} aria-label="Adicionar atleta à convocação">
              <option value="">Adicionar atleta…</option>
              {foraDaLista.map((a) => <option key={a.id} value={a.id}>{a.nome} ({POSICOES[a.posicao].sigla})</option>)}
            </select>
            {adicionar && <Botao variante="secundario" icone={<UserPlus className="h-4 w-4" />} onClick={() => convocar([porId.get(adicionar)!])}>Convocar</Botao>}
            <div className="ml-auto flex flex-wrap gap-2">
              <Botao variante="secundario" icone={<FileText className="h-4 w-4" />} disabled={!convocacoes.length} onClick={pdfConvocados}>PDF</Botao>
              <Botao variante="whats" icone={<MessageCircle className="h-4 w-4" />} disabled={!convocacoes.length} onClick={() => whats({ msg: MSG.convocacao(p, config, linkPortal) })}>Enviar convocação no grupo</Botao>
            </div>
          </div>
          <Cartao>
            <Tabela linhas={ordenadas} chave={(c) => c.id} vazio={<Vazio titulo="Nenhum atleta convocado" descricao="Convoque o elenco para que os atletas confirmem presença pelo portal." icone={<Users className="h-6 w-6" />} />} colunas={[
              { titulo: 'Atleta', celula: (c) => { const a = porId.get(c.atleta_id); return a ? <div className="flex items-center gap-3"><Avatar nome={a.nome} foto={a.foto_url} numero={a.numero} tamanho={34} /><div><p className="font-medium text-zinc-900">{a.nome}</p><p className="text-xs text-zinc-500">{POSICOES[a.posicao].label}</p></div></div> : '—'; } },
              { titulo: 'Resposta', celula: (c) => <div><Selo tom={TOM_STATUS[c.status]}>{STATUS_CONVOCACAO[c.status]}</Selo>{c.observacao && <p className="mt-0.5 max-w-52 truncate text-xs text-zinc-500" title={c.observacao}>{c.observacao}</p>}</div> },
              { titulo: 'Respondido em', celula: (c) => dataHoraBR(c.respondido_em) },
              { titulo: 'Alterar', celula: (c) => (
                <select className={`${estiloCampo} !w-auto !py-1.5`} value={c.status} onChange={(e) => mudarStatus(c, e.target.value)} aria-label="Alterar resposta">
                  {OPCOES_CONVOCACAO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) },
              { titulo: '', celula: (c) => { const a = porId.get(c.atleta_id); return (
                <div className="flex justify-end gap-0.5">
                  {a?.telefone && <BotaoIcone titulo="Enviar convocação individual" onClick={() => whats({ tel: a.telefone, nome: a.nome, msg: MSG.convocacao(p, config, linkPortal, nomeCurto(a)) })}><MessageCircle className="h-4 w-4" /></BotaoIcone>}
                  <BotaoIcone titulo="Remover da convocação" onClick={() => desconvocar(c)} className="hover:!bg-red-50 hover:!text-red-600"><Trash2 className="h-4 w-4" /></BotaoIcone>
                </div>
              ); } },
            ]} />
          </Cartao>
        </>
      )}

      {aba === 'escalacao' && <EditorEscalacao key={versao} partida={p} atletas={atletas} convocacoes={convocacoes} escalacao={escalacao} subs={subs} aoSalvar={recarregar} aoGerarArte={() => setAba('arte')} />}

      {aba === 'arte' && <ArteEscalacao partida={p} atletas={atletas} escalacao={escalacao} subs={subs} />}

      {aba === 'resultado' && (
        <div className="space-y-4">
          <Cartao titulo="Placar final">
            <div className="flex flex-wrap items-end justify-center gap-4 p-5">
              <label className="text-center"><span className="mb-1 block text-xs font-medium uppercase text-zinc-600">{config.nome_clube}</span>
                <input type="number" min={0} className={cx(estiloCampo, 'font-display !w-24 text-center !text-3xl font-bold')} value={placar.pro} onChange={(e) => setPlacar({ ...placar, pro: e.target.value })} /></label>
              <span className="font-display pb-3 text-2xl font-bold text-zinc-400">x</span>
              <label className="text-center"><span className="mb-1 block text-xs font-medium uppercase text-zinc-600">{p.adversario}</span>
                <input type="number" min={0} className={cx(estiloCampo, 'font-display !w-24 text-center !text-3xl font-bold')} value={placar.contra} onChange={(e) => setPlacar({ ...placar, contra: e.target.value })} /></label>
            </div>
          </Cartao>
          <Cartao titulo="Estatísticas individuais">
            {!Object.keys(linhas).length ? <Vazio titulo="Nenhum atleta para lançar" descricao="Defina a escalação ou confirme presenças para lançar as estatísticas individuais." /> : (
              <Tabela linhas={Object.keys(linhas).filter((aid) => porId.has(aid)).sort((a, b) => Number(linhas[b].titular) - Number(linhas[a].titular) || porId.get(a)!.nome.localeCompare(porId.get(b)!.nome))} chave={(aid) => aid} colunas={[
                { titulo: 'Jogou', celula: (aid) => <input type="checkbox" className="h-4 w-4 accent-[var(--cor-primaria)]" checked={linhas[aid].jogou} onChange={(e) => mudarLinha(aid, { jogou: e.target.checked })} aria-label={`${porId.get(aid)!.nome} jogou`} /> },
                { titulo: 'Atleta', celula: (aid) => <span className={cx('font-medium', linhas[aid].jogou ? 'text-zinc-900' : 'text-zinc-400')}>{porId.get(aid)!.nome}</span> },
                { titulo: 'Titular', celula: (aid) => <input type="checkbox" className="h-4 w-4 accent-[var(--cor-primaria)]" disabled={!linhas[aid].jogou} checked={linhas[aid].titular} onChange={(e) => mudarLinha(aid, { titular: e.target.checked })} aria-label="Titular" /> },
                { titulo: 'Minutos', celula: (aid) => <input type="number" min={0} max={150} disabled={!linhas[aid].jogou} className={`${estiloCampo} !w-20 !px-2 !py-1 text-center`} value={linhas[aid].minutos} onChange={(e) => mudarLinha(aid, { minutos: e.target.value })} aria-label="Minutos jogados" /> },
                { titulo: 'Gols', celula: (aid) => numero(aid, 'gols', 30) },
                { titulo: 'Assist.', celula: (aid) => numero(aid, 'assistencias', 30) },
                { titulo: 'Amarelos', celula: (aid) => numero(aid, 'amarelos', 2) },
                { titulo: 'Vermelhos', celula: (aid) => numero(aid, 'vermelhos', 1) },
              ]} />
            )}
            <div className="flex justify-end border-t border-zinc-100 p-3">
              <Botao icone={<Save className="h-4 w-4" />} carregando={salvandoRes} onClick={salvarResultado}>Salvar resultado</Botao>
            </div>
          </Cartao>
        </div>
      )}

      <FormModal aberto={editando} titulo="Editar partida" campos={CAMPOS_PARTIDA} inicial={p} aoSalvar={salvarPartida} aoFechar={() => setEditando(false)} />
    </>
  );
}
