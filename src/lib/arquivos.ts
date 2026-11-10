import type { SupabaseClient } from '@supabase/supabase-js';

const LIMITE_MB = 8;

/**
 * Envia um arquivo ao Supabase Storage.
 * - bucket "fotos" (público): devolve a URL pública.
 * - bucket "documentos" (privado): devolve o caminho; abra com abrirDocumento().
 */
export async function enviarArquivo(supabase: SupabaseClient, bucket: 'fotos' | 'documentos', pasta: string, arquivo: File): Promise<string> {
  if (arquivo.size > LIMITE_MB * 1024 * 1024) throw new Error(`O arquivo excede ${LIMITE_MB} MB.`);
  if (bucket === 'fotos' && !arquivo.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem.');
  if (bucket === 'documentos' && !/^(image\/|application\/pdf)/.test(arquivo.type)) throw new Error('O comprovante deve ser imagem ou PDF.');
  const ext = (arquivo.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const caminho = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
  if (error) throw new Error(`Falha no envio do arquivo: ${error.message}`);
  return bucket === 'fotos' ? supabase.storage.from(bucket).getPublicUrl(caminho).data.publicUrl : caminho;
}

/** Abre um documento privado (comprovante) por meio de URL assinada e temporária. */
export async function abrirDocumento(supabase: SupabaseClient, caminho: string) {
  const { data, error } = await supabase.storage.from('documentos').createSignedUrl(caminho, 120);
  if (error || !data) throw new Error('Não foi possível abrir o documento.');
  window.open(data.signedUrl, '_blank', 'noopener');
}
