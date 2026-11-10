import { dataHoraBR } from './format';
import type { Config } from './types';

export type Tabela = { colunas: string[]; linhas: (string | number)[][]; rodape?: (string | number)[] };

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();

export async function imagemParaDataURL(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((ok) => {
      const r = new FileReader();
      r.onload = () => ok(r.result as string);
      r.onerror = () => ok(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Cria um PDF A4 com cabeçalho do clube. Devolve o documento e a posição Y livre. */
export async function novoPDF(titulo: string, config: Config, subtitulo?: string, paisagem = false) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: paisagem ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const largura = doc.internal.pageSize.getWidth();
  doc.setFillColor(config.cor_secundaria);
  doc.rect(0, 0, largura, 26, 'F');
  doc.setFillColor(config.cor_primaria);
  doc.rect(0, 26, largura, 1.5, 'F');
  const escudo = await imagemParaDataURL(config.escudo_url || '/escudo.jpg');
  if (escudo) {
    try {
      doc.addImage(escudo, escudo.includes('image/png') ? 'PNG' : 'JPEG', 10, 4, 18, 18);
    } catch {
      // formato de imagem não suportado pelo PDF: segue sem o escudo
    }
  }
  doc.setTextColor('#ffffff');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(config.nome_clube.toUpperCase(), 32, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(titulo + (subtitulo ? ` — ${subtitulo}` : ''), 32, 19);
  doc.setFontSize(8);
  doc.text(`Emitido em ${dataHoraBR(new Date().toISOString())}`, largura - 10, 19, { align: 'right' });
  doc.setTextColor('#111111');
  return { doc, y: 34, largura };
}

export async function exportarPDF(titulo: string, t: Tabela, config: Config, subtitulo?: string) {
  const { doc, y } = await novoPDF(titulo, config, subtitulo, t.colunas.length > 6);
  const { default: autoTable } = await import('jspdf-autotable');
  autoTable(doc, {
    startY: y,
    head: [t.colunas],
    body: t.linhas.map((l) => l.map(String)),
    foot: t.rodape ? [t.rodape.map(String)] : undefined,
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: config.cor_primaria, textColor: '#ffffff' },
    footStyles: { fillColor: '#eeeeee', textColor: '#111111', fontStyle: 'bold' },
    alternateRowStyles: { fillColor: '#f6f7f6' },
    margin: { left: 10, right: 10 },
  });
  doc.save(`${slug(titulo)}.pdf`);
}

export async function exportarExcel(titulo: string, t: Tabela) {
  const XLSX = await import('xlsx');
  const dados = [t.colunas, ...t.linhas, ...(t.rodape ? [t.rodape] : [])];
  const ws = XLSX.utils.aoa_to_sheet(dados);
  ws['!cols'] = t.colunas.map((c, i) => ({
    wch: Math.min(45, Math.max(c.length, ...t.linhas.map((l) => String(l[i] ?? '').length)) + 2),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, titulo.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
  XLSX.writeFile(wb, `${slug(titulo)}.xlsx`);
}
