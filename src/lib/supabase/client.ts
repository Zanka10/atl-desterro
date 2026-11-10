import { createBrowserClient } from '@supabase/ssr';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
export const supabaseConfigurado = /^https?:\/\//.test(SUPABASE_URL) && SUPABASE_KEY.length > 20;

let cliente: ReturnType<typeof createBrowserClient> | null = null;
export function createClient() {
  if (!cliente) cliente = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  return cliente;
}
