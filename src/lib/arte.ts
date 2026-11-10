import { dataExtensa, horaBR, iniciais } from './format';

export type Formato = 'feed' | 'story' | 'quadrado';
export type Estilo = 'noite' | 'clube' | 'claro';

export const FORMATOS: Record<Formato, { rotulo: string; w: number; h: number }> = {
  feed: { rotulo: 'Instagram — feed (4:5)', w: 1080, h: 1350 },
  story: { rotulo: 'Story / status do WhatsApp (9:16)', w: 1080, h: 1920 },
  quadrado: { rotulo: 'Grupo de WhatsApp (1:1)', w: 1080, h: 1080 },
};
export const ESTILOS: Record<Estilo, string> = { noite: 'Noite de jogo', clube: 'Cores do clube', claro: 'Claro' };

export type JogadorArte = { id: string; nome: string; numero: number | null; foto: string | null; x: number; y: number; capitao: boolean };
export type DadosArte = {
  clube: string;
  adversario: string;
  mando: 'casa' | 'fora';
  dataHora: string;
  local: string | null;
  competicao: string | null;
  formacao: string;
  titulares: JogadorArte[];
  reservas: { nome: string; numero: number | null }[];
  cores: { primaria: string; secundaria: string; destaque: string };
};
export type ImagensArte = { escudo: HTMLImageElement | null; fundo: HTMLImageElement | null; fotos: Map<string, HTMLImageElement> };

export function carregarImagem(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((ok) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = url;
  });
}

type Ctx = CanvasRenderingContext2D;

function caminhoArredondado(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Desenha a imagem cobrindo toda a área (como object-fit: cover). */
function cobrir(c: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const escala = Math.max(w / img.width, h / img.height);
  const sw = w / escala;
  const sh = h / escala;
  c.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

/** Texto que encolhe até caber na largura máxima. */
function texto(c: Ctx, t: string, x: number, y: number, o: { tam: number; peso?: number; cor: string; fam: string; max?: number; alinhar?: CanvasTextAlign; espaco?: number }) {
  let tam = o.tam;
  c.textAlign = o.alinhar ?? 'left';
  c.textBaseline = 'alphabetic';
  c.fillStyle = o.cor;
  (c as Ctx & { letterSpacing?: string }).letterSpacing = `${o.espaco ?? 0}px`;
  do {
    c.font = `${o.peso ?? 700} ${tam}px ${o.fam}`;
    tam -= 2;
  } while (o.max && c.measureText(t).width > o.max && tam > 12);
  c.fillText(t, x, y);
  const largura = c.measureText(t).width;
  (c as Ctx & { letterSpacing?: string }).letterSpacing = '0px';
  return largura;
}

function campo(c: Ctx, x: number, y: number, w: number, h: number, claro: boolean) {
  c.save();
  caminhoArredondado(c, x, y, w, h, 28);
  c.clip();
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, claro ? '#2f9e58' : '#1f8a47');
  g.addColorStop(1, claro ? '#1f7f43' : '#125a2c');
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  c.fillStyle = 'rgba(255,255,255,0.045)';
  const faixas = 10;
  for (let i = 0; i < faixas; i += 2) c.fillRect(x, y + (h / faixas) * i, w, h / faixas);
  c.restore();

  c.strokeStyle = 'rgba(255,255,255,0.55)';
  c.lineWidth = 4;
  const m = 22;
  const [cx, cw, ch] = [x + w / 2, w - 2 * m, h - 2 * m];
  c.strokeRect(x + m, y + m, cw, ch);
  c.beginPath();
  c.moveTo(x + m, y + h / 2);
  c.lineTo(x + w - m, y + h / 2);
  c.stroke();
  c.beginPath();
  c.arc(cx, y + h / 2, Math.min(w, h) * 0.11, 0, Math.PI * 2);
  c.stroke();
  const [aw, ah, pw, ph] = [cw * 0.52, ch * 0.15, cw * 0.24, ch * 0.055];
  c.strokeRect(cx - aw / 2, y + m, aw, ah);
  c.strokeRect(cx - pw / 2, y + m, pw, ph);
  c.strokeRect(cx - aw / 2, y + h - m - ah, aw, ah);
  c.strokeRect(cx - pw / 2, y + h - m - ph, pw, ph);
}

function jogador(c: Ctx, j: JogadorArte, px: number, py: number, r: number, d: DadosArte, fam: string, foto: HTMLImageElement | null) {
  // sombra + foto recortada em círculo
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.45)';
  c.shadowBlur = 16;
  c.shadowOffsetY = 6;
  c.beginPath();
  c.arc(px, py, r, 0, Math.PI * 2);
  c.fillStyle = d.cores.secundaria;
  c.fill();
  c.restore();
  c.save();
  c.beginPath();
  c.arc(px, py, r, 0, Math.PI * 2);
  c.clip();
  if (foto) cobrir(c, foto, px - r, py - r, r * 2, r * 2);
  else texto(c, j.numero != null ? String(j.numero) : iniciais(j.nome), px, py + r * 0.33, { tam: r * 0.95, cor: '#ffffff', fam, alinhar: 'center' });
  c.restore();
  c.beginPath();
  c.arc(px, py, r, 0, Math.PI * 2);
  c.lineWidth = Math.max(4, r * 0.1);
  c.strokeStyle = '#ffffff';
  c.stroke();

  // número
  if (j.numero != null && foto) {
    const br = r * 0.42;
    c.beginPath();
    c.arc(px + r * 0.72, py + r * 0.62, br, 0, Math.PI * 2);
    c.fillStyle = d.cores.destaque;
    c.fill();
    texto(c, String(j.numero), px + r * 0.72, py + r * 0.62 + br * 0.38, { tam: br * 1.15, cor: '#111111', fam, alinhar: 'center', max: br * 1.7 });
  }
  // capitão
  if (j.capitao) {
    const br = r * 0.36;
    c.beginPath();
    c.arc(px - r * 0.74, py - r * 0.62, br, 0, Math.PI * 2);
    c.fillStyle = '#facc15';
    c.fill();
    texto(c, 'C', px - r * 0.74, py - r * 0.62 + br * 0.4, { tam: br * 1.2, cor: '#111111', fam, alinhar: 'center' });
  }
  // nome
  const tam = r * 0.5;
  c.font = `600 ${tam}px ${fam}`;
  const nome = j.nome.toUpperCase();
  const lw = Math.min(c.measureText(nome).width, r * 3.6) + tam * 1.1;
  const ly = py + r + tam * 0.38;
  caminhoArredondado(c, px - lw / 2, ly, lw, tam * 1.5, tam * 0.35);
  c.fillStyle = 'rgba(10,10,10,0.82)';
  c.fill();
  texto(c, nome, px, ly + tam * 1.08, { tam, peso: 600, cor: '#ffffff', fam, alinhar: 'center', max: r * 3.6, espaco: 0.5 });
}

/** Desenha a arte completa da escalação no canvas. */
export async function desenharArte(canvas: HTMLCanvasElement, d: DadosArte, formato: Formato, estilo: Estilo, imgs: ImagensArte) {
  const { w: W, h: H } = FORMATOS[formato];
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d')!;
  const fam = getComputedStyle(document.documentElement).getPropertyValue('--font-titulo').trim() || 'sans-serif';
  await Promise.all([document.fonts.load(`700 40px ${fam}`), document.fonts.load(`600 40px ${fam}`), document.fonts.load(`500 40px ${fam}`)]).catch(() => {});

  const claro = estilo === 'claro' && !imgs.fundo;
  const tinta = claro ? '#111111' : '#ffffff';
  const suave = claro ? 'rgba(17,17,17,0.65)' : 'rgba(255,255,255,0.72)';

  // ---- Fundo
  if (imgs.fundo) {
    cobrir(c, imgs.fundo, 0, 0, W, H);
    c.fillStyle = 'rgba(0,0,0,0.58)';
    c.fillRect(0, 0, W, H);
  } else if (claro) {
    c.fillStyle = '#f4f2ea';
    c.fillRect(0, 0, W, H);
  } else {
    c.fillStyle = estilo === 'clube' ? d.cores.primaria : d.cores.secundaria;
    c.fillRect(0, 0, W, H);
    const sombra = c.createLinearGradient(0, 0, 0, H);
    sombra.addColorStop(0, estilo === 'clube' ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0)');
    sombra.addColorStop(1, 'rgba(0,0,0,0.78)');
    c.fillStyle = sombra;
    c.fillRect(0, 0, W, H);
    if (estilo === 'noite') {
      c.save();
      c.globalAlpha = 0.5;
      const brilho = c.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, W * 0.95);
      brilho.addColorStop(0, d.cores.primaria);
      brilho.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = brilho;
      c.fillRect(0, 0, W, H);
      c.restore();
    }
  }
  // faixas diagonais decorativas
  c.save();
  c.globalAlpha = claro ? 0.9 : 0.85;
  c.fillStyle = d.cores.destaque;
  c.beginPath();
  c.moveTo(W - 210, 0); c.lineTo(W - 180, 0); c.lineTo(W - 330, 150); c.lineTo(W - 360, 150);
  c.closePath();
  c.fill();
  c.fillStyle = claro ? d.cores.primaria : '#ffffff';
  c.globalAlpha = claro ? 0.9 : 0.25;
  c.beginPath();
  c.moveTo(W - 160, 0); c.lineTo(W - 145, 0); c.lineTo(W - 295, 150); c.lineTo(W - 310, 150);
  c.closePath();
  c.fill();
  c.restore();

  // ---- Cabeçalho
  const M = 56;
  const hCab = formato === 'story' ? 400 : formato === 'feed' ? 290 : 232;
  const topo = formato === 'story' ? 110 : 44;
  const esc = formato === 'quadrado' ? 150 : 190;
  if (imgs.escudo) {
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.4)';
    c.shadowBlur = 24;
    caminhoArredondado(c, M, topo, esc, esc, 30);
    c.fillStyle = '#ffffff';
    c.fill();
    c.restore();
    c.save();
    caminhoArredondado(c, M, topo, esc, esc, 30);
    c.clip();
    cobrir(c, imgs.escudo, M, topo, esc, esc);
    c.restore();
  }
  const tx = M + esc + 34;
  const larg = W - tx - M;
  const k = esc / 190;
  texto(c, 'ESCALAÇÃO', tx, topo + 58 * k, { tam: 60 * k, cor: d.cores.destaque, fam, espaco: 6, max: larg - 120 });
  const confronto = d.mando === 'casa' ? `${d.clube} x ${d.adversario}` : `${d.adversario} x ${d.clube}`;
  texto(c, confronto.toUpperCase(), tx, topo + 122 * k, { tam: 56 * k, cor: tinta, fam, max: larg });
  texto(c, `${dataExtensa(d.dataHora)} · ${horaBR(d.dataHora)}`.toUpperCase(), tx, topo + 162 * k, { tam: 30 * k, peso: 500, cor: suave, fam, max: larg, espaco: 1 });
  const linha3 = [d.local, d.competicao].filter(Boolean).join(' · ');
  if (linha3) texto(c, linha3.toUpperCase(), tx, topo + 198 * k, { tam: 26 * k, peso: 500, cor: suave, fam, max: larg, espaco: 1 });

  // ---- Rodapé (reservas)
  const hRod = formato === 'story' ? 300 : formato === 'feed' ? 180 : 138;
  const yRod = H - hRod;

  // ---- Campo
  const yCampo = hCab;
  const hCampo = yRod - yCampo - 24;
  campo(c, M, yCampo, W - 2 * M, hCampo, claro);
  // selo da formação
  const selo = d.formacao.toUpperCase();
  c.font = `700 30px ${fam}`;
  const ls = c.measureText(selo).width + 36;
  caminhoArredondado(c, W - M - ls - 18, yCampo + 18, ls, 50, 12);
  c.fillStyle = 'rgba(10,10,10,0.75)';
  c.fill();
  texto(c, selo, W - M - 18 - ls / 2, yCampo + 54, { tam: 30, cor: d.cores.destaque, fam, alinhar: 'center' });

  const r = formato === 'story' ? 62 : formato === 'feed' ? 52 : 38;
  const [ax, ay, aw, ah] = [M + r * 1.9, yCampo + r * 1.45, W - 2 * M - r * 3.8, hCampo - r * 3.75];
  // as formações usam y entre ~12 e ~93; estica essa faixa para ocupar o campo inteiro
  const esticar = (y: number) => Math.min(1, Math.max(0, (y - 12) / 81));
  [...d.titulares].sort((a, b) => a.y - b.y).forEach((j) => {
    jogador(c, j, ax + (j.x / 100) * aw, ay + esticar(j.y) * ah, r, d, fam, imgs.fotos.get(j.id) ?? null);
  });

  // ---- Reservas
  texto(c, 'RESERVAS', M, yRod + 34, { tam: 30, cor: d.cores.destaque, fam, espaco: 4 });
  c.fillStyle = d.cores.destaque;
  c.fillRect(M + 170, yRod + 22, W - 2 * M - 170, 3);
  const tam = formato === 'story' ? 34 : 28;
  c.font = `500 ${tam}px ${fam}`;
  let lx = M;
  let ly = yRod + 34 + tam * 1.55;
  const maxY = H - (formato === 'story' ? 90 : 24);
  if (!d.reservas.length) texto(c, '—', M, ly, { tam, peso: 500, cor: suave, fam });
  for (const res of d.reservas) {
    const num = res.numero != null ? `${res.numero} ` : '';
    const nome = res.nome.toUpperCase();
    c.font = `700 ${tam}px ${fam}`;
    const ln = c.measureText(num).width;
    c.font = `500 ${tam}px ${fam}`;
    const total = ln + c.measureText(nome).width + 38;
    if (lx + total > W - M && lx > M) { lx = M; ly += tam * 1.45; }
    if (ly > maxY) break;
    texto(c, num, lx, ly, { tam, cor: d.cores.destaque, fam });
    texto(c, nome, lx + ln, ly, { tam, peso: 500, cor: tinta, fam });
    lx += total;
  }
}

export const canvasParaBlob = (canvas: HTMLCanvasElement, tipo: 'image/png' | 'image/jpeg') =>
  new Promise<Blob>((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Não foi possível gerar a imagem. Verifique se as fotos dos atletas carregaram.'))), tipo, 0.92));
