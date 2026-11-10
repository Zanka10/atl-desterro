import { NextResponse, type NextRequest } from 'next/server';
import { perfilDaRequisicao } from '@/lib/supabase/server';

export const maxDuration = 120;

export async function GET() {
  return NextResponse.json({ configurado: !!process.env.OPENAI_API_KEY });
}

// Gera, com IA, o FUNDO artístico da arte de escalação. Nomes, números, fotos e escudo
// são desenhados pelo sistema por cima do fundo, para que saiam sempre corretos.
export async function POST(request: NextRequest) {
  const perfil = await perfilDaRequisicao();
  if (!perfil || !['admin', 'diretoria', 'comissao'].includes(perfil.papel)) {
    return NextResponse.json({ erro: 'Sem permissão.' }, { status: 403 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ erro: 'Geração por IA não configurada. Defina OPENAI_API_KEY no .env.local.' }, { status: 501 });
  }
  const { formato, cores } = await request.json().catch(() => ({}));
  const tamanho = formato === 'quadrado' ? '1024x1024' : '1024x1536';
  const prompt =
    'Fundo artístico para arte de escalação de um time de futebol em dia de jogo. ' +
    'Estádio à noite com refletores, fumaça e textura de gramado, clima épico e profissional. ' +
    `Paleta dominante: ${String(cores || 'verde, preto e dourado').slice(0, 80)}. ` +
    'Composição escura e limpa, com o centro livre para sobrepor informações. ' +
    'Sem pessoas, sem jogadores, sem texto, sem letras, sem números, sem logotipos, sem escudos.';

  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', prompt, size: tamanho, n: 1 }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return NextResponse.json({ erro: d?.error?.message ?? 'O serviço de IA recusou a geração.' }, { status: 502 });
  const item = d?.data?.[0];
  if (item?.b64_json) return NextResponse.json({ imagem: `data:image/png;base64,${item.b64_json}` });
  if (item?.url) {
    const img = await fetch(item.url);
    const b64 = Buffer.from(await img.arrayBuffer()).toString('base64');
    return NextResponse.json({ imagem: `data:image/png;base64,${b64}` });
  }
  return NextResponse.json({ erro: 'O serviço de IA não devolveu uma imagem.' }, { status: 502 });
}
