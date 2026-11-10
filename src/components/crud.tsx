'use client';

import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Linha } from '@/lib/types';
import { useApp } from './contexto';
import { FormModal, type Campo } from './formulario';
import { Botao, BotaoIcone, Cabecalho, Carregando, Cartao, Tabela, estiloCampo, type Coluna } from './ui';

/** Carrega dados de forma assíncrona, com estado de carregamento e recarga manual. */
export function useDados<T>(buscar: () => Promise<T>, deps: unknown[] = []) {
  const { erro } = useApp();
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const fn = useRef(buscar);
  fn.current = buscar;
  const recarregar = useCallback(async () => {
    try {
      setDados(await fn.current());
    } catch (e) {
      erro(e);
    } finally {
      setCarregando(false);
    }
  }, [erro]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { recarregar(); }, deps);
  return { dados, carregando, recarregar, setDados };
}

/** Lança o erro do Supabase (se houver) e devolve os dados. */
export function ok<T>(r: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (r.error) throw new Error(r.error.message);
  return r.data as NonNullable<T>;
}

/** Busca todas as linhas de uma consulta, paginando de 1000 em 1000 (limite padrão da API do Supabase). */
export async function buscarTudo<T = Linha>(pagina: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const TAM = 1000;
  const tudo: T[] = [];
  for (let de = 0; ; de += TAM) {
    const lote = ok(await pagina(de, de + TAM - 1)) as T[];
    tudo.push(...lote);
    if (lote.length < TAM) return tudo;
  }
}

export function BuscaTexto({ valor, aoMudar, placeholder = 'Buscar…' }: { valor: string; aoMudar: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
      <input className={`${estiloCampo} pl-9`} placeholder={placeholder} value={valor} onChange={(e) => aoMudar(e.target.value)} aria-label={placeholder} />
    </div>
  );
}

export function AcoesLinha({ aoEditar, aoExcluir, children }: { aoEditar?: () => void; aoExcluir?: () => void; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      {children}
      {aoEditar && <BotaoIcone titulo="Editar" onClick={aoEditar}><Pencil className="h-4 w-4" /></BotaoIcone>}
      {aoExcluir && <BotaoIcone titulo="Excluir" onClick={aoExcluir} className="hover:!bg-red-50 hover:!text-red-600"><Trash2 className="h-4 w-4" /></BotaoIcone>}
    </div>
  );
}

/** Página de cadastro completa (listar, buscar, criar, editar, excluir) para módulos simples. */
export function PaginaCrud({
  titulo, descricao, tabela, select = '*', ordem, crescente = false, campos, colunas, podeEditar, item, pasta,
  textoBusca, prepararSalvar, depoisSalvar, acoes, extraCabecalho, filtro, padrao,
}: {
  titulo: string;
  descricao?: string;
  tabela: string;
  select?: string;
  ordem: string;
  crescente?: boolean;
  campos: Campo[];
  colunas: Coluna<Linha>[];
  podeEditar: boolean;
  item: string;
  pasta?: string;
  textoBusca?: (l: Linha) => string;
  prepararSalvar?: (valores: Linha, original: Linha | null) => Linha;
  depoisSalvar?: (valores: Linha, original: Linha | null) => Promise<void>;
  acoes?: (l: Linha) => ReactNode;
  extraCabecalho?: ReactNode;
  filtro?: (l: Linha) => boolean;
  padrao?: Linha;
}) {
  const { supabase, sucesso, erro, confirmar } = useApp();
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<Linha | null | undefined>(undefined);
  const { dados, carregando, recarregar } = useDados<Linha[]>(
    async () => ok(await supabase.from(tabela).select(select).order(ordem, { ascending: crescente })) as unknown as Linha[],
  );

  const salvar = async (valores: Linha) => {
    const original = editando ?? null;
    const corpo = prepararSalvar ? prepararSalvar(valores, original) : valores;
    if (original) ok(await supabase.from(tabela).update(corpo).eq('id', original.id).select('id'));
    else ok(await supabase.from(tabela).insert(corpo).select('id'));
    await depoisSalvar?.(valores, original);
    sucesso(original ? 'Alterações salvas.' : `${item} cadastrado(a) com sucesso.`);
    await recarregar();
  };

  const excluir = async (l: Linha) => {
    if (!(await confirmar({ titulo: `Excluir ${item.toLowerCase()}`, mensagem: 'Esta ação não pode ser desfeita. Deseja continuar?', textoConfirmar: 'Excluir', perigo: true }))) return;
    const { error } = await supabase.from(tabela).delete().eq('id', l.id);
    if (error) return erro(error);
    sucesso('Registro excluído.');
    recarregar();
  };

  const termo = busca.trim().toLowerCase();
  const linhas = (dados ?? []).filter((l) => (!filtro || filtro(l)) && (!termo || !textoBusca || textoBusca(l).toLowerCase().includes(termo)));
  const cols: Coluna<Linha>[] = podeEditar || acoes
    ? [...colunas, { titulo: '', celula: (l) => <AcoesLinha aoEditar={podeEditar ? () => setEditando(l) : undefined} aoExcluir={podeEditar ? () => excluir(l) : undefined}>{acoes?.(l)}</AcoesLinha> }]
    : colunas;

  return (
    <>
      <Cabecalho titulo={titulo} descricao={descricao}>
        {extraCabecalho}
        {textoBusca && <BuscaTexto valor={busca} aoMudar={setBusca} />}
        {podeEditar && <Botao icone={<Plus className="h-4 w-4" />} onClick={() => setEditando(null)}>Novo</Botao>}
      </Cabecalho>
      <Cartao>
        {carregando ? <Carregando /> : <Tabela colunas={cols} linhas={linhas} chave={(l) => l.id} />}
      </Cartao>
      <FormModal aberto={editando !== undefined} titulo={editando ? `Editar ${item.toLowerCase()}` : `Novo(a) ${item.toLowerCase()}`}
        campos={campos} inicial={editando ?? padrao} aoSalvar={salvar} aoFechar={() => setEditando(undefined)} pasta={pasta} />
    </>
  );
}
