'use client';

import { CheckCircle2, CircleDashed, DatabaseBackup, Pencil, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/components/contexto';
import { buscarTudo, ok } from '@/components/crud';
import { FormModal, type Campo } from '@/components/formulario';
import { Botao, Cabecalho, Cartao } from '@/components/ui';
import { hojeBR } from '@/lib/format';
import type { Linha } from '@/lib/types';
import { baixarBlob } from '@/lib/whatsapp';

const CAMPOS: Campo[] = [
  { nome: 'nome_clube', rotulo: 'Nome do clube', obrigatorio: true, largo: true },
  { nome: 'escudo_url', rotulo: 'Escudo (imagem quadrada)', tipo: 'imagem', largo: true },
  { nome: 'cor_primaria', rotulo: 'Cor primária', tipo: 'cor', obrigatorio: true, validar: corValida },
  { nome: 'cor_secundaria', rotulo: 'Cor secundária (menu)', tipo: 'cor', obrigatorio: true, validar: corValida },
  { nome: 'cor_destaque', rotulo: 'Cor de destaque', tipo: 'cor', obrigatorio: true, validar: corValida },
];
function corValida(v: unknown) {
  return /^#[0-9a-fA-F]{6}$/.test(String(v)) ? undefined : 'Use o formato #RRGGBB.';
}

// Ordem que respeita as dependências entre tabelas (para restaurar)
const TABELAS = [
  'configuracoes', 'atletas', 'atleta_financeiro', 'patrocinadores', 'mensalidades', 'creditos', 'movimentacoes', 'partidas', 'convocacoes', 'escalacao',
  'substituicoes_planejadas', 'estatisticas_partida', 'ocorrencias', 'lesoes', 'notas_comissao', 'avisos', 'eventos', 'uniformes', 'galeria',
];
const CHAVE: Record<string, string> = { atleta_financeiro: 'atleta_id' };

export default function Configuracoes() {
  const { supabase, config, setConfig, pode, sucesso, erro, confirmar } = useApp();
  const [editando, setEditando] = useState(false);
  const [integracoes, setIntegracoes] = useState<{ whats: boolean; ia: boolean } | null>(null);
  const [ocupado, setOcupado] = useState<'backup' | 'restaurar' | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([fetch('/api/whatsapp').then((r) => r.json()), fetch('/api/arte-ia').then((r) => r.json())])
      .then(([w, i]) => setIntegracoes({ whats: !!w.configurado, ia: !!i.configurado })).catch(() => setIntegracoes({ whats: false, ia: false }));
  }, []);

  const salvar = async (v: Linha) => {
    const novo = ok(await supabase.from('configuracoes').update(v).eq('id', 1).select('*').single());
    setConfig({ ...novo, valor_mensalidade: Number(novo.valor_mensalidade), valor_jogo: Number(novo.valor_jogo) });
    sucesso('Identidade do clube atualizada.');
  };

  const fazerBackup = async () => {
    setOcupado('backup');
    try {
      const tabelas: Record<string, Linha[]> = {};
      for (const t of [...TABELAS, 'auditoria']) {
        tabelas[t] = await buscarTudo((de, ate) => supabase.from(t).select('*').order(CHAVE[t] ?? 'id').range(de, ate));
      }
      const conteudo = JSON.stringify({ sistema: 'atletico-desterro', versao: 1, gerado_em: new Date().toISOString(), tabelas }, null, 1);
      baixarBlob(new Blob([conteudo], { type: 'application/json' }), `backup-atletico-desterro-${hojeBR()}.json`);
      sucesso('Backup gerado. Guarde o arquivo em local seguro.');
    } catch (e) {
      erro(e);
    } finally {
      setOcupado(null);
    }
  };

  const restaurar = async (arquivo?: File) => {
    if (entrada.current) entrada.current.value = '';
    if (!arquivo) return;
    let backup: { sistema?: string; gerado_em?: string; tabelas?: Record<string, Linha[]> };
    try {
      backup = JSON.parse(await arquivo.text());
    } catch {
      return erro('Arquivo inválido: não é um backup do sistema.');
    }
    if (backup.sistema !== 'atletico-desterro' || !backup.tabelas) return erro('Arquivo inválido: não é um backup do sistema.');
    const total = TABELAS.reduce((s, t) => s + (backup.tabelas?.[t]?.length ?? 0), 0);
    if (!(await confirmar({ titulo: 'Restaurar backup', textoConfirmar: 'Restaurar', perigo: true,
      mensagem: <>Serão restaurados <strong>{total} registros</strong> do backup de {new Date(backup.gerado_em ?? '').toLocaleString('pt-BR')}. Registros existentes com o mesmo identificador serão sobrescritos; os demais dados atuais são mantidos. Fotos e comprovantes não fazem parte do arquivo.</> }))) return;
    setOcupado('restaurar');
    try {
      const cfg = backup.tabelas.configuracoes?.[0];
      if (cfg) {
        const { id, atualizado_em, ...campos } = cfg;
        void id; void atualizado_em;
        const { error } = await supabase.from('configuracoes').update(campos).eq('id', 1);
        if (error) throw new Error(`Falha ao restaurar as configurações: ${error.message}`);
      }
      for (const t of TABELAS.filter((x) => x !== 'configuracoes')) {
        const linhas = (backup.tabelas[t] ?? []).map((l) => {
          const { responsavel_id, autorizado_por, ...resto } = l; // referências a usuários podem não existir mais
          void responsavel_id; void autorizado_por;
          return resto;
        });
        for (let i = 0; i < linhas.length; i += 400) {
          const { error } = await supabase.from(t).upsert(linhas.slice(i, i + 400), { onConflict: CHAVE[t] ?? 'id' });
          if (error) throw new Error(`Falha ao restaurar "${t}": ${error.message}`);
        }
      }
      sucesso('Backup restaurado com sucesso. Recarregando…');
      setTimeout(() => location.reload(), 1500);
    } catch (e) {
      erro(e);
    } finally {
      setOcupado(null);
    }
  };

  const Integracao = ({ ok: ativo, titulo, texto }: { ok: boolean; titulo: string; texto: string }) => (
    <li className="flex items-start gap-3 px-4 py-3">
      {ativo ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" /> : <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" />}
      <div><p className="text-sm font-medium text-zinc-900">{titulo} — {ativo ? 'configurada' : 'não configurada'}</p><p className="text-xs text-zinc-500">{texto}</p></div>
    </li>
  );

  return (
    <>
      <Cabecalho titulo="Configurações" descricao="Identidade visual, integrações e segurança dos dados." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Identidade do clube" acao={<Botao variante="secundario" tamanho="sm" icone={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditando(true)}>Editar</Botao>}>
          <div className="flex items-center gap-4 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={config.escudo_url || '/escudo.jpg'} alt="Escudo do clube" className="h-24 w-24 rounded-2xl border border-zinc-200 object-cover" />
            <div>
              <p className="font-display text-2xl font-bold uppercase">{config.nome_clube}</p>
              <div className="mt-2 flex flex-wrap gap-3">
                {[['Primária', config.cor_primaria], ['Secundária', config.cor_secundaria], ['Destaque', config.cor_destaque]].map(([r, c]) => (
                  <span key={r} className="flex items-center gap-1.5 text-xs text-zinc-600"><span className="h-5 w-5 rounded border border-zinc-300" style={{ background: c }} /> {r} <code>{c}</code></span>
                ))}
              </div>
            </div>
          </div>
          <p className="border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500">As cores são aplicadas ao sistema inteiro e às artes de escalação. O valor da taxa por jogo e a chave Pix ficam em Taxas de jogo → Configurar.</p>
        </Cartao>

        <Cartao titulo="Integrações">
          <ul className="divide-y divide-zinc-100">
            <Integracao ok titulo="WhatsApp — compartilhamento nativo" texto="Abre o WhatsApp com a mensagem pronta; arquivos são enviados pelo menu de compartilhar do celular." />
            <Integracao ok={!!integracoes?.whats} titulo="WhatsApp Business API" texto="Envio direto pela API oficial da Meta. Requer WHATSAPP_TOKEN e WHATSAPP_PHONE_ID no servidor." />
            <Integracao ok={!!integracoes?.ia} titulo="Geração de imagens por IA" texto="Fundo artístico das artes de escalação. Requer OPENAI_API_KEY no servidor." />
          </ul>
        </Cartao>

        {pode('admin') && (
          <Cartao titulo="Backup e recuperação de dados" className="lg:col-span-2">
            <div className="flex flex-wrap items-center gap-3 p-4">
              <Botao icone={<DatabaseBackup className="h-4 w-4" />} carregando={ocupado === 'backup'} onClick={fazerBackup}>Baixar backup completo</Botao>
              <input ref={entrada} type="file" accept="application/json,.json" className="hidden" onChange={(e) => restaurar(e.target.files?.[0])} />
              <Botao variante="secundario" icone={<Upload className="h-4 w-4" />} carregando={ocupado === 'restaurar'} onClick={() => entrada.current?.click()}>Restaurar de um backup</Botao>
            </div>
            <p className="border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500">
              O backup é um arquivo JSON com todos os cadastros, taxas de jogo, caixa, partidas, estatísticas e o registro de auditoria. Usuários/senhas e arquivos enviados (fotos e comprovantes) permanecem no Supabase e não entram no arquivo.
            </p>
          </Cartao>
        )}
      </div>
      <FormModal aberto={editando} titulo="Identidade do clube" campos={CAMPOS} inicial={config} aoSalvar={salvar} aoFechar={() => setEditando(false)} pasta="clube" />
    </>
  );
}
