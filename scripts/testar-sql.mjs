// Testa o schema em um Postgres embarcado (PGlite), simulando o ambiente do Supabase.
// Uso: npm run test:sql
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '  ok  ' : ' FALHA'} ${msg}`);
  if (!cond) falhas++;
};

// Simulação mínima do Supabase (auth, storage, papéis)
await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text,
    raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema auth, storage to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);

await db.exec(readFileSync(new URL('../supabase/migrations/0001_schema.sql', import.meta.url), 'utf8'));
console.log('Schema aplicado sem erros.\n');

const q = async (sql, params) => (await db.query(sql, params)).rows;
const como = async (uid) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
};
const root = async () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const falha = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

// Usuários
const novoUsuario = async (email, app = {}) =>
  (await q(`insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values ($1, '{"nome":"Fulano"}', $2) returning id`, [email, JSON.stringify(app)]))[0].id;

ok((await q(`select public.sistema_inicializado() v`))[0].v === false, 'sistema começa não inicializado');
const admin = await novoUsuario('admin@x.com');
const [a1, a2, a3] = (await q(`insert into public.atletas (nome, posicao, status, numero) values
  ('Carlos', 'goleiro', 'ativo', 1), ('Bruno', 'zagueiro', 'ativo', 3), ('Diego', 'atacante', 'suspenso', 9) returning id`)).map((r) => r.id);
const comissao = await novoUsuario('tec@x.com', { papel: 'comissao' });
const tesoureiro = await novoUsuario('tes@x.com', { papel: 'tesoureiro' });
const atleta = await novoUsuario('carlos@x.com', { papel: 'atleta', atleta_id: a1 });
const intruso = await novoUsuario('intruso@x.com');

const perfis = Object.fromEntries((await q(`select email, papel, ativo from public.profiles`)).map((p) => [p.email, p]));
ok(perfis['admin@x.com'].papel === 'admin' && perfis['admin@x.com'].ativo, 'primeiro usuário vira administrador');
ok(perfis['intruso@x.com'].ativo === false, 'cadastro avulso fica inativo');
ok(perfis['carlos@x.com'].papel === 'atleta' && perfis['carlos@x.com'].ativo, 'usuário criado pelo admin recebe o papel');

// Tesoureiro: mensalidades e caixa
await como(tesoureiro);
ok((await q(`select public.gerar_mensalidades() n`))[0].n === 3, 'gera mensalidades para o elenco');
ok((await q(`select public.gerar_mensalidades() n`))[0].n === 0, 'geração é idempotente');
const mens = await q(`select id, atleta_id from public.mensalidades order by criado_em`);
const mCarlos = mens.find((m) => m.atleta_id === a1).id;
await q(`select public.registrar_pagamento($1, public.hoje_br(), 'pix')`, [mCarlos]);
ok((await q(`select count(*)::int n, sum(valor)::float v from public.movimentacoes`))[0].v === 50, 'pagamento lança receita no caixa');
ok((await q(`select responsavel_nome from public.movimentacoes`))[0].responsavel_nome === 'Fulano', 'responsável preenchido automaticamente');
ok(!!(await falha(() => q(`select public.registrar_pagamento($1, public.hoje_br(), 'pix')`, [mCarlos]))), 'bloqueia pagamento em duplicidade');
ok(!!(await falha(() => q(`delete from public.mensalidades where id = $1 returning id`, [mCarlos]).then((r) => { if (!r.length) throw new Error('bloqueado'); }))), 'não exclui mensalidade paga');
await q(`select public.estornar_pagamento($1)`, [mCarlos]);
ok((await q(`select count(*)::int n from public.movimentacoes`))[0].n === 0, 'estorno remove a receita');
ok((await q(`select status from public.mensalidades where id = $1`, [mCarlos]))[0].status === 'pendente', 'estorno reabre a mensalidade');
await q(`select public.registrar_pagamento($1, public.hoje_br(), 'dinheiro')`, [mCarlos]);
await q(`delete from public.movimentacoes`);
ok((await q(`select status from public.mensalidades where id = $1`, [mCarlos]))[0].status === 'pendente', 'excluir lançamento reabre a mensalidade');
ok((await q(`select count(*)::int n from public.auditoria`))[0].n >= 8, 'auditoria registra as movimentações');
ok(!!(await falha(() => q(`insert into public.partidas (adversario, data_hora, temporada) values ('X', now(), 2026)`))), 'tesoureiro não cria partida');
ok((await q(`select count(*)::int n from public.lesoes`))[0].n === 0, 'tesoureiro não vê lesões');

// Comissão técnica
await como(comissao);
ok((await q(`select count(*)::int n from public.mensalidades`))[0].n === 0, 'comissão não vê mensalidades');
ok((await q(`select count(*)::int n from public.movimentacoes`))[0].n === 0, 'comissão não vê o caixa');
ok(!!(await falha(() => q(`select public.gerar_mensalidades()`))), 'comissão não gera mensalidades');
const partida = (await q(`insert into public.partidas (adversario, data_hora, temporada) values ('Rival FC', now() + interval '3 days', 2026) returning id`))[0].id;
await q(`insert into public.convocacoes (partida_id, atleta_id, status) values ($1, $2, 'aguardando'), ($1, $3, 'aguardando'), ($1, $4, 'suspenso')`, [partida, a1, a2, a3]);
const itens = (ids) => JSON.stringify(ids.map((id, i) => ({ atleta_id: id, tipo: 'titular', slot: i, x: 50, y: 50, funcao: 'goleiro' })));
await q(`select public.salvar_escalacao($1, '4-4-2', $2, $3::jsonb, '[]'::jsonb, false)`, [partida, a1, itens([a1, a2])]);
ok((await q(`select count(*)::int n from public.escalacao`))[0].n === 2, 'comissão salva escalação');
const erro = await falha(() => q(`select public.salvar_escalacao($1, '4-4-2', $2, $3::jsonb, '[]'::jsonb, false)`, [partida, a1, itens([a1, a2, a3])]));
ok(!!erro && erro.includes('autorização'), 'comissão não escala atleta suspenso');
ok((await q(`select count(*)::int n from public.escalacao`))[0].n === 2, 'escalação anterior preservada após o bloqueio');

await como(admin);
await q(`select public.salvar_escalacao($1, '4-4-2', $2, $3::jsonb, '[]'::jsonb, false)`, [partida, a1, itens([a1, a2, a3])]);
ok((await q(`select count(*)::int n from public.escalacao where autorizado_por is not null`))[0].n === 1, 'admin autoriza atleta suspenso');
await como(comissao);
await q(`select public.salvar_escalacao($1, '4-3-3', $2, $3::jsonb, '[]'::jsonb, false)`, [partida, a1, itens([a3, a1, a2])]);
ok((await q(`select formacao from public.partidas where id = $1`, [partida]))[0].formacao === '4-3-3', 'comissão mantém atleta já autorizado');

// Atleta
await como(atleta);
ok((await q(`select count(*)::int n from public.atletas`))[0].n === 0, 'atleta não acessa a tabela completa de atletas');
ok((await q(`select count(*)::int n from public.atletas_publico`))[0].n === 3, 'atleta vê o elenco (dados esportivos)');
ok((await q(`select nome from public.meu_atleta`))[0]?.nome === 'Carlos', 'atleta vê os próprios dados');
const minhas = await q(`select atleta_id from public.mensalidades`);
ok(minhas.length === 1 && minhas[0].atleta_id === a1, 'atleta vê somente as próprias mensalidades');
ok((await q(`select count(*)::int n from public.movimentacoes`))[0].n === 0, 'atleta não vê o caixa');
ok((await q(`select count(*)::int n from public.escalacao`))[0].n === 0, 'atleta não vê escalação não publicada');
await q(`select public.responder_convocacao($1, 'confirmado')`, [partida]);
ok((await q(`select status from public.convocacoes where atleta_id = $1`, [a1]))[0].status === 'confirmado', 'atleta confirma presença');
ok(!!(await falha(() => q(`update public.convocacoes set status = 'confirmado' where atleta_id = $1 returning id`, [a2]).then((r) => { if (!r.length) throw new Error('bloqueado'); }))), 'atleta não responde por outro');
await q(`select public.anexar_comprovante($1, 'atletas/x/c.pdf')`, [mCarlos]);
const mBruno = mens.find((m) => m.atleta_id === a2).id;
ok(!!(await falha(() => q(`select public.anexar_comprovante($1, 'x')`, [mBruno]))), 'atleta não anexa comprovante em mensalidade alheia');
await q(`select public.atualizar_meus_dados('Carlão', '48999990000', null, null, 'direito', null)`);
ok(!!(await falha(() => q(`update public.profiles set papel = 'admin' where id = $1 returning id`, [atleta]).then((r) => { if (!r.length) throw new Error('bloqueado'); }))), 'atleta não altera o próprio papel');
await como(admin);
await q(`update public.partidas set escalacao_publicada = true where id = $1`, [partida]);
await como(atleta);
ok((await q(`select count(*)::int n from public.escalacao`))[0].n === 3, 'atleta vê escalação publicada');

// Usuário inativo e anônimo
await como(intruso);
for (const t of ['atletas', 'atletas_publico', 'mensalidades', 'movimentacoes', 'partidas', 'configuracoes', 'avisos']) {
  ok((await q(`select count(*)::int n from public.${t}`))[0].n === 0, `usuário inativo não lê ${t}`);
}
await como(null);
ok(!!(await falha(() => q(`select count(*) from public.atletas`))), 'anônimo não acessa tabelas');
ok((await q(`select public.sistema_inicializado() v`))[0].v === true, 'anônimo consulta se o sistema foi inicializado');

// ---------------------------------------------------------------- Taxa por jogo e crédito (migração 0002)
await root();
await db.exec(readFileSync(new URL('../supabase/migrations/0002_taxa_por_jogo.sql', import.meta.url), 'utf8'));
console.log('\nMigração 0002 (taxa por jogo e crédito) aplicada sem erros.\n');
const taxa = async (atletaId, partidaId) => (await q(`select id, valor::float valor, abatido::float abatido, status, forma_pagamento forma, descricao, vencimento::text venc from public.mensalidades where atleta_id = $1 and partida_id = $2`, [atletaId, partidaId]))[0];
const saldo = async (atletaId) => (await q(`select coalesce(sum(valor), 0)::float s from public.creditos where atleta_id = $1`, [atletaId]))[0].s;
const caixa = async () => (await q(`select coalesce(sum(valor), 0)::float s from public.movimentacoes where tipo = 'receita'`))[0].s;
const novaPartida = async (adv, dias) => (await q(`insert into public.partidas (adversario, data_hora, temporada) values ($1, now() + ($2 || ' days')::interval, 2026) returning id`, [adv, String(dias)]))[0].id;

ok((await q(`select count(*)::int n from public.mensalidades where partida_id is null and status = 'pendente'`))[0].n === 0, 'mensalidades pendentes são removidas');
let t1 = await taxa(a1, partida);
const diaJogo = (await q(`select ((data_hora at time zone 'America/Sao_Paulo')::date)::text d from public.partidas where id = $1`, [partida]))[0].d;
ok(t1?.valor === 25 && t1.status === 'pendente' && t1.descricao.startsWith('Jogo x Rival FC'), 'confirmado em jogo já cadastrado recebe taxa de R$ 25');
ok(t1.venc === diaJogo, 'a taxa deve ser paga até a data do jogo');
ok(!(await taxa(a2, partida)), 'convocado aguardando resposta não é cobrado');

// ausência antes de pagar: taxa some, sem crédito
await como(atleta);
await q(`select public.responder_convocacao($1, 'ausente')`, [partida]);
ok(!(await taxa(a1, partida)) && (await saldo(a1)) === 0, 'avisar ausência antes de pagar remove a taxa (sem crédito)');
await q(`select public.responder_convocacao($1, 'confirmado')`, [partida]);
ok((await taxa(a1, partida))?.status === 'pendente', 'confirmar de novo gera a taxa');
ok(!!(await falha(() => q(`select public.aplicar_creditos($1)`, [a1]))), 'atleta não chama funções internas de crédito');
ok(!!(await falha(() => q(`insert into public.creditos (atleta_id, valor, descricao) values ($1, 100, 'x')`, [a1]))), 'atleta não cria crédito para si');

// paga e depois avisa ausência: vira crédito
await como(tesoureiro);
const caixa0 = await caixa();
await q(`select public.registrar_pagamento($1, public.hoje_br(), 'pix')`, [(await taxa(a1, partida)).id]);
ok((await caixa()) - caixa0 === 25, 'pagamento entra no caixa (R$ 25)');
const mov = (await q(`select categoria from public.movimentacoes order by criado_em desc limit 1`))[0];
ok(mov.categoria === 'Taxas de jogo', 'categoria do caixa: "Taxas de jogo"');
await como(atleta);
await q(`select public.responder_convocacao($1, 'ausente')`, [partida]);
t1 = await taxa(a1, partida);
ok(t1.status === 'creditado' && (await saldo(a1)) === 25, 'pagou e não vai ao jogo: R$ 25 viram crédito');
await como(tesoureiro);
ok((await caixa()) - caixa0 === 25, 'o dinheiro continua no caixa');
await como(atleta);
ok((await q(`select count(*)::int n from public.creditos`))[0].n === 1, 'atleta vê o próprio extrato de crédito');

// próximo jogo: crédito abate automaticamente
await como(admin);
const jogo2 = await novaPartida('Segundo FC', 10);
await q(`insert into public.convocacoes (partida_id, atleta_id) values ($1, $2), ($1, $3)`, [jogo2, a1, a2]);
await como(atleta);
await q(`select public.responder_convocacao($1, 'confirmado')`, [jogo2]);
await como(tesoureiro);
let t2 = await taxa(a1, jogo2);
ok(t2.status === 'pago' && t2.forma === 'credito' && t2.abatido === 25, 'próximo jogo é quitado automaticamente com o crédito');
ok((await saldo(a1)) === 0 && (await caixa()) - caixa0 === 25, 'crédito usado zera o saldo, sem novo lançamento no caixa');

// voltou a confirmar o jogo antigo: cobra de novo
await root();
await q(`update public.convocacoes set status = 'confirmado' where partida_id = $1 and atleta_id = $2`, [partida, a1]);
ok((await taxa(a1, partida)).status === 'pendente' && (await saldo(a1)) === 0, 'voltar a confirmar um jogo já creditado gera nova cobrança');
await q(`update public.convocacoes set status = 'ausente' where partida_id = $1 and atleta_id = $2`, [partida, a1]);

// mudança de valor: R$ 30, aplicando às taxas em aberto
await como(admin);
const jogo3 = await novaPartida('Terceiro FC', 15);
await q(`insert into public.convocacoes (partida_id, atleta_id, status) values ($1, $2, 'confirmado'), ($1, $3, 'confirmado')`, [jogo3, a1, a2]);
ok((await taxa(a2, jogo3)).valor === 25, 'taxa gerada com o valor atual (R$ 25)');
await como(tesoureiro);
ok((await q(`select public.alterar_valor_jogo(30, true) n`))[0].n >= 1, 'tesoureiro altera o valor do jogo para R$ 30');
ok((await taxa(a2, jogo3)).valor === 30, 'taxas em aberto de jogos futuros passam para R$ 30');
ok((await taxa(a1, jogo2)).valor === 25, 'taxas já pagas mantêm o valor');
await como(admin);
const jogo4 = await novaPartida('Quarto FC', 20);
await q(`insert into public.convocacoes (partida_id, atleta_id, status) values ($1, $2, 'confirmado')`, [jogo4, a2]);
ok((await taxa(a2, jogo4)).valor === 30, 'novas taxas já saem com R$ 30');
await como(comissao);
ok(!!(await falha(() => q(`select public.alterar_valor_jogo(10, false)`))), 'comissão não altera o valor');

// crédito parcial: R$ 25 de crédito em jogo de R$ 30
await como(tesoureiro);
await q(`select public.ajustar_credito($1, 25, 'teste de crédito')`, [a2]);
const t3 = await taxa(a2, jogo3);
ok(t3.abatido === 25 && t3.status === 'pendente', 'crédito de R$ 25 abate parte da taxa de R$ 30');
const caixa1 = await caixa();
await q(`select public.registrar_pagamento($1, public.hoje_br(), 'dinheiro')`, [t3.id]);
ok((await caixa()) - caixa1 === 5, 'pagamento lança no caixa só a diferença (R$ 5)');
ok(!!(await falha(() => q(`select public.ajustar_credito($1, -50, 'devolução')`, [a2]))), 'não permite retirar mais crédito do que o saldo');

// jogo cancelado: pagos viram crédito, pendentes somem
await como(admin);
await q(`update public.partidas set status = 'cancelada' where id = $1`, [jogo3]);
ok((await taxa(a2, jogo3)).status === 'creditado', 'jogo cancelado: taxa paga vira crédito');
ok((await taxa(a2, jogo4)).status === 'pago' && (await taxa(a2, jogo4)).forma === 'credito', 'e o crédito já quita o próximo jogo em aberto');
ok((await saldo(a2)) === 0, 'saldo após quitar o próximo jogo: R$ 0');
ok(!(await taxa(a1, jogo3)), 'jogo cancelado: taxa não paga é removida');

// estorno de taxa paga com crédito devolve o crédito
await como(tesoureiro);
await q(`select public.estornar_pagamento($1)`, [(await taxa(a2, jogo4)).id]);
ok((await taxa(a2, jogo4)).status === 'pendente' && (await saldo(a2)) === 30, 'estornar pagamento feito com crédito devolve o crédito');

// isento não converte taxas já pagas
await como(admin);
await q(`insert into public.atleta_financeiro (atleta_id, situacao) values ($1, 'isento')`, [a1]);
await como(tesoureiro);
await q(`select public.sincronizar_cobrancas_jogos()`);
ok((await taxa(a1, jogo2)).status === 'pago', 'marcar como isento não mexe nas taxas já pagas');
await como(admin);
const jogo5 = await novaPartida('Quinto FC', 25);
await q(`insert into public.convocacoes (partida_id, atleta_id, status) values ($1, $2, 'confirmado')`, [jogo5, a1]);
ok(!(await taxa(a1, jogo5)), 'atleta isento não é cobrado');

// exclusão de partida paga: vira crédito
await q(`delete from public.atleta_financeiro where atleta_id = $1`, [a1]);
await como(tesoureiro);
await q(`select public.sincronizar_cobrancas_jogos()`);
const t5 = await taxa(a1, jogo5);
await q(`select public.registrar_pagamento($1, public.hoje_br(), 'pix')`, [t5.id]);
await como(admin);
await q(`delete from public.partidas where id = $1`, [jogo5]);
ok((await saldo(a1)) === 30, 'jogo excluído: taxa paga vira crédito');

// atleta não responde depois do início do jogo
const jogoPassado = await novaPartida('Passado FC', -1);
await q(`insert into public.convocacoes (partida_id, atleta_id, status) values ($1, $2, 'confirmado')`, [jogoPassado, a1]);
await como(atleta);
const e = await falha(() => q(`select public.responder_convocacao($1, 'ausente')`, [jogoPassado]));
ok(!!e && e.includes('já começou'), 'atleta não altera a presença depois do início do jogo');
await como(comissao);
await q(`update public.convocacoes set status = 'ausente' where partida_id = $1 and atleta_id = $2`, [jogoPassado, a1]);
await como(tesoureiro);
ok((await taxa(a1, jogoPassado))?.status === 'creditado' && (await saldo(a1)) === 30, 'comissão marca "não compareceu" após o jogo');

await como(intruso);
ok((await q(`select count(*)::int n from public.creditos`))[0].n === 0, 'usuário inativo não vê créditos');

await root();
console.log(falhas ? `\n${falhas} teste(s) falharam.` : '\nTodos os testes passaram.');
process.exit(falhas ? 1 : 0);
