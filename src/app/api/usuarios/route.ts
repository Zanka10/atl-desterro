import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient, perfilDaRequisicao } from '@/lib/supabase/server';

const PAPEIS = ['admin', 'diretoria', 'tesoureiro', 'comissao', 'atleta'];
const SEM_CHAVE = 'Defina SUPABASE_SERVICE_ROLE_KEY no arquivo .env.local para gerenciar usuários.';

async function autorizar() {
  const perfil = await perfilDaRequisicao();
  if (!perfil || perfil.papel !== 'admin') {
    return { erro: NextResponse.json({ erro: 'Apenas administradores podem gerenciar usuários.' }, { status: 403 }) };
  }
  const admin = createAdminClient();
  if (!admin) return { erro: NextResponse.json({ erro: SEM_CHAVE }, { status: 501 }) };
  return { admin, perfil };
}

// Cria um usuário já confirmado, com o papel gravado em app_metadata (não editável pelo próprio usuário).
export async function POST(request: NextRequest) {
  const aut = await autorizar();
  if (!aut.admin) return aut.erro;
  const { nome, email, senha, papel, atleta_id } = await request.json().catch(() => ({}));
  if (!nome?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? '')) {
    return NextResponse.json({ erro: 'Informe nome e e-mail válidos.' }, { status: 400 });
  }
  if (typeof senha !== 'string' || senha.length < 8) {
    return NextResponse.json({ erro: 'A senha deve ter pelo menos 8 caracteres.' }, { status: 400 });
  }
  if (!PAPEIS.includes(papel)) return NextResponse.json({ erro: 'Perfil de acesso inválido.' }, { status: 400 });
  if (papel === 'atleta' && !atleta_id) {
    return NextResponse.json({ erro: 'Selecione o atleta vinculado a este acesso.' }, { status: 400 });
  }

  const { data, error } = await aut.admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password: senha,
    email_confirm: true,
    user_metadata: { nome: nome.trim() },
    app_metadata: { papel, atleta_id: papel === 'atleta' ? atleta_id : '' },
  });
  if (error) {
    const msg = /already.*registered|already exists/i.test(error.message) ? 'Já existe um usuário com este e-mail.' : error.message;
    return NextResponse.json({ erro: msg }, { status: 400 });
  }
  // O Supabase grava o app_metadata logo após inserir o usuário, então o gatilho do banco
  // cria o perfil como inativo. Ajusta o perfil aqui com o papel escolhido pelo administrador.
  const { error: e2 } = await aut.admin.from('profiles')
    .update({ nome: nome.trim(), papel, atleta_id: papel === 'atleta' ? atleta_id : null, ativo: true })
    .eq('id', data.user.id);
  if (e2) return NextResponse.json({ erro: `Usuário criado, mas não foi possível ativá-lo: ${e2.message}` }, { status: 500 });
  return NextResponse.json({ id: data.user.id });
}

export async function DELETE(request: NextRequest) {
  const aut = await autorizar();
  if (!aut.admin) return aut.erro;
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ erro: 'Usuário não informado.' }, { status: 400 });
  if (id === aut.perfil.id) return NextResponse.json({ erro: 'Você não pode excluir o próprio usuário.' }, { status: 400 });
  const { error } = await aut.admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
