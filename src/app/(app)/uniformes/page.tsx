'use client';

import { useApp } from '@/components/contexto';
import { FalhaCarregamento, PaginaCrud, ok, useDados } from '@/components/crud';
import type { Campo } from '@/components/formulario';
import { Carregando, Cartao, Selo, TOM_STATUS, cx } from '@/components/ui';
import { STATUS_UNIFORME, paraOpcoes } from '@/lib/constants';
import { dataBR, nomeCurto } from '@/lib/format';
import type { Atleta } from '@/lib/types';

export default function Uniformes() {
  const { supabase } = useApp();
  const { dados: atletas, recarregar, falha } = useDados<Atleta[]>(async () => ok(await supabase.from('atletas').select('*').neq('status', 'inativo').order('nome')));
  if (falha && !atletas) return <FalhaCarregamento mensagem={falha} aoTentar={recarregar} />;
  if (!atletas) return <Carregando />;

  const porNumero = new Map<number, Atleta[]>();
  atletas.forEach((a) => { if (a.numero != null) porNumero.set(a.numero, [...(porNumero.get(a.numero) ?? []), a]); });
  const maior = Math.max(30, ...porNumero.keys());

  const campos: Campo[] = [
    { nome: 'item', rotulo: 'Item', obrigatorio: true, placeholder: 'Ex.: Camisa titular, calção, meião…' },
    { nome: 'numero', rotulo: 'Número', tipo: 'numero', min: 0, max: 999 },
    { nome: 'tamanho', rotulo: 'Tamanho', placeholder: 'P, M, G, GG…' },
    { nome: 'status', rotulo: 'Situação', tipo: 'selecao', opcoes: paraOpcoes(STATUS_UNIFORME), obrigatorio: true },
    { nome: 'atleta_id', rotulo: 'Entregue ao atleta', tipo: 'selecao', opcoes: atletas.map((a) => ({ value: a.id, label: a.nome })),
      validar: (v, t) => (t.status === 'entregue' && !v ? 'Informe o atleta que recebeu o item.' : undefined) },
    { nome: 'data_entrega', rotulo: 'Data da entrega', tipo: 'data' },
    { nome: 'observacoes', rotulo: 'Observações', tipo: 'area' },
  ];

  return (
    <>
      <PaginaCrud
        titulo="Uniformes" descricao="Controle de materiais entregues e numeração do elenco." tabela="uniformes" select="*, atletas(nome)"
        ordem="criado_em" item="Uniforme" padrao={{ status: "disponivel" }} campos={campos} podeEditar textoBusca={(l) => `${l.item} ${l.atletas?.nome ?? ''} ${l.numero ?? ''}`}
        colunas={[
          { titulo: 'Item', celula: (l) => <span className="font-medium text-zinc-900">{l.item}</span> },
          { titulo: 'Nº', celula: (l) => l.numero ?? '—' },
          { titulo: 'Tamanho', celula: (l) => l.tamanho ?? '—' },
          { titulo: 'Atleta', celula: (l) => l.atletas?.nome ?? '—' },
          { titulo: 'Entrega', celula: (l) => dataBR(l.data_entrega) },
          { titulo: 'Situação', celula: (l) => <Selo tom={TOM_STATUS[l.status]}>{STATUS_UNIFORME[l.status]}</Selo> },
        ]}
      />
      <Cartao titulo="Numeração do elenco" className="mt-5">
        <div className="grid grid-cols-5 gap-2 p-4 sm:grid-cols-8 lg:grid-cols-10">
          {Array.from({ length: maior }, (_, i) => i + 1).map((n) => {
            const donos = porNumero.get(n) ?? [];
            return (
              <div key={n} title={donos.map((d) => d.nome).join(', ') || 'Número livre'}
                className={cx('rounded-lg border p-1.5 text-center', donos.length > 1 ? 'border-red-300 bg-red-50' : donos.length ? 'border-primary/30 bg-primary/10' : 'border-dashed border-zinc-200')}>
                <p className="font-display text-lg font-bold leading-none text-zinc-900">{n}</p>
                <p className="mt-0.5 truncate text-[10px] text-zinc-600">{donos.length > 1 ? 'Duplicado' : donos[0] ? nomeCurto(donos[0]) : 'Livre'}</p>
              </div>
            );
          })}
        </div>
      </Cartao>
    </>
  );
}
