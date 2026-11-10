'use client';

import { Download, FileText, MessageCircle, Share2, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ESTILOS, FORMATOS, canvasParaBlob, carregarImagem, desenharArte, type DadosArte, type Estilo, type Formato, type ImagensArte,
} from '@/lib/arte';
import { FORMACOES, POSICOES } from '@/lib/constants';
import { novoPDF } from '@/lib/export';
import { dataExtensa, horaBR, nomeCurto } from '@/lib/format';
import type { AtletaBasico, ItemEscalacao, Partida, Substituicao } from '@/lib/types';
import { MSG, baixarBlob, compartilharArquivo } from '@/lib/whatsapp';
import { useApp } from './contexto';
import { Botao, Cartao, Rotulo, Vazio, estiloCampo } from './ui';

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();

export function ArteEscalacao({ partida, atletas, escalacao, subs = [], somenteLeitura }: {
  partida: Partida; atletas: AtletaBasico[]; escalacao: ItemEscalacao[]; subs?: Substituicao[]; somenteLeitura?: boolean;
}) {
  const { config, sucesso, erro, info, whats } = useApp();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [formato, setFormato] = useState<Formato>('feed');
  const [estilo, setEstilo] = useState<Estilo>('noite');
  const [fundo, setFundo] = useState<string | null>(null);
  const [iaDisponivel, setIaDisponivel] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const imagens = useRef<ImagensArte>({ escudo: null, fundo: null, fotos: new Map() });

  const porId = useMemo(() => new Map(atletas.map((a) => [a.id, a])), [atletas]);
  const titulares = escalacao.filter((e) => e.tipo === 'titular' && porId.has(e.atleta_id)).sort((a, b) => a.slot - b.slot);
  const reservas = escalacao.filter((e) => e.tipo === 'reserva' && porId.has(e.atleta_id)).sort((a, b) => a.slot - b.slot);
  const base = FORMACOES[partida.formacao] ?? FORMACOES['4-4-2'];

  const dados: DadosArte = useMemo(() => ({
    clube: config.nome_clube, adversario: partida.adversario, mando: partida.mando, dataHora: partida.data_hora, local: partida.local,
    competicao: partida.competicao, formacao: partida.formacao,
    cores: { primaria: config.cor_primaria, secundaria: config.cor_secundaria, destaque: config.cor_destaque },
    titulares: titulares.map((e) => {
      const a = porId.get(e.atleta_id)!;
      return { id: a.id, nome: nomeCurto(a), numero: a.numero, foto: a.foto_url, capitao: partida.capitao_id === a.id, x: Number(e.x ?? base[e.slot]?.x ?? 50), y: Number(e.y ?? base[e.slot]?.y ?? 50) };
    }),
    reservas: reservas.map((e) => ({ nome: nomeCurto(porId.get(e.atleta_id)!), numero: porId.get(e.atleta_id)!.numero })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [partida, escalacao, atletas, config]);

  useEffect(() => {
    if (somenteLeitura) return;
    fetch('/api/arte-ia').then((r) => r.json()).then((d) => setIaDisponivel(!!d.configurado)).catch(() => {});
  }, [somenteLeitura]);

  // Carrega escudo e fotos uma vez; redesenha a cada mudança de modelo
  useEffect(() => {
    let vivo = true;
    (async () => {
      const im = imagens.current;
      if (!im.escudo) im.escudo = await carregarImagem(config.escudo_url || '/escudo.jpg');
      await Promise.all(dados.titulares.filter((j) => j.foto && !im.fotos.has(j.id)).map(async (j) => {
        const img = await carregarImagem(j.foto);
        if (img) im.fotos.set(j.id, img);
      }));
      im.fundo = fundo ? await carregarImagem(fundo) : null;
      if (vivo && canvas.current) {
        await desenharArte(canvas.current, dados, formato, estilo, im);
        setPronto(true);
      }
    })();
    return () => { vivo = false; };
  }, [dados, formato, estilo, fundo, config.escudo_url]);

  if (!titulares.length) return <Cartao><Vazio titulo="Escalação ainda não definida" descricao={somenteLeitura ? 'A comissão técnica ainda não publicou a escalação desta partida.' : 'Monte e salve a escalação na aba Escalação para gerar a arte.'} /></Cartao>;

  const nomeArquivo = `escalacao-${slug(partida.adversario)}-${formato}`;
  const legenda = MSG.escalacao(partida, config);

  const exportar = async (tipo: 'image/png' | 'image/jpeg', compartilhar = false) => {
    try {
      const blob = await canvasParaBlob(canvas.current!, tipo);
      const nome = `${nomeArquivo}.${tipo === 'image/png' ? 'png' : 'jpg'}`;
      if (compartilhar && (await compartilharArquivo(blob, nome, legenda))) return;
      baixarBlob(blob, nome);
      if (compartilhar) info('Seu navegador não permite compartilhar arquivos direto. A imagem foi baixada: anexe-a na conversa do WhatsApp.');
      else sucesso('Arte baixada.');
    } catch (e) {
      erro(e);
    }
  };

  const gerarPDF = async (compartilhar = false) => {
    try {
      const { doc, y, largura } = await novoPDF('Escalação oficial', config, `${config.nome_clube} x ${partida.adversario}`);
      const { default: autoTable } = await import('jspdf-autotable');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(partida.mando === 'casa' ? `${config.nome_clube} x ${partida.adversario}` : `${partida.adversario} x ${config.nome_clube}`, 10, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text([`${dataExtensa(partida.data_hora)} às ${horaBR(partida.data_hora)}`, [partida.local, partida.competicao].filter(Boolean).join(' · ') || ' ', `Formação: ${partida.formacao}`], 10, y + 5.5);
      // arte no formato feed, à esquerda
      const temp = document.createElement('canvas');
      await desenharArte(temp, dados, 'feed', estilo, imagens.current);
      const [iw, ih] = [84, 105];
      doc.addImage(temp.toDataURL('image/jpeg', 0.9), 'JPEG', 10, y + 20, iw, ih);
      const estiloTabela = { styles: { fontSize: 9, cellPadding: 1.6 }, headStyles: { fillColor: config.cor_primaria, textColor: '#ffffff' }, margin: { left: 10 + iw + 6, right: 10 } } as const;
      autoTable(doc, {
        ...estiloTabela, startY: y + 20, head: [['Nº', 'Titular', 'Função']],
        body: titulares.map((e) => { const a = porId.get(e.atleta_id)!; return [a.numero ?? '', a.nome + (partida.capitao_id === a.id ? ' (C)' : ''), POSICOES[(e.funcao as keyof typeof POSICOES) ?? a.posicao]?.label ?? '']; }),
      });
      autoTable(doc, {
        ...estiloTabela, head: [['Nº', 'Reserva', 'Posição']],
        body: reservas.length ? reservas.map((e) => { const a = porId.get(e.atleta_id)!; return [a.numero ?? '', a.nome, POSICOES[a.posicao].label]; }) : [['', 'Sem reservas definidos', '']],
      });
      if (subs.length) {
        autoTable(doc, {
          ...estiloTabela, margin: { left: 10, right: 10 }, startY: Math.max((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY, y + 20 + ih) + 6,
          head: [['Substituições planejadas — Sai', 'Entra', 'Minuto']],
          body: subs.map((s) => [porId.get(s.sai_id)?.nome ?? '', porId.get(s.entra_id)?.nome ?? '', s.minuto != null ? `${s.minuto}'` : '—']),
        });
      }
      doc.setFontSize(8);
      doc.setTextColor('#888888');
      doc.text(`${config.nome_clube} — documento gerado pelo sistema de gestão do clube`, largura / 2, 290, { align: 'center' });
      const blob = doc.output('blob');
      const nome = `escalacao-${slug(partida.adversario)}.pdf`;
      if (compartilhar && (await compartilharArquivo(blob, nome, legenda))) return;
      baixarBlob(blob, nome);
      if (compartilhar) info('Seu navegador não permite compartilhar arquivos direto. O PDF foi baixado: anexe-o na conversa do WhatsApp.');
      else sucesso('PDF da escalação gerado.');
    } catch (e) {
      erro(e);
    }
  };

  const gerarFundoIA = async () => {
    setGerando(true);
    try {
      const r = await fetch('/api/arte-ia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ formato, cores: `${config.cor_primaria}, ${config.cor_secundaria} e ${config.cor_destaque}` }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro);
      setFundo(d.imagem);
      sucesso('Fundo gerado por IA aplicado à arte.');
    } catch (e) {
      erro(e);
    } finally {
      setGerando(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,440px)_1fr]">
      <div className="rounded-2xl border border-zinc-200 bg-zinc-900 p-3">
        <canvas ref={canvas} className="mx-auto block h-auto max-h-[75dvh] w-auto max-w-full rounded-lg" aria-label={`Arte da escalação contra ${partida.adversario}`} />
      </div>
      <div className="space-y-4">
        <Cartao titulo="Modelo da arte">
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Rotulo rotulo="Formato">
              <select className={estiloCampo} value={formato} onChange={(e) => setFormato(e.target.value as Formato)}>
                {(Object.keys(FORMATOS) as Formato[]).map((f) => <option key={f} value={f}>{FORMATOS[f].rotulo}</option>)}
              </select>
            </Rotulo>
            <Rotulo rotulo="Estilo visual">
              <select className={estiloCampo} value={estilo} onChange={(e) => setEstilo(e.target.value as Estilo)} disabled={!!fundo}>
                {(Object.keys(ESTILOS) as Estilo[]).map((s) => <option key={s} value={s}>{ESTILOS[s]}</option>)}
              </select>
            </Rotulo>
            {!somenteLeitura && (
              <div className="sm:col-span-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Botao variante="secundario" icone={<Sparkles className="h-4 w-4" />} carregando={gerando} disabled={!iaDisponivel} onClick={gerarFundoIA}>
                    {gerando ? 'Gerando fundo (até 1 min)…' : 'Gerar fundo com IA'}
                  </Botao>
                  {fundo && <Botao variante="fantasma" icone={<X className="h-4 w-4" />} onClick={() => setFundo(null)}>Remover fundo de IA</Botao>}
                </div>
                <p className="mt-1.5 text-xs text-zinc-500">
                  {iaDisponivel
                    ? 'A IA cria o cenário de fundo. Escudo, fotos, nomes e números são sempre aplicados pelo sistema, para saírem corretos.'
                    : 'Geração por IA não configurada: defina OPENAI_API_KEY no servidor para habilitar. Os modelos acima funcionam sem IA.'}
                </p>
              </div>
            )}
          </div>
        </Cartao>
        <Cartao titulo="Baixar e compartilhar">
          <div className="flex flex-wrap gap-2 p-4">
            <Botao disabled={!pronto} icone={<Download className="h-4 w-4" />} onClick={() => exportar('image/png')}>Baixar PNG</Botao>
            <Botao disabled={!pronto} variante="secundario" icone={<Download className="h-4 w-4" />} onClick={() => exportar('image/jpeg')}>Baixar JPG</Botao>
            <Botao disabled={!pronto} variante="secundario" icone={<FileText className="h-4 w-4" />} onClick={() => gerarPDF()}>Gerar PDF</Botao>
            <Botao disabled={!pronto} variante="whats" icone={<Share2 className="h-4 w-4" />} onClick={() => exportar('image/jpeg', true)}>Compartilhar imagem</Botao>
            <Botao disabled={!pronto} variante="whats" icone={<Share2 className="h-4 w-4" />} onClick={() => gerarPDF(true)}>Compartilhar PDF</Botao>
            {!somenteLeitura && (
              <Botao variante="secundario" icone={<MessageCircle className="h-4 w-4" />}
                onClick={() => whats({ msg: `${legenda}\n*Titulares (${partida.formacao}):*\n${titulares.map((e) => { const a = porId.get(e.atleta_id)!; return `${a.numero ?? '–'} ${nomeCurto(a)}${partida.capitao_id === a.id ? ' (C)' : ''}`; }).join('\n')}${reservas.length ? `\n\n*Reservas:*\n${reservas.map((e) => { const a = porId.get(e.atleta_id)!; return `${a.numero ?? '–'} ${nomeCurto(a)}`; }).join('\n')}` : ''}` })}>
                Enviar em texto
              </Botao>
            )}
          </div>
          <p className="border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500">
            “Compartilhar” abre o menu do celular para escolher o WhatsApp (contato ou grupo). No computador, o arquivo é baixado para você anexar.
          </p>
        </Cartao>
      </div>
    </div>
  );
}
