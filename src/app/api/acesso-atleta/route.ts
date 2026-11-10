import { NextResponse, type NextRequest } from 'next/server';
import { atletasPorTelefone, gerarPin, hashPin } from '@/lib/acesso-atleta';
import { createAdminClient, perfilDaRequisicao } from '@/lib/supabase/server';
import { chaveTelefone, pinFraco, pinValido } from '@/lib/telefone';

const PAPEIS = ['admin', 'diretoria', 'comissao'];

async function autorizar() {
  const perfil = await perfilDaRequisicao();
  if (!perfil || !PAPEIS.includes(perfil.papel)) return { erro: NextResponse.json({ erro: 'Sem permissão para gerenciar o acesso dos atletas.' }, { status: 403 }) };
  const admin = createAdminClient();
  if (!admin) return { erro: NextResponse.json({ erro: 'Defina SUPABASE_SERVICE_ROLE_KEY no servidor.' }, { status: 501 }) };
  return { admin, perfil };
}

// Situação do acesso de cada atleta (nunca devolve o PIN).
export async function GET() {
  const aut = await autorizar();
  if (!aut.admin) return aut.erro;
  const { data, error } = await aut.admin.from('acessos_atleta').select('atleta_id, definido_em, definido_por, ultimo_acesso, bloqueado_ate');
  if (error) return NextResponse.json({ erro: /does not exist|schema cache/.test(error.message) ? 'Rode o script 0003_acesso_telefone.sql no Supabase.' : error.message }, { status: 500 });
  return NextResponse.json({ acessos: data });
}

// Define (ou gera) o PIN de um atleta. Devolve o PIN uma única vez, para ser enviado ao atleta.
export async function POST(request: NextRequest) {
  const aut = await autorizar();
  if (!aut.admin) return aut.erro;
  const { atleta_id, pin: informado } = await request.json().catch(() => ({}));
  if (typeof atleta_id !== 'string') return NextResponse.json({ erro: 'Atleta não informado.' }, { status: 400 });
  if (informado != null && informado !== '') {
    if (!pinValido(informado)) return NextResponse.json({ erro: 'O PIN deve ter exatamente 4 números.' }, { status: 400 });
    if (pinFraco(informado)) return NextResponse.json({ erro: 'PIN muito fácil (sequência ou números repetidos). Escolha outro.' }, { status: 400 });
  }

  const { data: atleta } = await aut.admin.from('atletas').select('id, nome, telefone, status').eq('id', atleta_id).maybeSingle();
  if (!atleta) return NextResponse.json({ erro: 'Atleta não encontrado.' }, { status: 404 });
  if (!chaveTelefone(atleta.telefone)) return NextResponse.json({ erro: `Cadastre o telefone de ${atleta.nome} com DDD antes de criar o acesso.` }, { status: 400 });
  const mesmos = (await atletasPorTelefone(aut.admin, atleta.telefone)).filter((a) => a.id !== atleta.id && a.status !== 'inativo');
  if (mesmos.length) return NextResponse.json({ erro: `O telefone de ${atleta.nome} também está cadastrado para ${mesmos.map((a) => a.nome).join(', ')}. Corrija antes de criar o acesso.` }, { status: 409 });

  const pin = informado || gerarPin();
  const { error } = await aut.admin.from('acessos_atleta').upsert({
    atleta_id, pin_hash: await hashPin(pin), tentativas: 0, bloqueado_ate: null, definido_em: new Date().toISOString(), definido_por: aut.perfil.nome,
  });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ pin, telefone: atleta.telefone, nome: atleta.nome });
}

// Remove o acesso por telefone (o atleta não consegue mais entrar com o PIN).
export async function DELETE(request: NextRequest) {
  const aut = await autorizar();
  if (!aut.admin) return aut.erro;
  const id = request.nextUrl.searchParams.get('atleta_id');
  if (!id) return NextResponse.json({ erro: 'Atleta não informado.' }, { status: 400 });
  const { error } = await aut.admin.from('acessos_atleta').delete().eq('atleta_id', id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
