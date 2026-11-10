// Uso exclusivo no servidor (rotas de API): manipula hash de PIN e a chave service_role.
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomInt, scrypt as scryptCb, timingSafeEqual, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { chaveTelefone, pinFraco } from './telefone';

const scrypt = promisify(scryptCb) as (senha: string, sal: Buffer, tamanho: number) => Promise<Buffer>;

export const MAX_TENTATIVAS = 5;
export const BLOQUEIO_MIN = 15;

export async function hashPin(pin: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await scrypt(pin, sal, 32);
  return `scrypt$${sal.toString('hex')}$${hash.toString('hex')}`;
}

export async function conferirPin(pin: string, guardado: string): Promise<boolean> {
  const [alg, salHex, hashHex] = guardado.split('$');
  if (alg !== 'scrypt' || !salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  const calculado = await scrypt(pin, Buffer.from(salHex, 'hex'), esperado.length);
  return timingSafeEqual(esperado, calculado);
}

/** PIN aleatório de 4 dígitos, evitando sequências e repetições óbvias. */
export function gerarPin(): string {
  let pin: string;
  do pin = String(randomInt(0, 10000)).padStart(4, '0');
  while (pinFraco(pin));
  return pin;
}

type AtletaTel = { id: string; nome: string; telefone: string | null; status: string };

/** Encontra o(s) atleta(s) com o telefone informado. */
export async function atletasPorTelefone(admin: SupabaseClient, telefone: string): Promise<AtletaTel[]> {
  const chave = chaveTelefone(telefone);
  if (!chave) return [];
  const { data, error } = await admin.from('atletas').select('id, nome, telefone, status').not('telefone', 'is', null);
  if (error) throw new Error(error.message);
  return (data as AtletaTel[]).filter((a) => chaveTelefone(a.telefone) === chave);
}

/** E-mail técnico (nunca usado para envio) do usuário de portal criado para o atleta. */
export const emailTecnico = (atletaId: string) => `atleta-${atletaId}@atletico-desterro-chi.vercel.app`;

/**
 * Garante que o atleta tenha um usuário de portal ativo e devolve o e-mail desse usuário.
 * Reaproveita o usuário existente, se o atleta já tiver um acesso por e-mail.
 */
export async function garantirUsuarioAtleta(admin: SupabaseClient, atleta: { id: string; nome: string }): Promise<string> {
  const { data: perfil } = await admin.from('profiles').select('id, email, ativo, papel').eq('atleta_id', atleta.id).limit(1).maybeSingle();
  if (perfil?.email) {
    if (!perfil.ativo || perfil.papel !== 'atleta') {
      // Reativa apenas perfis de atleta; nunca rebaixa um usuário da gestão vinculado ao atleta.
      if (perfil.papel === 'atleta') await admin.from('profiles').update({ ativo: true }).eq('id', perfil.id);
    }
    return perfil.email;
  }
  const email = emailTecnico(atleta.id);
  const { data, error } = await admin.auth.admin.createUser({
    email, email_confirm: true, password: randomBytes(24).toString('base64url'),
    user_metadata: { nome: atleta.nome }, app_metadata: { papel: 'atleta', atleta_id: atleta.id },
  });
  if (error && !/already.*registered|already exists/i.test(error.message)) throw new Error(error.message);
  // O Supabase grava o papel logo depois de criar o usuário; por isso o perfil é ajustado aqui.
  const filtro = data?.user?.id ? { coluna: 'id', valor: data.user.id } : { coluna: 'email', valor: email };
  const r = await admin.from('profiles').update({ papel: 'atleta', atleta_id: atleta.id, ativo: true, nome: atleta.nome }).eq(filtro.coluna, filtro.valor).select('id');
  if (r.error || !r.data?.length) throw new Error('Não foi possível ativar o acesso do atleta.');
  return email;
}
