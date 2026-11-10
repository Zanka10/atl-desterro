-- =====================================================================
-- ATLÉTICO DESTERRO — Taxa por jogo e crédito do atleta
--
-- * O clube não cobra mensalidade. Cada atleta que CONFIRMA presença em um
--   jogo paga a taxa do jogo (valor configurável; inicial R$ 25,00), com
--   pagamento até a data do jogo.
-- * Se o atleta pagou e não foi ao jogo (avisou ausência, foi retirado da
--   convocação ou o jogo foi cancelado/excluído), o valor pago vira CRÉDITO,
--   usado automaticamente nos próximos jogos.
--
-- Execute este arquivo inteiro no SQL Editor do Supabase, DEPOIS do 0001.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Estrutura
-- ---------------------------------------------------------------------
alter table public.configuracoes
  add column valor_jogo numeric(10,2) not null default 25 check (valor_jogo >= 0);

alter table public.mensalidades
  add column partida_id uuid references public.partidas(id) on delete set null,
  add column descricao text,
  add column abatido numeric(10,2) not null default 0 check (abatido >= 0);
comment on column public.mensalidades.abatido is 'Parte do valor coberta pelo crédito do atleta. Valor a pagar = valor - abatido.';

alter table public.mensalidades drop constraint mensalidades_atleta_id_competencia_key;
alter table public.mensalidades drop constraint mensalidades_status_check;
alter table public.mensalidades add constraint mensalidades_status_check
  check (status in ('pendente','pago','isento','cancelado','creditado'));
alter table public.mensalidades drop constraint mensalidades_forma_pagamento_check;
alter table public.mensalidades add constraint mensalidades_forma_pagamento_check
  check (forma_pagamento in ('pix','dinheiro','transferencia','outros','credito'));

create unique index mensalidades_jogo_unica on public.mensalidades (atleta_id, partida_id)
  where partida_id is not null;
create index on public.mensalidades (partida_id);

-- Extrato de crédito: positivo = crédito recebido, negativo = crédito usado
create table public.creditos (
  id uuid primary key default gen_random_uuid(),
  atleta_id uuid not null references public.atletas(id) on delete cascade,
  valor numeric(10,2) not null check (valor <> 0),
  descricao text not null,
  mensalidade_id uuid references public.mensalidades(id) on delete set null,
  usuario_nome text,
  criado_em timestamptz not null default now()
);
create index on public.creditos (atleta_id);
alter table public.creditos enable row level security;
-- Somente leitura pela API; toda movimentação passa pelas funções abaixo.
create policy cred_sel on public.creditos for select to authenticated
  using (public.eh_financeiro() or atleta_id = public.meu_atleta_id());
-- Escrita direta apenas para o administrador (restauração de backup)
create policy cred_admin on public.creditos for all to authenticated
  using (public.tem_papel('admin')) with check (public.tem_papel('admin'));
grant select, insert, update, delete on public.creditos to authenticated;
create trigger creditos_auditoria after insert or update or delete on public.creditos
  for each row execute function public.auditar();

-- Mensalidades ainda não pagas deixam de valer (as pagas ficam no histórico)
delete from public.mensalidades where status = 'pendente' and partida_id is null;

-- Não existe mais geração de mensalidade
drop function public.gerar_mensalidades(date);

-- ---------------------------------------------------------------------
-- 2. Crédito
-- ---------------------------------------------------------------------
create function public.saldo_credito(p_atleta uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(valor), 0) from creditos where atleta_id = p_atleta
$$;

create function public.lancar_credito(p_atleta uuid, p_valor numeric, p_descricao text, p_mensalidade uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_valor = 0 then return; end if;
  insert into creditos (atleta_id, valor, descricao, mensalidade_id, usuario_nome)
  values (p_atleta, p_valor, p_descricao, p_mensalidade, (select nome from profiles where id = auth.uid()));
end $$;

-- Usa o saldo do atleta para abater as taxas em aberto, da mais antiga para a mais nova.
-- Crédito já está no caixa (foi pago antes), então o abatimento não gera novo lançamento.
create function public.aplicar_creditos(p_atleta uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_saldo numeric;
  v_usar numeric;
  m mensalidades;
begin
  perform pg_advisory_xact_lock(hashtext('credito:' || p_atleta::text));
  v_saldo := saldo_credito(p_atleta);
  if v_saldo <= 0 then return; end if;
  for m in
    select * from mensalidades
    where atleta_id = p_atleta and status = 'pendente' and valor > abatido
    order by vencimento, criado_em
    for update
  loop
    v_usar := least(v_saldo, m.valor - m.abatido);
    perform lancar_credito(p_atleta, -v_usar, 'Usado em: ' || coalesce(m.descricao, 'cobrança'), m.id);
    update mensalidades set abatido = abatido + v_usar,
      status = case when abatido + v_usar >= valor then 'pago' else status end,
      pago_em = case when abatido + v_usar >= valor then public.hoje_br() else pago_em end,
      forma_pagamento = case when abatido + v_usar >= valor then 'credito' else forma_pagamento end
    where id = m.id;
    v_saldo := v_saldo - v_usar;
    exit when v_saldo <= 0;
  end loop;
end $$;

-- A taxa deixou de ser devida (ausência, retirada da convocação, jogo cancelado/excluído):
-- o que foi pago vira crédito; o que não foi pago é removido.
create function public.liberar_cobranca(p_mensalidade uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare m mensalidades;
begin
  select * into m from mensalidades where id = p_mensalidade for update;
  if not found or m.status = 'creditado' then return; end if;
  if m.status = 'pago' then
    perform lancar_credito(m.atleta_id, m.valor, 'Crédito: ' || coalesce(m.descricao, 'cobrança') || ' — ' || p_motivo, m.id);
    update mensalidades set status = 'creditado' where id = m.id;
  else
    if m.abatido > 0 then
      perform lancar_credito(m.atleta_id, m.abatido, 'Devolvido: ' || coalesce(m.descricao, 'cobrança') || ' — ' || p_motivo, m.id);
    end if;
    delete from mensalidades where id = m.id;
  end if;
  perform aplicar_creditos(m.atleta_id);
end $$;

-- ---------------------------------------------------------------------
-- 3. Cobrança automática por jogo
-- ---------------------------------------------------------------------
create function public.sincronizar_cobranca_jogo(p_partida uuid, p_atleta uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_valor numeric;
  v_p partidas;
  v_conv text;
  v_isento boolean;
  v_data date;
  v_desc text;
  m mensalidades;
begin
  select valor_jogo into v_valor from configuracoes where id = 1;
  select * into v_p from partidas where id = p_partida;
  if not found then return; end if;
  select status into v_conv from convocacoes where partida_id = p_partida and atleta_id = p_atleta;
  v_isento := exists (select 1 from atleta_financeiro f where f.atleta_id = p_atleta and f.situacao = 'isento');
  v_data := (v_p.data_hora at time zone 'America/Sao_Paulo')::date;
  v_desc := 'Jogo x ' || v_p.adversario || ' (' || to_char(v_data, 'DD/MM') || ')';
  select * into m from mensalidades where atleta_id = p_atleta and partida_id = p_partida for update;

  -- Atleta não vai ao jogo ou jogo cancelado: libera a taxa (pago vira crédito)
  if v_p.status = 'cancelada' or coalesce(v_conv, '') <> 'confirmado' then
    if m.id is not null then
      perform liberar_cobranca(m.id, case
        when v_p.status = 'cancelada' then 'jogo cancelado'
        when v_conv is null then 'retirado da convocação'
        else 'não compareceu' end);
    end if;
    return;
  end if;

  -- Isento: não cobra; remove apenas o que ainda não foi pago
  if v_isento then
    if m.id is not null and m.status = 'pendente' then
      perform liberar_cobranca(m.id, 'atleta isento');
    end if;
    return;
  end if;

  if m.id is null then
    insert into mensalidades (atleta_id, partida_id, competencia, valor, vencimento, descricao)
    values (p_atleta, p_partida, date_trunc('month', v_data)::date, v_valor, v_data, v_desc);
    perform aplicar_creditos(p_atleta);
  elsif m.status = 'creditado' then
    -- Voltou a confirmar depois de ter virado crédito: cobra de novo (o crédito é reaplicado)
    update mensalidades set status = 'pendente', abatido = 0, pago_em = null, forma_pagamento = null,
      valor = v_valor, vencimento = v_data, competencia = date_trunc('month', v_data)::date, descricao = v_desc
    where id = m.id;
    perform aplicar_creditos(p_atleta);
  elsif m.status = 'pendente'
    and (m.vencimento, m.descricao) is distinct from (v_data, v_desc) then
    update mensalidades set vencimento = v_data, competencia = date_trunc('month', v_data)::date, descricao = v_desc
    where id = m.id;
  end if;
end $$;

create function public.sincronizar_cobrancas_partida(p_partida uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_atleta uuid;
begin
  for v_atleta in
    select atleta_id from convocacoes where partida_id = p_partida
    union select atleta_id from mensalidades where partida_id = p_partida
  loop
    perform sincronizar_cobranca_jogo(p_partida, v_atleta);
  end loop;
end $$;

-- Convocação criada, respondida ou removida
create function public.tg_cobranca_jogo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform sincronizar_cobranca_jogo(old.partida_id, old.atleta_id);
    return old;
  end if;
  perform sincronizar_cobranca_jogo(new.partida_id, new.atleta_id);
  return new;
end $$;
create trigger convocacoes_cobranca after insert or update of status or delete on public.convocacoes
  for each row execute function public.tg_cobranca_jogo();

-- Partida remarcada, cancelada ou com adversário alterado
create function public.tg_partida_cobranca() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform sincronizar_cobrancas_partida(new.id);
  return new;
end $$;
create trigger partidas_cobranca after update of status, data_hora, adversario on public.partidas
  for each row execute function public.tg_partida_cobranca();

-- Partida excluída: o que foi pago vira crédito, o resto é removido
create function public.tg_partida_excluida() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  for v_id in select id from mensalidades where partida_id = old.id loop
    perform liberar_cobranca(v_id, 'jogo excluído');
  end loop;
  return old;
end $$;
create trigger partidas_excluida before delete on public.partidas
  for each row execute function public.tg_partida_excluida();

-- Funções internas: não podem ser chamadas diretamente pela API
revoke execute on function public.saldo_credito(uuid) from public, anon, authenticated;
revoke execute on function public.lancar_credito(uuid, numeric, text, uuid) from public, anon, authenticated;
revoke execute on function public.aplicar_creditos(uuid) from public, anon, authenticated;
revoke execute on function public.liberar_cobranca(uuid, text) from public, anon, authenticated;
revoke execute on function public.sincronizar_cobranca_jogo(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.sincronizar_cobrancas_partida(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Ações do financeiro
-- ---------------------------------------------------------------------
-- Botão "Conferir taxas": reaplica a regra a todas as partidas
create function public.sincronizar_cobrancas_jogos() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_partida uuid;
  v_qtd int;
begin
  if not public.eh_financeiro() then raise exception 'Sem permissão para conferir as cobranças'; end if;
  for v_partida in select id from partidas loop
    perform sincronizar_cobrancas_partida(v_partida);
  end loop;
  select count(*) into v_qtd from mensalidades where partida_id is not null and status = 'pendente';
  return v_qtd;
end $$;

-- Altera o valor da taxa. Opcionalmente atualiza as taxas em aberto de jogos que ainda não aconteceram.
create function public.alterar_valor_jogo(p_valor numeric, p_aplicar_abertas boolean) returns int
language plpgsql security definer set search_path = public as $$
declare
  m mensalidades;
  v_qtd int := 0;
begin
  if not public.eh_financeiro() then raise exception 'Sem permissão para alterar o valor'; end if;
  if p_valor is null or p_valor < 0 then raise exception 'Valor inválido'; end if;
  update configuracoes set valor_jogo = p_valor where id = 1;
  if not p_aplicar_abertas then return 0; end if;
  for m in
    select * from mensalidades
    where status = 'pendente' and partida_id is not null and vencimento >= public.hoje_br() and valor <> p_valor
    for update
  loop
    if m.abatido > p_valor then
      perform lancar_credito(m.atleta_id, m.abatido - p_valor, 'Devolvido: ' || m.descricao || ' — valor do jogo reduzido', m.id);
    end if;
    update mensalidades set valor = p_valor, abatido = least(abatido, p_valor),
      status = case when least(abatido, p_valor) >= p_valor then 'pago' else 'pendente' end,
      pago_em = case when least(abatido, p_valor) >= p_valor then public.hoje_br() else null end,
      forma_pagamento = case when least(abatido, p_valor) >= p_valor then 'credito' else null end
    where id = m.id;
    perform aplicar_creditos(m.atleta_id);
    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end $$;

-- Ajuste manual de crédito (ex.: devolução em dinheiro = valor negativo)
create function public.ajustar_credito(p_atleta uuid, p_valor numeric, p_descricao text) returns numeric
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_financeiro() then raise exception 'Sem permissão para ajustar créditos'; end if;
  if p_valor is null or p_valor = 0 then raise exception 'Informe um valor diferente de zero'; end if;
  if coalesce(trim(p_descricao), '') = '' then raise exception 'Informe o motivo do ajuste'; end if;
  perform pg_advisory_xact_lock(hashtext('credito:' || p_atleta::text));
  if saldo_credito(p_atleta) + p_valor < 0 then
    raise exception 'O atleta tem apenas % de crédito', to_char(saldo_credito(p_atleta), 'FMR$ 999G990D00');
  end if;
  perform lancar_credito(p_atleta, p_valor, 'Ajuste manual: ' || trim(p_descricao));
  if p_valor > 0 then perform aplicar_creditos(p_atleta); end if;
  return saldo_credito(p_atleta);
end $$;

-- Pagamento: lança no caixa apenas o que não foi coberto por crédito
create or replace function public.registrar_pagamento(
  p_mensalidade uuid, p_data date, p_forma text, p_observacao text default null, p_comprovante text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_m mensalidades;
  v_nome text;
  v_mov uuid;
  v_devido numeric;
begin
  if not public.eh_financeiro() then raise exception 'Sem permissão para registrar pagamentos'; end if;
  select * into v_m from mensalidades where id = p_mensalidade for update;
  if not found then raise exception 'Cobrança não encontrada'; end if;
  if v_m.status <> 'pendente' then raise exception 'Esta cobrança não está em aberto'; end if;
  if p_data > public.hoje_br() then raise exception 'A data do pagamento não pode ser futura'; end if;
  if p_forma = 'credito' then raise exception 'Use o saldo de crédito do atleta para pagar com crédito'; end if;
  v_devido := v_m.valor - v_m.abatido;
  select nome into v_nome from atletas where id = v_m.atleta_id;
  update mensalidades set status = 'pago', pago_em = p_data, forma_pagamento = p_forma,
    observacao = coalesce(p_observacao, observacao), comprovante_path = coalesce(p_comprovante, comprovante_path)
  where id = p_mensalidade;
  if v_devido > 0 then
    insert into movimentacoes (tipo, categoria, descricao, valor, data, forma_pagamento, mensalidade_id, anexo_path)
    values ('receita',
            case when v_m.descricao is not null then 'Taxas de jogo' else 'Mensalidades' end,
            coalesce('Taxa — ' || v_m.descricao, 'Mensalidade ' || to_char(v_m.competencia, 'MM/YYYY')) || ' — ' || v_nome,
            v_devido, p_data, p_forma, p_mensalidade, coalesce(p_comprovante, v_m.comprovante_path))
    returning id into v_mov;
  end if;
  return v_mov;
end $$;

-- Estorno: desfaz o pagamento. Se foi pago só com crédito, o crédito volta ao atleta.
create or replace function public.estornar_pagamento(p_mensalidade uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m mensalidades;
begin
  if not public.eh_financeiro() then raise exception 'Sem permissão para estornar pagamentos'; end if;
  select * into m from mensalidades where id = p_mensalidade for update;
  if not found or m.status <> 'pago' then raise exception 'Esta cobrança não está paga'; end if;
  delete from movimentacoes where mensalidade_id = p_mensalidade;
  if m.forma_pagamento = 'credito' and m.abatido > 0 then
    perform lancar_credito(m.atleta_id, m.abatido, 'Estorno: ' || coalesce(m.descricao, 'cobrança'), m.id);
    update mensalidades set abatido = 0 where id = m.id;
  end if;
  update mensalidades set status = 'pendente', pago_em = null, forma_pagamento = null where id = m.id;
end $$;

-- Atleta só responde à convocação até o horário do jogo
create or replace function public.responder_convocacao(p_partida uuid, p_status text, p_observacao text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('confirmado','ausente') then raise exception 'Resposta inválida'; end if;
  if exists (select 1 from partidas where id = p_partida and data_hora <= now()) then
    raise exception 'O jogo já começou. Fale com a comissão técnica para alterar sua presença.';
  end if;
  update convocacoes set status = p_status, observacao = p_observacao, respondido_em = now()
  where partida_id = p_partida and atleta_id = public.meu_atleta_id()
    and status in ('aguardando','confirmado','ausente');
  if not found then raise exception 'Você não está convocado para esta partida ou não pode responder'; end if;
end $$;

grant execute on function public.sincronizar_cobrancas_jogos() to authenticated;
grant execute on function public.alterar_valor_jogo(numeric, boolean) to authenticated;
grant execute on function public.ajustar_credito(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Gera as taxas dos jogos que já estavam cadastrados
-- ---------------------------------------------------------------------
do $$
declare v_partida uuid;
begin
  for v_partida in select id from public.partidas loop
    perform public.sincronizar_cobrancas_partida(v_partida);
  end loop;
end $$;
