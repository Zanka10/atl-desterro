import { redirect } from 'next/navigation';
import { supabaseConfigurado } from '@/lib/supabase/client';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function Inicio() {
  if (!supabaseConfigurado) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: perfil } = await supabase.from('profiles').select('papel').eq('id', user.id).maybeSingle();
  redirect(perfil?.papel === 'atleta' ? '/portal' : '/painel');
}
