import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Recebe os links enviados por e-mail (confirmação de cadastro e recuperação de senha).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const tipo = searchParams.get('type') as EmailOtpType | null;
  const destino = searchParams.get('next');
  const proximo = destino && destino.startsWith('/') && !destino.startsWith('//') ? destino : '/';
  const supabase = await createClient();

  let erro = true;
  if (code) erro = !!(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && tipo) erro = !!(await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash })).error;

  return NextResponse.redirect(erro ? `${origin}/login?erro=link` : `${origin}${proximo}`);
}
