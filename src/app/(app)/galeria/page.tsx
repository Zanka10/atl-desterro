'use client';

import { ImagePlus, Images, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useApp } from '@/components/contexto';
import { ok, useDados } from '@/components/crud';
import { Botao, Cabecalho, Carregando, Cartao, Vazio } from '@/components/ui';
import { enviarArquivo } from '@/lib/arquivos';
import { dataHoraBR } from '@/lib/format';
import type { Linha } from '@/lib/types';

export default function Galeria() {
  const { supabase, sucesso, erro, confirmar } = useApp();
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [aberta, setAberta] = useState<Linha | null>(null);
  const { dados, carregando, recarregar } = useDados<Linha[]>(async () =>
    ok(await supabase.from('galeria').select('*').order('criado_em', { ascending: false })));

  const enviar = async (arquivos: FileList | null) => {
    if (!arquivos?.length) return;
    const titulo = window.prompt('Legenda das fotos (opcional):') ?? '';
    setEnviando(true);
    try {
      for (const arquivo of Array.from(arquivos)) {
        const url = await enviarArquivo(supabase, 'fotos', 'galeria', arquivo);
        ok(await supabase.from('galeria').insert({ url, titulo: titulo.trim() || null }).select('id'));
      }
      sucesso(`${arquivos.length} foto(s) adicionada(s) à galeria.`);
      recarregar();
    } catch (e) {
      erro(e);
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = '';
    }
  };

  const excluir = async (f: Linha) => {
    if (!(await confirmar({ titulo: 'Excluir foto', mensagem: 'Remover esta foto da galeria?', textoConfirmar: 'Excluir', perigo: true }))) return;
    const { error } = await supabase.from('galeria').delete().eq('id', f.id);
    if (error) return erro(error);
    const caminho = String(f.url).split('/fotos/')[1];
    if (caminho) await supabase.storage.from('fotos').remove([decodeURIComponent(caminho)]);
    setAberta(null);
    sucesso('Foto excluída.');
    recarregar();
  };

  return (
    <>
      <Cabecalho titulo="Galeria de fotos" descricao="Registros de jogos e eventos do clube.">
        <input ref={entrada} type="file" accept="image/*" multiple className="hidden" onChange={(e) => enviar(e.target.files)} />
        <Botao icone={<ImagePlus className="h-4 w-4" />} carregando={enviando} onClick={() => entrada.current?.click()}>Adicionar fotos</Botao>
      </Cabecalho>
      {carregando ? <Carregando /> : !dados?.length ? (
        <Cartao><Vazio titulo="A galeria está vazia" descricao="Envie fotos dos jogos e eventos para montar a memória do clube." icone={<Images className="h-6 w-6" />} /></Cartao>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {dados.map((f) => (
            <button key={f.id} onClick={() => setAberta(f)} className="group relative aspect-square overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.titulo ?? 'Foto da galeria'} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
              {f.titulo && <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-6 text-left text-xs text-white">{f.titulo}</span>}
            </button>
          ))}
        </div>
      )}
      {aberta && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4" onClick={() => setAberta(null)}>
          <div className="flex items-center justify-between gap-3 text-white" onClick={(e) => e.stopPropagation()}>
            <p className="min-w-0 truncate text-sm">{aberta.titulo ?? 'Foto'} · {dataHoraBR(aberta.criado_em)}</p>
            <div className="flex gap-2">
              <Botao variante="perigo" tamanho="sm" icone={<Trash2 className="h-3.5 w-3.5" />} onClick={() => excluir(aberta)}>Excluir</Botao>
              <Botao variante="secundario" tamanho="sm" icone={<X className="h-3.5 w-3.5" />} onClick={() => setAberta(null)}>Fechar</Botao>
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={aberta.url} alt={aberta.titulo ?? ''} className="m-auto max-h-[85dvh] max-w-full rounded-lg object-contain" />
        </div>
      )}
    </>
  );
}
