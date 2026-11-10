import { NextResponse, type NextRequest } from 'next/server';
import { conferirPin, hashPin } from '@/lib/acesso-atleta';
import { createAdminClient, perfilDaRequisicao } from '@/lib/supabase/server';
import { pinFraco, pinValido } from '@/lib/telefone';

// O próprio atleta troca o PIN (precisa informar o PIN atual).
export async function POST(request: NextRequest) {
  const perfil = await perfilDaRequisicao();
  if (!perfil?.atleta_id) return NextResponse.json({ erro: 'Somente atletas podem trocar o PIN.' }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ erro: 'Servidor não configurado.' }, { status: 501 });
  const { atual, novo } = await request.json().catch(() => ({}));
  if (!pinValido(novo)) return NextResponse.json({ erro: 'O novo PIN deve ter exatamente 4 números.' }, { status: 400 });
  if (pinFraco(novo)) return NextResponse.json({ erro: 'PIN muito fácil (sequência ou números repetidos). Escolha outro.' }, { status: 400 });

  const { data: acesso } = await admin.from('acessos_atleta').select('pin_hash').eq('atleta_id', perfil.atleta_id).maybeSingle();
  if (acesso && !(pinValido(atual) && (await conferirPin(atual, acesso.pin_hash)))) {
    return NextResponse.json({ erro: 'O PIN atual está incorreto.' }, { status: 400 });
  }
  const { error } = await admin.from('acessos_atleta').upsert({
    atleta_id: perfil.atleta_id, pin_hash: await hashPin(novo), tentativas: 0, bloqueado_ate: null,
    definido_em: new Date().toISOString(), definido_por: `${perfil.nome} (o próprio atleta)`,
  });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
