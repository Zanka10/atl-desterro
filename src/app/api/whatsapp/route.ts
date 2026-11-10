import { NextResponse, type NextRequest } from 'next/server';
import { perfilDaRequisicao } from '@/lib/supabase/server';

const configurado = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);

export async function GET() {
  const perfil = await perfilDaRequisicao();
  return NextResponse.json({ configurado: !!perfil && perfil.papel !== 'atleta' && configurado() });
}

// Envio real pela WhatsApp Business Cloud API (Meta). Só funciona com as credenciais configuradas.
// Observação: texto livre só é entregue dentro da janela de 24h de atendimento; fora dela a Meta
// exige modelos (templates) aprovados.
export async function POST(request: NextRequest) {
  const perfil = await perfilDaRequisicao();
  if (!perfil || perfil.papel === 'atleta') return NextResponse.json({ erro: 'Sem permissão.' }, { status: 403 });
  if (!configurado()) return NextResponse.json({ erro: 'WhatsApp Business API não configurada.' }, { status: 501 });
  const { tel, msg } = await request.json().catch(() => ({}));
  let numero = String(tel ?? '').replace(/\D/g, '');
  if (numero.length >= 10 && numero.length <= 11) numero = '55' + numero;
  if (numero.length < 12 || typeof msg !== 'string' || !msg.trim()) {
    return NextResponse.json({ erro: 'Telefone ou mensagem inválidos.' }, { status: 400 });
  }

  const r = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: numero, type: 'text', text: { body: msg.slice(0, 4000) } }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return NextResponse.json({ erro: d?.error?.message ?? 'O WhatsApp recusou o envio.' }, { status: 502 });
  return NextResponse.json({ ok: true, id: d?.messages?.[0]?.id });
}
