import { redirect } from 'next/navigation';
import { Provedor } from '@/components/contexto';
import { Casca, SemAcesso } from '@/components/casca';
import { createClient } from '@/lib/supabase/server';
import type { Config, Perfil } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle<Perfil>();
  if (!perfil || !perfil.ativo) return <SemAcesso email={user.email ?? ''} />;

  const { data: config } = await supabase.from('configuracoes').select('*').eq('id', 1).maybeSingle<Config>();
  if (!config) return <SemAcesso email={user.email ?? ''} motivo="Não foi possível carregar as configurações do clube. Confirme se o arquivo SQL foi executado no Supabase." />;

  return (
    <Provedor perfil={perfil} config={{ ...config, valor_mensalidade: Number(config.valor_mensalidade), valor_jogo: Number(config.valor_jogo ?? 25) }}>
      <Casca>{children}</Casca>
    </Provedor>
  );
}
