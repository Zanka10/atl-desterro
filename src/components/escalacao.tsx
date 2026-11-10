'use client';

import { DndContext, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { Eraser, ImageIcon, Plus, Save, Trash2, Wand2 } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { FORMACAO_PERSONALIZADA, FORMACOES, NOMES_FORMACOES, POSICOES, STATUS_ATLETA, STATUS_CONVOCACAO, type Slot } from '@/lib/constants';
import { nomeCurto } from '@/lib/format';
import type { Atleta, Convocacao, ItemEscalacao, Partida, Substituicao } from '@/lib/types';
import { useApp } from './contexto';
import { Avatar, Botao, BotaoIcone, Cartao, Selo, TOM_STATUS, Vazio, cx, estiloCampo } from './ui';

type SlotAtivo = Slot & { atleta: string | null };
type Destino = { tipo: 'slot'; i: number } | { tipo: 'banco' } | { tipo: 'fora' };

const limitar = (v: number) => Math.min(96, Math.max(4, v));

function Arrastavel({ id, children, desativado }: { id: string; children: ReactNode; desativado?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled: desativado });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, zIndex: isDragging ? 50 : undefined, touchAction: 'manipulation' }}
      className={cx(isDragging && 'opacity-80', !desativado && 'cursor-grab active:cursor-grabbing')}>
      {children}
    </div>
  );
}

function Soltavel({ id, children, className }: { id: string; children: ReactNode; className?: string | ((sobre: boolean) => string) }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={typeof className === 'function' ? className(isOver) : className}>{children}</div>;
}

export function EditorEscalacao({ partida, atletas, convocacoes, escalacao, subs: subsIniciais, aoSalvar, aoGerarArte }: {
  partida: Partida; atletas: Atleta[]; convocacoes: Convocacao[]; escalacao: ItemEscalacao[]; subs: Substituicao[];
  aoSalvar: () => Promise<void>; aoGerarArte: () => void;
}) {
  const { supabase, pode, sucesso, erro, info, confirmar } = useApp();
  const campoRef = useRef<HTMLDivElement>(null);
  const sensores = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }));

  const [formacao, setFormacao] = useState(partida.formacao);
  const [slots, setSlots] = useState<SlotAtivo[]>(() => {
    const base = FORMACOES[partida.formacao] ?? FORMACOES['4-4-2'];
    return base.map((s, i) => {
      const item = escalacao.find((e) => e.tipo === 'titular' && e.slot === i);
      return item ? { x: Number(item.x ?? s.x), y: Number(item.y ?? s.y), funcao: (item.funcao as Slot['funcao']) ?? s.funcao, atleta: item.atleta_id } : { ...s, atleta: null };
    });
  });
  const [banco, setBanco] = useState<string[]>(() => escalacao.filter((e) => e.tipo === 'reserva').sort((a, b) => a.slot - b.slot).map((e) => e.atleta_id));
  const [capitao, setCapitao] = useState<string | null>(partida.capitao_id);
  const [subs, setSubs] = useState<Substituicao[]>(subsIniciais);
  const [publicada, setPublicada] = useState(partida.escalacao_publicada);
  const [autorizados, setAutorizados] = useState<Set<string>>(() => new Set(escalacao.filter((e) => e.autorizado_por).map((e) => e.atleta_id)));
  const [sel, setSel] = useState<string | null>(null);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const porId = useMemo(() => new Map(atletas.map((a) => [a.id, a])), [atletas]);
  const conv = useMemo(() => new Map(convocacoes.map((c) => [c.atleta_id, c])), [convocacoes]);
  const personalizada = formacao === FORMACAO_PERSONALIZADA;
  const titulares = slots.map((s) => s.atleta).filter(Boolean) as string[];
  const usados = new Set([...titulares, ...banco]);

  /** Motivo pelo qual o atleta não pode ser escalado (ou null se está disponível). */
  const bloqueio = (id: string): string | null => {
    const a = porId.get(id);
    const c = conv.get(id);
    if (a && a.status !== 'ativo') return STATUS_ATLETA[a.status].toLowerCase();
    if (c && ['ausente', 'lesionado', 'suspenso'].includes(c.status)) return STATUS_CONVOCACAO[c.status].toLowerCase();
    return null;
  };

  const ordem = { confirmado: 0, aguardando: 1, ausente: 2, lesionado: 3, suspenso: 4 };
  const disponiveis = convocacoes.map((c) => c.atleta_id).filter((id) => porId.has(id) && !usados.has(id))
    .sort((a, b) => (ordem[conv.get(a)!.status] - ordem[conv.get(b)!.status]) || porId.get(a)!.nome.localeCompare(porId.get(b)!.nome));

  const colocar = async (id: string, destino: Destino) => {
    setSel(null);
    const motivo = bloqueio(id);
    if (destino.tipo !== 'fora' && motivo && !autorizados.has(id)) {
      const nome = porId.get(id)?.nome;
      if (!pode('admin', 'diretoria')) return erro(`${nome} está indisponível (${motivo}). Somente a administração pode autorizar essa escalação.`);
      if (!(await confirmar({ titulo: 'Autorização administrativa', textoConfirmar: 'Autorizar e escalar',
        mensagem: <><strong>{nome}</strong> está indisponível ({motivo}). Deseja autorizar a escalação mesmo assim? A autorização ficará registrada em seu nome.</> }))) return;
      setAutorizados((s) => new Set(s).add(id));
    }
    const origem = slots.findIndex((s) => s.atleta === id);
    const novos = slots.map((s) => (s.atleta === id ? { ...s, atleta: null } : s));
    let novoBanco = banco.filter((b) => b !== id);
    if (destino.tipo === 'slot') {
      const ocupante = novos[destino.i].atleta;
      novos[destino.i] = { ...novos[destino.i], atleta: id };
      if (ocupante && ocupante !== id) {
        if (origem >= 0) novos[origem] = { ...novos[origem], atleta: ocupante };
        else if (banco.includes(id)) novoBanco = [...novoBanco, ocupante];
      }
    } else if (destino.tipo === 'banco') novoBanco = [...novoBanco, id];
    setSlots(novos);
    setBanco(novoBanco);
    const emCampo = new Set(novos.map((s) => s.atleta));
    if (capitao && !emCampo.has(capitao)) setCapitao(null);
    setSubs((l) => l.filter((s) => emCampo.has(s.sai_id) && novoBanco.includes(s.entra_id)));
    setSujo(true);
  };

  const aoSoltar = (e: DragEndEvent) => {
    const [tipo, id] = String(e.active.id).split(':');
    const alvo = e.over ? String(e.over.id) : null;
    if (tipo === 's') {
      // formação personalizada: move a posição no campo
      const el = campoRef.current;
      if (!el) return;
      const i = Number(id);
      setSlots((l) => l.map((s, k) => (k === i ? { ...s, x: limitar(s.x + (e.delta.x / el.clientWidth) * 100), y: limitar(s.y + (e.delta.y / el.clientHeight) * 100) } : s)));
      setSujo(true);
      return;
    }
    if (!alvo) return;
    if (alvo.startsWith('slot:')) colocar(id, { tipo: 'slot', i: Number(alvo.slice(5)) });
    else if (alvo === 'banco') colocar(id, { tipo: 'banco' });
    else if (alvo === 'fora') colocar(id, { tipo: 'fora' });
  };

  const mudarFormacao = (nova: string) => {
    setFormacao(nova);
    const base = FORMACOES[nova];
    if (base) setSlots((l) => l.map((s, i) => ({ ...base[i], atleta: s.atleta })));
    setSujo(true);
  };

  /** Preenche o time com os atletas confirmados e disponíveis, respeitando as posições. */
  const escalarAutomaticamente = () => {
    const aptos = convocacoes.filter((c) => c.status === 'confirmado' && !bloqueio(c.atleta_id)).map((c) => porId.get(c.atleta_id)).filter(Boolean) as Atleta[];
    if (!aptos.length) return info('Nenhum atleta confirmado e disponível para escalar.');
    const livres = new Set(aptos.map((a) => a.id));
    const novos = slots.map((s) => ({ ...s, atleta: null as string | null }));
    for (const criterio of ['posicao', 'posicao_secundaria'] as const) {
      novos.forEach((s) => {
        if (s.atleta) return;
        const a = aptos.find((x) => livres.has(x.id) && x[criterio] === s.funcao);
        if (a) { s.atleta = a.id; livres.delete(a.id); }
      });
    }
    setSlots(novos);
    setBanco([...livres]);
    setCapitao(null);
    setSubs([]);
    setSujo(true);
    const vagas = novos.filter((s) => !s.atleta).length;
    if (vagas) info(`Time montado com os confirmados. ${vagas} posição(ões) sem atleta da função — complete manualmente.`);
    else sucesso('Time montado automaticamente com os atletas confirmados.');
  };

  const limpar = () => { setSlots((l) => l.map((s) => ({ ...s, atleta: null }))); setBanco([]); setCapitao(null); setSubs([]); setSujo(true); };

  const salvar = async () => {
    if (subs.some((s) => !s.sai_id || !s.entra_id)) return erro('Complete ou remova as substituições planejadas em branco.');
    setSalvando(true);
    const itens = [
      ...slots.map((s, i) => ({ s, i })).filter(({ s }) => s.atleta).map(({ s, i }) => ({ atleta_id: s.atleta, tipo: 'titular', slot: i, x: Math.round(s.x * 100) / 100, y: Math.round(s.y * 100) / 100, funcao: s.funcao })),
      ...banco.map((id, i) => ({ atleta_id: id, tipo: 'reserva', slot: i, x: null, y: null, funcao: null })),
    ];
    const { error } = await supabase.rpc('salvar_escalacao', { p_partida: partida.id, p_formacao: formacao, p_capitao: capitao, p_itens: itens, p_subs: subs, p_publicada: publicada });
    setSalvando(false);
    if (error) return erro(error);
    setSujo(false);
    sucesso(publicada ? 'Escalação salva e publicada para os atletas.' : 'Escalação salva (ainda não publicada para os atletas).');
    await aoSalvar();
  };

  const ficha = (id: string, compacta?: boolean) => {
    const a = porId.get(id);
    if (!a) return null;
    const c = conv.get(id);
    const motivo = bloqueio(id);
    return (
      <Arrastavel id={`a:${id}`}>
        <div onClick={(e) => { e.stopPropagation(); setSel(sel === id ? null : id); }}
          className={cx('flex items-center gap-2 rounded-lg border bg-white px-2 py-1.5 text-left transition', sel === id ? 'border-primary ring-2 ring-primary/30' : 'border-zinc-200', motivo && 'opacity-60')}>
          <Avatar nome={a.nome} foto={a.foto_url} numero={a.numero} tamanho={32} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-zinc-900">{nomeCurto(a)}</p>
            <p className="truncate text-[11px] text-zinc-500">{POSICOES[a.posicao].sigla}{a.posicao_secundaria ? `/${POSICOES[a.posicao_secundaria].sigla}` : ''}{motivo ? ` · ${motivo}` : ''}</p>
          </div>
          {!compacta && c && <Selo tom={TOM_STATUS[c.status]}>{c.status === 'confirmado' ? 'Confirmado' : c.status === 'aguardando' ? 'Aguardando' : 'Indisponível'}</Selo>}
        </div>
      </Arrastavel>
    );
  };

  if (!convocacoes.length) return <Cartao><Vazio titulo="Convoque os atletas primeiro" descricao="A escalação é montada a partir da lista de convocados desta partida. Acesse a aba Convocação." /></Cartao>;

  return (
    <DndContext sensors={sensores} onDragEnd={aoSoltar}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className={`${estiloCampo} !w-auto font-semibold`} value={formacao} onChange={(e) => mudarFormacao(e.target.value)} aria-label="Formação tática">
          {NOMES_FORMACOES.map((f) => <option key={f}>{f}</option>)}
        </select>
        <Botao variante="secundario" icone={<Wand2 className="h-4 w-4" />} onClick={escalarAutomaticamente}>Escalar confirmados</Botao>
        <Botao variante="fantasma" icone={<Eraser className="h-4 w-4" />} onClick={limpar}>Limpar</Botao>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" className="h-4 w-4 accent-[var(--cor-primaria)]" checked={publicada} onChange={(e) => { setPublicada(e.target.checked); setSujo(true); }} />
            Publicar para os atletas
          </label>
          <Botao icone={<Save className="h-4 w-4" />} carregando={salvando} onClick={salvar}>{sujo ? 'Salvar escalação' : 'Escalação salva'}</Botao>
          <Botao variante="secundario" icone={<ImageIcon className="h-4 w-4" />} disabled={sujo || titulares.length === 0} title={sujo ? 'Salve a escalação antes de gerar a arte' : undefined} onClick={aoGerarArte}>GERAR ARTE DA ESCALAÇÃO</Botao>
        </div>
      </div>
      <p className="mb-3 text-xs text-zinc-500">
        Arraste os atletas para o campo ou para o banco (no celular, segure o atleta por um instante antes de arrastar) — ou toque em um atleta e depois na posição desejada.
        {personalizada && ' Na formação personalizada, arraste as posições do campo para reposicioná-las.'}
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,460px)_1fr]">
        <div>
          <div ref={campoRef} className="campo relative mx-auto aspect-[7/10] w-full max-w-[460px] select-none overflow-hidden rounded-2xl shadow-inner">
            <div className="pointer-events-none absolute inset-3 rounded border-2 border-white/50" />
            <div className="pointer-events-none absolute inset-x-3 top-1/2 border-t-2 border-white/50" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[18%] w-[26%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/50" />
            <div className="pointer-events-none absolute left-1/2 top-3 h-[14%] w-[50%] -translate-x-1/2 border-2 border-t-0 border-white/50" />
            <div className="pointer-events-none absolute bottom-3 left-1/2 h-[14%] w-[50%] -translate-x-1/2 border-2 border-b-0 border-white/50" />
            {slots.map((s, i) => {
              const a = s.atleta ? porId.get(s.atleta) : null;
              const marcador = (
                <div onClick={() => (sel && sel !== s.atleta ? colocar(sel, { tipo: 'slot', i }) : a ? setSel(sel === a.id ? null : a.id) : undefined)} className="flex w-[68px] flex-col items-center">
                  {a ? (
                    <span className={cx('relative rounded-full ring-2', sel === a.id ? 'ring-accent' : 'ring-white')}>
                      <Avatar nome={a.nome} foto={a.foto_url} numero={a.numero} tamanho={44} />
                      {capitao === a.id && <span className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-yellow-400 text-[10px] font-bold text-black">C</span>}
                    </span>
                  ) : (
                    <span className={cx('flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed text-[10px] font-bold', sel ? 'border-accent bg-accent/30 text-white' : 'border-white/70 bg-black/15 text-white/90')}>
                      {POSICOES[s.funcao].sigla}
                    </span>
                  )}
                  <span className="mt-0.5 max-w-full truncate rounded bg-black/70 px-1.5 py-px text-[10px] font-semibold uppercase text-white">{a ? nomeCurto(a) : '—'}</span>
                </div>
              );
              return (
                <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
                  <Soltavel id={`slot:${i}`} className={(sobre) => cx('rounded-xl p-0.5 transition', sobre && 'bg-white/30')}>
                    {personalizada ? <Arrastavel id={`s:${i}`}>{marcador}</Arrastavel> : a ? <Arrastavel id={`a:${a.id}`}>{marcador}</Arrastavel> : marcador}
                  </Soltavel>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-center text-xs text-zinc-500">{titulares.length}/11 titulares · {banco.length} reserva(s)</p>
        </div>

        <div className="space-y-4">
          <Cartao titulo={`Banco de reservas (${banco.length})`}>
            <Soltavel id="banco" className={(sobre) => cx('min-h-16 p-3 transition', sobre && 'bg-primary/10')}>
              <div onClick={() => sel && colocar(sel, { tipo: 'banco' })} className="grid gap-2 sm:grid-cols-2">
                {banco.length ? banco.map((id) => <div key={id}>{ficha(id, true)}</div>) : <p className="py-2 text-sm text-zinc-500 sm:col-span-2">Arraste atletas para cá para formar o banco.</p>}
              </div>
            </Soltavel>
          </Cartao>

          <Cartao titulo={`Convocados disponíveis (${disponiveis.length})`}>
            <Soltavel id="fora" className={(sobre) => cx('min-h-16 p-3 transition', sobre && 'bg-zinc-100')}>
              <div onClick={() => sel && usados.has(sel) && colocar(sel, { tipo: 'fora' })} className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
                {disponiveis.length ? disponiveis.map((id) => <div key={id}>{ficha(id)}</div>) : <p className="py-2 text-sm text-zinc-500 sm:col-span-2">Todos os convocados já estão escalados. Arraste um atleta para cá para removê-lo do time.</p>}
              </div>
            </Soltavel>
          </Cartao>

          <Cartao titulo="Capitão e substituições planejadas">
            <div className="space-y-3 p-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-700">Capitão</span>
                <select className={estiloCampo} value={capitao ?? ''} onChange={(e) => { setCapitao(e.target.value || null); setSujo(true); }}>
                  <option value="">Sem capitão definido</option>
                  {titulares.map((id) => <option key={id} value={id}>{porId.get(id)?.nome}</option>)}
                </select>
              </label>
              {subs.map((s, i) => {
                const mudar = (campo: Partial<Substituicao>) => { setSubs((l) => l.map((x, k) => (k === i ? { ...x, ...campo } : x))); setSujo(true); };
                return (
                  <div key={i} className="grid grid-cols-[1fr_1fr_64px_auto] items-center gap-2">
                    <select className={estiloCampo} value={s.sai_id} onChange={(e) => mudar({ sai_id: e.target.value })} aria-label="Sai">
                      <option value="">Sai…</option>
                      {titulares.map((id) => <option key={id} value={id}>{nomeCurto(porId.get(id)!)}</option>)}
                    </select>
                    <select className={estiloCampo} value={s.entra_id} onChange={(e) => mudar({ entra_id: e.target.value })} aria-label="Entra">
                      <option value="">Entra…</option>
                      {banco.map((id) => <option key={id} value={id}>{nomeCurto(porId.get(id)!)}</option>)}
                    </select>
                    <input type="number" min={0} max={130} className={estiloCampo} placeholder="Min" value={s.minuto ?? ''} onChange={(e) => mudar({ minuto: e.target.value ? Number(e.target.value) : null })} aria-label="Minuto" />
                    <BotaoIcone titulo="Remover substituição" onClick={() => { setSubs((l) => l.filter((_, k) => k !== i)); setSujo(true); }}><Trash2 className="h-4 w-4" /></BotaoIcone>
                  </div>
                );
              })}
              <Botao variante="secundario" tamanho="sm" icone={<Plus className="h-3.5 w-3.5" />} disabled={!titulares.length || !banco.length}
                onClick={() => { setSubs((l) => [...l, { sai_id: '', entra_id: '', minuto: null, observacao: null }]); setSujo(true); }}>
                Planejar substituição
              </Botao>
            </div>
          </Cartao>
        </div>
      </div>
    </DndContext>
  );
}
