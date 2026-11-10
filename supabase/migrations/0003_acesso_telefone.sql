-- =====================================================================
-- ATLÉTICO DESTERRO — Acesso do atleta por telefone + PIN
-- O atleta entra no portal com o telefone cadastrado e um PIN de 4 dígitos.
-- O PIN é guardado apenas como hash (scrypt, gerado no servidor) e esta
-- tabela só é acessível pelo servidor (chave service_role): nenhum usuário,
-- nem administrador, lê o PIN pela API.
-- Execute este arquivo inteiro no SQL Editor do Supabase, DEPOIS do 0002.
-- =====================================================================

create table public.acessos_atleta (
  atleta_id uuid primary key references public.atletas(id) on delete cascade,
  pin_hash text not null,
  tentativas int not null default 0,
  bloqueado_ate timestamptz,
  definido_em timestamptz not null default now(),
  definido_por text,
  ultimo_acesso timestamptz
);

alter table public.acessos_atleta enable row level security;
-- Sem políticas: bloqueado para anon e authenticated. Só o servidor acessa.
revoke all on public.acessos_atleta from anon, authenticated;
