import { NextResponse, type NextRequest } from 'next/server';
import { BLOQUEIO_MIN, MAX_TENTATIVAS, atletasPorTelefone, conferirPin, garantirUsuarioAtleta } from '@/lib/acesso-atleta';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { pinValido } from '@/lib/telefone';

const INCORRETO = 'Telefone ou PIN incorretos.';
const espera = () => new Promise((r) => setTimeout(r, 400 + Math.random() * 300));

// Login do atleta com telefone + PIN. Abre a sessão do Supabase no servidor (cookies),
// sem senha e sem envio de e-mail.
export async function POST(request: NextRequest) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ erro: 'Acesso por telefone indisponível: falta configurar o servidor.' }, { status: 501 });
  const { telefone, pin } = await request.json().catch(() => ({}));
  if (typeof telefone !== 'string' || !pinValido(pin)) return NextResponse.json({ erro: 'Informe o telefone com DDD e o PIN de 4 dígitos.' }, { status: 400 });

  const atletas = (await atletasPorTelefone(admin, telefone)).filter((a) => a.status !== 'inativo');
  if (atletas.length > 1) {
    return NextResponse.json({ erro: 'Este telefone está cadastrado para mais de um atleta. Fale com a comissão técnica.' }, { status: 409 });
  }
  const atleta = atletas[0];
  const { data: acesso } = atleta
    ? await admin.from('acessos_atleta').select('*').eq('atleta_id', atleta.id).maybeSingle()
    : { data: null };
  if (!atleta || !acesso) {
    await espera();
    return NextResponse.json({ erro: INCORRETO }, { status: 401 });
  }
  if (acesso.bloqueado_ate && new Date(acesso.bloqueado_ate) > new Date()) {
    const min = Math.ceil((new Date(acesso.bloqueado_ate).getTime() - Date.now()) / 60000);
    return NextResponse.json({ erro: `Muitas tentativas erradas. Tente de novo em ${min} minuto(s) ou peça um novo PIN à comissão.` }, { status: 429 });
  }
  if (!(await conferirPin(pin, acesso.pin_hash))) {
    const tentativas = acesso.tentativas + 1;
    const bloquear = tentativas >= MAX_TENTATIVAS;
    await admin.from('acessos_atleta').update({
      tentativas: bloquear ? 0 : tentativas,
      bloqueado_ate: bloquear ? new Date(Date.now() + BLOQUEIO_MIN * 60000).toISOString() : null,
    }).eq('atleta_id', atleta.id);
    await espera();
    return NextResponse.json({
      erro: bloquear ? `PIN incorreto ${MAX_TENTATIVAS} vezes. Acesso bloqueado por ${BLOQUEIO_MIN} minutos.` : INCORRETO,
    }, { status: bloquear ? 429 : 401 });
  }

  try {
    const email = await garantirUsuarioAtleta(admin, atleta);
    const { data: link, error: e1 } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (e1) throw e1;
    const supabase = await createClient();
    const { error: e2 } = await supabase.auth.verifyOtp({ type: 'email', token_hash: link.properties.hashed_token });
    if (e2) throw e2;
    await admin.from('acessos_atleta').update({ tentativas: 0, bloqueado_ate: null, ultimo_acesso: new Date().toISOString() }).eq('atleta_id', atleta.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ erro: `Não foi possível entrar: ${(e as Error).message}` }, { status: 500 });
  }
}
