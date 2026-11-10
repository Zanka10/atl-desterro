-- =====================================================================
-- ATLÉTICO DESTERRO — Sistema de Gestão Esportiva e Financeira
-- Schema completo: tabelas, funções, gatilhos, RLS e storage.
-- Execute este arquivo inteiro no SQL Editor do Supabase (uma única vez).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABELAS BASE
-- ---------------------------------------------------------------------
create table public.configuracoes (
  id int primary key default 1 check (id = 1),
  nome_clube text not null default 'Atlético Desterro',
  cor_primaria text not null default '#15803d',
  cor_secundaria text not null default '#111111',
  cor_destaque text not null default '#e8a13a',
  escudo_url text,
  valor_mensalidade numeric(10,2) not null default 50 check (valor_mensalidade >= 0),
  dia_vencimento int not null default 10 check (dia_vencimento between 1 and 28),
  geracao_automatica boolean not null default true,
  dias_alerta int not null default 5 check (dias_alerta between 0 and 30),
  chave_pix text,
  atualizado_em timestamptz not null default now()
);
insert into public.configuracoes default values;

create table public.atletas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  apelido text,
  foto_url text,
  data_nascimento date,
  telefone text,
  email text,
  numero int check (numero between 0 and 999),
  posicao text not null check (posicao in ('goleiro','zagueiro','lateral','volante','meia','ponta','atacante')),
  posicao_secundaria text check (posicao_secundaria in ('goleiro','zagueiro','lateral','volante','meia','ponta','atacante')),
  pe_dominante text check (pe_dominante in ('direito','esquerdo','ambidestro')),
  data_entrada date default current_date,
  status text not null default 'ativo' check (status in ('ativo','inativo','lesionado','suspenso','afastado')),
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.atletas (status);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text,
  papel text not null default 'atleta' check (papel in ('admin','diretoria','tesoureiro','comissao','atleta')),
  atleta_id uuid references public.atletas(id) on delete set null,
  ativo boolean not null default false,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. FUNÇÕES DE PERMISSÃO
-- ---------------------------------------------------------------------
create function public.hoje_br() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

create function public.meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from profiles where id = auth.uid() and ativo
$$;

create function public.meu_atleta_id() returns uuid
language sql stable security definer set search_path = public as $$
  select atleta_id from profiles where id = auth.uid() and ativo
$$;

create function public.tem_papel(variadic papeis text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_papel() = any(papeis), false)
$$;

create function public.eh_ativo() returns boolean language sql stable security definer set search_path = public as $$
  select public.meu_papel() is not null
$$;
create function public.eh_staff() returns boolean language sql stable security definer set search_path = public as $$
  select public.tem_papel('admin','diretoria','tesoureiro','comissao')
$$;
create function public.eh_financeiro() returns boolean language sql stable security definer set search_path = public as $$
  select public.tem_papel('admin','diretoria','tesoureiro')
$$;
create function public.eh_esportivo() returns boolean language sql stable security definer set search_path = public as $$
  select public.tem_papel('admin','diretoria','comissao')
$$;
create function public.eh_comissao() returns boolean language sql stable security definer set search_path = public as $$
  select public.tem_papel('admin','comissao')
$$;

-- O sistema já possui administrador? (usado pela tela de primeiro acesso)
create function public.sistema_inicializado() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles)
$$;

-- Cria o perfil quando um usuário é criado no Auth.
-- O PRIMEIRO usuário vira administrador. Os demais só ficam ativos quando
-- criados pelo administrador (papel definido em app_metadata, que o próprio
-- usuário não consegue alterar).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_papel text;
  v_atleta uuid;
  v_nome text;
begin
  perform pg_advisory_xact_lock(74201);
  v_nome := coalesce(nullif(trim(new.raw_user_meta_data->>'nome'), ''), split_part(new.email, '@', 1));
  if not exists (select 1 from profiles) then
    insert into profiles (id, nome, email, papel, ativo) values (new.id, v_nome, new.email, 'admin', true);
  else
    v_papel := new.raw_app_meta_data->>'papel';
    v_atleta := nullif(new.raw_app_meta_data->>'atleta_id', '')::uuid;
    insert into profiles (id, nome, email, papel, atleta_id, ativo)
    values (new.id, v_nome, new.email, coalesce(v_papel, 'atleta'), v_atleta, v_papel is not null);
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.tocar_atualizado_em() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
create trigger atletas_atualizado before update on public.atletas for each row execute function public.tocar_atualizado_em();
create trigger config_atualizado before update on public.configuracoes for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------
-- 3. FINANCEIRO
-- ---------------------------------------------------------------------
create table public.atleta_financeiro (
  atleta_id uuid primary key references public.atletas(id) on delete cascade,
  situacao text not null default 'normal' check (situacao in ('normal','isento','negociacao')),
  valor_personalizado numeric(10,2) check (valor_personalizado >= 0),
  observacao text,
  atualizado_em timestamptz not null default now()
);

create table public.mensalidades (
  id uuid primary key default gen_random_uuid(),
  atleta_id uuid not null references public.atletas(id) on delete cascade,
  competencia date not null check (extract(day from competencia) = 1),
  valor numeric(10,2) not null check (valor >= 0),
  vencimento date not null,
  status text not null default 'pendente' check (status in ('pendente','pago','isento','cancelado')),
  pago_em date,
  forma_pagamento text check (forma_pagamento in ('pix','dinheiro','transferencia','outros')),
  comprovante_path text,
  comprovante_enviado_em timestamptz,
  observacao text,
  criado_em timestamptz not null default now(),
  unique (atleta_id, competencia)
);
create index on public.mensalidades (status, vencimento);
create index on public.mensalidades (competencia);

create table public.patrocinadores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  contato text,
  telefone text,
  email text,
  valor numeric(10,2),
  periodicidade text check (periodicidade in ('mensal','anual','unico','permuta')),
  inicio date,
  fim date,
  logo_url text,
  ativo boolean not null default true,
  observacoes text,
  criado_em timestamptz not null default now()
);

create table public.movimentacoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('receita','despesa')),
  categoria text not null,
  descricao text not null check (length(trim(descricao)) > 0),
  valor numeric(12,2) not null check (valor > 0),
  data date not null default public.hoje_br(),
  forma_pagamento text check (forma_pagamento in ('pix','dinheiro','transferencia','outros')),
  status text not null default 'confirmado' check (status in ('confirmado','pendente')),
  responsavel_id uuid references auth.users(id) on delete set null,
  responsavel_nome text,
  anexo_path text,
  mensalidade_id uuid references public.mensalidades(id) on delete set null,
  patrocinador_id uuid references public.patrocinadores(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index on public.movimentacoes (data);
create index on public.movimentacoes (mensalidade_id);

create table public.auditoria (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id uuid,
  acao text not null,
  antes jsonb,
  depois jsonb,
  usuario_id uuid,
  usuario_nome text,
  criado_em timestamptz not null default now()
);
create index on public.auditoria (criado_em desc);

-- Preenche o responsável pelo lançamento automaticamente
create function public.definir_responsavel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.responsavel_id is null then new.responsavel_id := auth.uid(); end if;
  if new.responsavel_nome is null then
    select nome into new.responsavel_nome from profiles where id = new.responsavel_id;
  end if;
  return new;
end $$;
create trigger mov_responsavel before insert on public.movimentacoes
  for each row execute function public.definir_responsavel();

-- Auditoria de movimentações financeiras e mensalidades
create function public.auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  select nome into v_nome from profiles where id = auth.uid();
  if tg_op = 'INSERT' then
    insert into auditoria (tabela, registro_id, acao, depois, usuario_id, usuario_nome)
    values (tg_table_name, new.id, 'INSERT', to_jsonb(new), auth.uid(), v_nome);
    return new;
  elsif tg_op = 'UPDATE' then
    insert into auditoria (tabela, registro_id, acao, antes, depois, usuario_id, usuario_nome)
    values (tg_table_name, new.id, 'UPDATE', to_jsonb(old), to_jsonb(new), auth.uid(), v_nome);
    return new;
  else
    insert into auditoria (tabela, registro_id, acao, antes, usuario_id, usuario_nome)
    values (tg_table_name, old.id, 'DELETE', to_jsonb(old), auth.uid(), v_nome);
    return old;
  end if;
end $$;
create trigger mov_auditoria after insert or update or delete on public.movimentacoes
  for each row execute function public.auditar();
create trigger mens_auditoria after insert or update or delete on public.mensalidades
  for each row execute function public.auditar();

-- Se o lançamento de uma mensalidade for excluído do caixa, a mensalidade volta a ficar pendente
create function public.reabrir_mensalidade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.mensalidade_id is not null then
    update mensalidades set status = 'pendente', pago_em = null, forma_pagamento = null
    where id = old.mensalidade_id and status = 'pago';
  end if;
  return old;
end $$;
create trigger mov_reabrir_mensalidade after delete on public.movimentacoes
  for each row execute function public.reabrir_mensalidade();

-- Gera as cobranças do mês para todos os atletas do elenco (idempotente)
create function public.gerar_mensalidades(p_competencia date default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_comp date;
  v_cfg configuracoes;
  v_qtd int;
begin
  if not public.eh_financeiro() then
    raise exception 'Sem permissão para gerar mensalidades';
  end if;
  v_comp := date_trunc('month', coalesce(p_competencia, public.hoje_br()))::date;
  select * into v_cfg from configuracoes where id = 1;
  insert into mensalidades (atleta_id, competencia, valor, vencimento)
  select a.id, v_comp, coalesce(f.valor_personalizado, v_cfg.valor_mensalidade), v_comp + (v_cfg.dia_vencimento - 1)
  from atletas a
  left join atleta_financeiro f on f.atleta_id = a.id
  where a.status not in ('inativo','afastado')
    and coalesce(f.situacao, 'normal') <> 'isento'
    and coalesce(a.data_entrada, v_comp) < (v_comp + interval '1 month')
  on conflict (atleta_id, competencia) do nothing;
  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;

-- Registra o pagamento e lança a receita no caixa na mesma transação
create function public.registrar_pagamento(
  p_mensalidade uuid, p_data date, p_forma text, p_observacao text default null, p_comprovante text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_m mensalidades;
  v_nome text;
  v_mov uuid;
begin
  if not public.eh_financeiro() then
    raise exception 'Sem permissão para registrar pagamentos';
  end if;
  select * into v_m from mensalidades where id = p_mensalidade for update;
  if not found then raise exception 'Mensalidade não encontrada'; end if;
  if v_m.status = 'pago' then raise exception 'Esta mensalidade já está paga'; end if;
  if p_data > public.hoje_br() then raise exception 'A data do pagamento não pode ser futura'; end if;
  select nome into v_nome from atletas where id = v_m.atleta_id;
  update mensalidades set status = 'pago', pago_em = p_data, forma_pagamento = p_forma,
    observacao = coalesce(p_observacao, observacao), comprovante_path = coalesce(p_comprovante, comprovante_path)
  where id = p_mensalidade;
  if v_m.valor > 0 then
    insert into movimentacoes (tipo, categoria, descricao, valor, data, forma_pagamento, mensalidade_id, anexo_path)
    values ('receita', 'Mensalidades', 'Mensalidade ' || to_char(v_m.competencia, 'MM/YYYY') || ' — ' || v_nome,
            v_m.valor, p_data, p_forma, p_mensalidade, coalesce(p_comprovante, v_m.comprovante_path))
    returning id into v_mov;
  end if;
  return v_mov;
end $$;

-- Estorna o pagamento: remove a receita do caixa e reabre a mensalidade
create function public.estornar_pagamento(p_mensalidade uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_financeiro() then
    raise exception 'Sem permissão para estornar pagamentos';
  end if;
  delete from movimentacoes where mensalidade_id = p_mensalidade;
  update mensalidades set status = 'pendente', pago_em = null, forma_pagamento = null
  where id = p_mensalidade and status = 'pago';
end $$;

-- Atleta anexa comprovante à própria mensalidade
create function public.anexar_comprovante(p_mensalidade uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update mensalidades set comprovante_path = p_path, comprovante_enviado_em = now()
  where id = p_mensalidade and atleta_id = public.meu_atleta_id() and status = 'pendente';
  if not found then raise exception 'Mensalidade não encontrada ou já quitada'; end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. PARTIDAS, CONVOCAÇÃO, ESCALAÇÃO E ESTATÍSTICAS
-- ---------------------------------------------------------------------
create table public.partidas (
  id uuid primary key default gen_random_uuid(),
  adversario text not null check (length(trim(adversario)) > 0),
  data_hora timestamptz not null,
  local text,
  competicao text,
  mando text not null default 'casa' check (mando in ('casa','fora')),
  observacoes text,
  status text not null default 'agendada' check (status in ('agendada','realizada','cancelada','adiada')),
  gols_pro int check (gols_pro >= 0),
  gols_contra int check (gols_contra >= 0),
  temporada int not null,
  formacao text not null default '4-4-2',
  capitao_id uuid references public.atletas(id) on delete set null,
  escalacao_publicada boolean not null default false,
  criado_em timestamptz not null default now()
);
create index on public.partidas (data_hora);

create table public.convocacoes (
  id uuid primary key default gen_random_uuid(),
  partida_id uuid not null references public.partidas(id) on delete cascade,
  atleta_id uuid not null references public.atletas(id) on delete cascade,
  status text not null default 'aguardando' check (status in ('aguardando','confirmado','ausente','lesionado','suspenso')),
  observacao text,
  respondido_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (partida_id, atleta_id)
);

create table public.escalacao (
  id uuid primary key default gen_random_uuid(),
  partida_id uuid not null references public.partidas(id) on delete cascade,
  atleta_id uuid not null references public.atletas(id) on delete cascade,
  tipo text not null check (tipo in ('titular','reserva')),
  slot int not null default 0,
  x numeric(5,2),
  y numeric(5,2),
  funcao text,
  autorizado_por uuid references auth.users(id) on delete set null,
  unique (partida_id, atleta_id)
);

create table public.substituicoes_planejadas (
  id uuid primary key default gen_random_uuid(),
  partida_id uuid not null references public.partidas(id) on delete cascade,
  sai_id uuid not null references public.atletas(id) on delete cascade,
  entra_id uuid not null references public.atletas(id) on delete cascade,
  minuto int check (minuto between 0 and 130),
  observacao text
);

create table public.estatisticas_partida (
  id uuid primary key default gen_random_uuid(),
  partida_id uuid not null references public.partidas(id) on delete cascade,
  atleta_id uuid not null references public.atletas(id) on delete cascade,
  titular boolean not null default false,
  minutos int check (minutos between 0 and 150),
  gols int not null default 0 check (gols >= 0),
  assistencias int not null default 0 check (assistencias >= 0),
  amarelos int not null default 0 check (amarelos between 0 and 2),
  vermelhos int not null default 0 check (vermelhos between 0 and 1),
  unique (partida_id, atleta_id)
);

-- Impede escalar atleta suspenso/indisponível sem autorização de admin/diretoria
create function public.validar_escalacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_conv text;
  v_nome text;
begin
  if auth.uid() is null then return new; end if;
  select status, nome into v_status, v_nome from atletas where id = new.atleta_id;
  select status into v_conv from convocacoes where partida_id = new.partida_id and atleta_id = new.atleta_id;
  if v_status in ('suspenso','lesionado','afastado','inativo') or coalesce(v_conv, '') in ('ausente','lesionado','suspenso') then
    if public.tem_papel('admin','diretoria') then
      new.autorizado_por := coalesce(new.autorizado_por, auth.uid());
    elsif tg_op = 'UPDATE' and old.autorizado_por is not null then
      new.autorizado_por := old.autorizado_por;
    else
      raise exception '% está indisponível e só pode ser escalado com autorização da administração', v_nome;
    end if;
  else
    new.autorizado_por := null;
  end if;
  return new;
end $$;
create trigger escalacao_validar before insert or update on public.escalacao
  for each row execute function public.validar_escalacao();

-- Salva a escalação inteira de forma atômica (respeita RLS de quem chama)
create function public.salvar_escalacao(
  p_partida uuid, p_formacao text, p_capitao uuid, p_itens jsonb, p_subs jsonb, p_publicada boolean
) returns void
language plpgsql set search_path = public as $$
declare
  it jsonb;
begin
  if not public.eh_esportivo() then
    raise exception 'Sem permissão para alterar a escalação';
  end if;
  update partidas set formacao = p_formacao, capitao_id = p_capitao, escalacao_publicada = p_publicada where id = p_partida;
  delete from escalacao where partida_id = p_partida
    and atleta_id not in (select (e->>'atleta_id')::uuid from jsonb_array_elements(p_itens) e);
  for it in select * from jsonb_array_elements(p_itens) loop
    update escalacao set tipo = it->>'tipo', slot = (it->>'slot')::int, x = (it->>'x')::numeric,
      y = (it->>'y')::numeric, funcao = it->>'funcao'
    where partida_id = p_partida and atleta_id = (it->>'atleta_id')::uuid;
    if not found then
      insert into escalacao (partida_id, atleta_id, tipo, slot, x, y, funcao)
      values (p_partida, (it->>'atleta_id')::uuid, it->>'tipo', (it->>'slot')::int,
              (it->>'x')::numeric, (it->>'y')::numeric, it->>'funcao');
    end if;
  end loop;
  delete from substituicoes_planejadas where partida_id = p_partida;
  insert into substituicoes_planejadas (partida_id, sai_id, entra_id, minuto, observacao)
  select p_partida, (s->>'sai_id')::uuid, (s->>'entra_id')::uuid, nullif(s->>'minuto','')::int, s->>'observacao'
  from jsonb_array_elements(coalesce(p_subs, '[]'::jsonb)) s;
end $$;

-- Atleta confirma presença ou informa ausência na própria convocação
create function public.responder_convocacao(p_partida uuid, p_status text, p_observacao text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('confirmado','ausente') then
    raise exception 'Resposta inválida';
  end if;
  update convocacoes set status = p_status, observacao = p_observacao, respondido_em = now()
  where partida_id = p_partida and atleta_id = public.meu_atleta_id()
    and status in ('aguardando','confirmado','ausente');
  if not found then raise exception 'Você não está convocado para esta partida ou não pode responder'; end if;
end $$;

-- ---------------------------------------------------------------------
-- 5. DISCIPLINA, LESÕES E NOTAS DA COMISSÃO
-- ---------------------------------------------------------------------
create table public.ocorrencias (
  id uuid primary key default gen_random_uuid(),
  atleta_id uuid not null references public.atletas(id) on delete cascade,
  partida_id uuid references public.partidas(id) on delete set null,
  tipo text not null check (tipo in ('cartao_amarelo','cartao_vermelho','suspensao','advertencia','outro')),
  data date not null default public.hoje_br(),
  descricao text,
  jogos_suspensao int check (jogos_suspensao >= 0),
  cumprida boolean not null default false,
  criado_em timestamptz not null default now()
);

create table public.lesoes (
  id uuid primary key default gen_random_uuid(),
  atleta_id uuid not null references public.atletas(id) on delete cascade,
  descricao text not null,
  gravidade text check (gravidade in ('leve','moderada','grave')),
  data_lesao date not null default public.hoje_br(),
  previsao_retorno date,
  data_retorno date,
  observacoes text,
  criado_em timestamptz not null default now()
);

create table public.notas_comissao (
  id uuid primary key default gen_random_uuid(),
  atleta_id uuid not null references public.atletas(id) on delete cascade,
  texto text not null,
  autor_nome text,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. RECURSOS ADICIONAIS
-- ---------------------------------------------------------------------
create table public.avisos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  conteudo text not null,
  fixado boolean not null default false,
  autor_nome text,
  criado_em timestamptz not null default now()
);

create table public.eventos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  tipo text not null default 'evento' check (tipo in ('treino','evento','reuniao','outro')),
  data_hora timestamptz not null,
  local text,
  descricao text,
  criado_em timestamptz not null default now()
);

create table public.uniformes (
  id uuid primary key default gen_random_uuid(),
  item text not null,
  numero int,
  tamanho text,
  atleta_id uuid references public.atletas(id) on delete set null,
  status text not null default 'disponivel' check (status in ('disponivel','entregue','extraviado','baixado')),
  data_entrega date,
  observacoes text,
  criado_em timestamptz not null default now()
);

create table public.galeria (
  id uuid primary key default gen_random_uuid(),
  titulo text,
  url text not null,
  partida_id uuid references public.partidas(id) on delete set null,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. VISÕES PARA O PORTAL DO ATLETA (sem dados sensíveis)
-- ---------------------------------------------------------------------
-- Elenco visto pelos colegas: somente dados esportivos.
create view public.atletas_publico as
  select id, nome, apelido, foto_url, numero, posicao, posicao_secundaria, status
  from public.atletas
  where public.eh_ativo();

-- Dados do próprio atleta (sem observações internas).
create view public.meu_atleta as
  select id, nome, apelido, foto_url, data_nascimento, telefone, email, numero, posicao,
         posicao_secundaria, pe_dominante, data_entrada, status
  from public.atletas
  where id = public.meu_atleta_id();

create function public.atualizar_meus_dados(
  p_apelido text, p_telefone text, p_email text, p_foto_url text, p_pe_dominante text, p_data_nascimento date
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update atletas set apelido = p_apelido, telefone = p_telefone, email = p_email,
    foto_url = coalesce(p_foto_url, foto_url), pe_dominante = p_pe_dominante, data_nascimento = p_data_nascimento
  where id = public.meu_atleta_id();
  if not found then raise exception 'Seu usuário não está vinculado a um atleta'; end if;
end $$;

-- ---------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.configuracoes enable row level security;
alter table public.atletas enable row level security;
alter table public.profiles enable row level security;
alter table public.atleta_financeiro enable row level security;
alter table public.mensalidades enable row level security;
alter table public.patrocinadores enable row level security;
alter table public.movimentacoes enable row level security;
alter table public.auditoria enable row level security;
alter table public.partidas enable row level security;
alter table public.convocacoes enable row level security;
alter table public.escalacao enable row level security;
alter table public.substituicoes_planejadas enable row level security;
alter table public.estatisticas_partida enable row level security;
alter table public.ocorrencias enable row level security;
alter table public.lesoes enable row level security;
alter table public.notas_comissao enable row level security;
alter table public.avisos enable row level security;
alter table public.eventos enable row level security;
alter table public.uniformes enable row level security;
alter table public.galeria enable row level security;

-- Configurações: todos os usuários ativos leem; gestão altera
create policy cfg_sel on public.configuracoes for select to authenticated using (public.eh_ativo());
create policy cfg_upd on public.configuracoes for update to authenticated using (public.eh_financeiro()) with check (public.eh_financeiro());

-- Perfis: cada um vê o seu; staff vê todos; só admin altera
create policy prof_sel on public.profiles for select to authenticated using (id = auth.uid() or public.eh_staff());
create policy prof_upd on public.profiles for update to authenticated using (public.tem_papel('admin')) with check (public.tem_papel('admin'));
create policy prof_del on public.profiles for delete to authenticated using (public.tem_papel('admin') and id <> auth.uid());

-- Atletas: somente staff acessa a tabela completa (atletas usam as visões)
create policy atl_sel on public.atletas for select to authenticated using (public.eh_staff());
create policy atl_ins on public.atletas for insert to authenticated with check (public.eh_esportivo());
create policy atl_upd on public.atletas for update to authenticated using (public.eh_esportivo()) with check (public.eh_esportivo());
create policy atl_del on public.atletas for delete to authenticated using (public.tem_papel('admin','diretoria'));

-- Financeiro: restrito a admin/diretoria/tesoureiro; atleta vê só o que é seu
create policy afin_sel on public.atleta_financeiro for select to authenticated using (public.eh_financeiro() or atleta_id = public.meu_atleta_id());
create policy afin_all on public.atleta_financeiro for all to authenticated using (public.eh_financeiro()) with check (public.eh_financeiro());

create policy mens_sel on public.mensalidades for select to authenticated using (public.eh_financeiro() or atleta_id = public.meu_atleta_id());
create policy mens_ins on public.mensalidades for insert to authenticated with check (public.eh_financeiro());
create policy mens_upd on public.mensalidades for update to authenticated using (public.eh_financeiro()) with check (public.eh_financeiro());
create policy mens_del on public.mensalidades for delete to authenticated using (public.eh_financeiro() and status <> 'pago');

create policy mov_all on public.movimentacoes for all to authenticated using (public.eh_financeiro()) with check (public.eh_financeiro());
create policy pat_all on public.patrocinadores for all to authenticated using (public.eh_financeiro()) with check (public.eh_financeiro());
create policy aud_sel on public.auditoria for select to authenticated using (public.eh_financeiro());

-- Partidas e informações esportivas compartilhadas
create policy par_sel on public.partidas for select to authenticated using (public.eh_ativo());
create policy par_all on public.partidas for all to authenticated using (public.eh_esportivo()) with check (public.eh_esportivo());

create policy conv_sel on public.convocacoes for select to authenticated using (public.eh_ativo());
create policy conv_all on public.convocacoes for all to authenticated using (public.eh_esportivo()) with check (public.eh_esportivo());

create policy esc_sel on public.escalacao for select to authenticated using (
  public.eh_staff() or (public.eh_ativo() and exists (select 1 from public.partidas p where p.id = partida_id and p.escalacao_publicada))
);
create policy esc_all on public.escalacao for all to authenticated using (public.eh_esportivo()) with check (public.eh_esportivo());

create policy sub_sel on public.substituicoes_planejadas for select to authenticated using (public.eh_esportivo());
create policy sub_all on public.substituicoes_planejadas for all to authenticated using (public.eh_esportivo()) with check (public.eh_esportivo());

create policy est_sel on public.estatisticas_partida for select to authenticated using (public.eh_ativo());
create policy est_all on public.estatisticas_partida for all to authenticated using (public.eh_esportivo()) with check (public.eh_esportivo());

-- Disciplina: staff esportivo; atleta vê as próprias ocorrências
create policy oco_sel on public.ocorrencias for select to authenticated using (public.eh_esportivo() or atleta_id = public.meu_atleta_id());
create policy oco_all on public.ocorrencias for all to authenticated using (public.eh_esportivo()) with check (public.eh_esportivo());

-- Lesões e notas: acesso restrito à comissão técnica (e admin)
create policy les_all on public.lesoes for all to authenticated using (public.eh_comissao()) with check (public.eh_comissao());
create policy nota_all on public.notas_comissao for all to authenticated using (public.eh_comissao()) with check (public.eh_comissao());

-- Mural, calendário e galeria: todos leem; staff publica
create policy avi_sel on public.avisos for select to authenticated using (public.eh_ativo());
create policy avi_all on public.avisos for all to authenticated using (public.eh_staff()) with check (public.eh_staff());
create policy eve_sel on public.eventos for select to authenticated using (public.eh_ativo());
create policy eve_all on public.eventos for all to authenticated using (public.eh_staff()) with check (public.eh_staff());
create policy gal_sel on public.galeria for select to authenticated using (public.eh_ativo());
create policy gal_all on public.galeria for all to authenticated using (public.eh_staff()) with check (public.eh_staff());

create policy uni_all on public.uniformes for all to authenticated using (public.eh_esportivo()) with check (public.eh_esportivo());

-- ---------------------------------------------------------------------
-- 9. PRIVILÉGIOS
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on function public.sistema_inicializado() to anon;

-- ---------------------------------------------------------------------
-- 10. STORAGE (fotos públicas e documentos privados)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true), ('documentos', 'documentos', false)
on conflict (id) do nothing;

create policy fotos_leitura on storage.objects for select using (bucket_id = 'fotos');
create policy fotos_envio on storage.objects for insert to authenticated with check (
  bucket_id = 'fotos' and (
    public.eh_staff()
    or ((storage.foldername(name))[1] = 'atletas' and (storage.foldername(name))[2] = public.meu_atleta_id()::text)
  )
);
create policy fotos_alteracao on storage.objects for update to authenticated using (bucket_id = 'fotos' and public.eh_staff());
create policy fotos_exclusao on storage.objects for delete to authenticated using (bucket_id = 'fotos' and public.eh_staff());

create policy docs_leitura on storage.objects for select to authenticated using (
  bucket_id = 'documentos' and (
    public.eh_financeiro()
    or ((storage.foldername(name))[1] = 'atletas' and (storage.foldername(name))[2] = public.meu_atleta_id()::text)
  )
);
create policy docs_envio on storage.objects for insert to authenticated with check (
  bucket_id = 'documentos' and (
    public.eh_financeiro()
    or ((storage.foldername(name))[1] = 'atletas' and (storage.foldername(name))[2] = public.meu_atleta_id()::text)
  )
);
create policy docs_exclusao on storage.objects for delete to authenticated using (bucket_id = 'documentos' and public.eh_financeiro());
