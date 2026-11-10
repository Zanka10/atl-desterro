'use client';

import { Megaphone, MessageCircle, Pin, Plus } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/components/contexto';
import { AcoesLinha, ok, useDados } from '@/components/crud';
import { FormModal, type Campo } from '@/components/formulario';
import { Botao, Cabecalho, Carregando, Cartao, Selo, Vazio } from '@/components/ui';
import { dataHoraBR } from '@/lib/format';
import type { Linha } from '@/lib/types';
import { MSG } from '@/lib/whatsapp';

const CAMPOS: Campo[] = [
  { nome: 'titulo', rotulo: 'Título', obrigatorio: true, largo: true },
  { nome: 'conteudo', rotulo: 'Mensagem', tipo: 'area', obrigatorio: true },
  { nome: 'fixado', rotulo: 'Destaque', tipo: 'caixa', dica: 'Fixar no topo do mural' },
];

export default function Mural() {
  const { supabase, perfil, config, sucesso, erro, confirmar, whats } = useApp();
  const [editando, setEditando] = useState<Linha | null | undefined>(undefined);
  const { dados, carregando, recarregar } = useDados<Linha[]>(async () =>
    ok(await supabase.from('avisos').select('*').order('fixado', { ascending: false }).order('criado_em', { ascending: false })));

  const salvar = async (v: Linha) => {
    if (editando) ok(await supabase.from('avisos').update(v).eq('id', editando.id).select('id'));
    else ok(await supabase.from('avisos').insert({ ...v, autor_nome: perfil.nome }).select('id'));
    sucesso(editando ? 'Aviso atualizado.' : 'Aviso publicado no mural e no portal dos atletas.');
    recarregar();
  };
  const excluir = async (a: Linha) => {
    if (!(await confirmar({ titulo: 'Excluir aviso', mensagem: `Excluir o aviso "${a.titulo}"?`, textoConfirmar: 'Excluir', perigo: true }))) return;
    const { error } = await supabase.from('avisos').delete().eq('id', a.id);
    if (error) return erro(error);
    sucesso('Aviso excluído.');
    recarregar();
  };

  return (
    <>
      <Cabecalho titulo="Mural de avisos" descricao="Comunicados do clube, visíveis também no portal do atleta.">
        <Botao icone={<Plus className="h-4 w-4" />} onClick={() => setEditando(null)}>Novo aviso</Botao>
      </Cabecalho>
      {carregando ? <Carregando /> : !dados?.length ? (
        <Cartao><Vazio titulo="Nenhum aviso publicado" descricao="Publique comunicados para a equipe e compartilhe pelo WhatsApp." icone={<Megaphone className="h-6 w-6" />} /></Cartao>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {dados.map((a) => (
            <Cartao key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold uppercase text-zinc-900">{a.titulo}</h2>
                  <p className="text-xs text-zinc-500">{a.autor_nome ?? 'Clube'} · {dataHoraBR(a.criado_em)}</p>
                </div>
                {a.fixado && <Selo tom="amarelo"><Pin className="h-3 w-3" /> Fixado</Selo>}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-700">{a.conteudo}</p>
              <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-2">
                <Botao variante="whats" tamanho="sm" icone={<MessageCircle className="h-3.5 w-3.5" />} onClick={() => whats({ msg: MSG.comunicado(a.titulo, a.conteudo, config) })}>
                  Compartilhar
                </Botao>
                <AcoesLinha aoEditar={() => setEditando(a)} aoExcluir={() => excluir(a)} />
              </div>
            </Cartao>
          ))}
        </div>
      )}
      <FormModal aberto={editando !== undefined} titulo={editando ? 'Editar aviso' : 'Novo aviso'} campos={CAMPOS} inicial={editando} aoSalvar={salvar} aoFechar={() => setEditando(undefined)} textoBotao="Publicar" />
    </>
  );
}
