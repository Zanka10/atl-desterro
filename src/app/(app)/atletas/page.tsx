'use client';

import { KeyRound, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ModalAcessos } from '@/components/acesso-atleta';
import { useApp } from '@/components/contexto';
import { BuscaTexto, ok, useDados } from '@/components/crud';
import { FormModal } from '@/components/formulario';
import { Avatar, Botao, Cabecalho, Carregando, Cartao, Selo, TOM_STATUS, Vazio, estiloCampo } from '@/components/ui';
import { CAMPOS_ATLETA } from '@/lib/campos';
import { OPCOES_STATUS_ATLETA, ORDEM_POSICOES, POSICOES, STATUS_ATLETA } from '@/lib/constants';
import { hojeBR, idade, telefoneBR } from '@/lib/format';
import type { Atleta, Linha } from '@/lib/types';

export default function Atletas() {
  const { supabase, sucesso } = useApp();
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const [posicao, setPosicao] = useState('');
  const [novo, setNovo] = useState(false);
  const [acessos, setAcessos] = useState(false);
  const { dados, carregando, recarregar } = useDados<Atleta[]>(async () => ok(await supabase.from('atletas').select('*').order('nome')));

  const salvar = async (v: Linha) => {
    ok(await supabase.from('atletas').insert(v).select('id'));
    sucesso('Atleta cadastrado com sucesso.');
    recarregar();
  };

  const termo = busca.trim().toLowerCase();
  const filtrados = (dados ?? []).filter((a) =>
    (!status || a.status === status) && (!posicao || a.posicao === posicao || a.posicao_secundaria === posicao) &&
    (!termo || `${a.nome} ${a.apelido ?? ''} ${a.numero ?? ''}`.toLowerCase().includes(termo)));

  return (
    <>
      <Cabecalho titulo="Atletas" descricao={dados ? `${dados.length} atleta(s) cadastrado(s) · ${dados.filter((a) => a.status === 'ativo').length} ativo(s)` : undefined}>
        <Botao variante="secundario" icone={<KeyRound className="h-4 w-4" />} onClick={() => setAcessos(true)} disabled={!dados?.length}>Acessos ao portal</Botao>
        <Botao icone={<Plus className="h-4 w-4" />} onClick={() => setNovo(true)}>Novo atleta</Botao>
      </Cabecalho>

      <div className="mb-4 flex flex-wrap gap-2">
        <BuscaTexto valor={busca} aoMudar={setBusca} placeholder="Buscar por nome ou número…" />
        <select className={`${estiloCampo} !w-auto`} value={posicao} onChange={(e) => setPosicao(e.target.value)} aria-label="Filtrar por posição">
          <option value="">Todas as posições</option>
          {ORDEM_POSICOES.map((p) => <option key={p} value={p}>{POSICOES[p].plural}</option>)}
        </select>
        <select className={`${estiloCampo} !w-auto`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar por status">
          <option value="">Todos os status</option>
          {OPCOES_STATUS_ATLETA.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {carregando ? <Carregando /> : !dados?.length ? (
        <Cartao><Vazio titulo="Nenhum atleta cadastrado" descricao="Comece cadastrando o elenco do clube." icone={<Users className="h-6 w-6" />}>
          <Botao icone={<Plus className="h-4 w-4" />} onClick={() => setNovo(true)}>Cadastrar primeiro atleta</Botao>
        </Vazio></Cartao>
      ) : !filtrados.length ? <Cartao><Vazio titulo="Nenhum atleta encontrado com esses filtros" /></Cartao> : (
        <div className="space-y-5">
          {ORDEM_POSICOES.map((p) => {
            const grupo = filtrados.filter((a) => a.posicao === p);
            if (!grupo.length) return null;
            return (
              <section key={p}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-600">
                  <span className="h-4 w-1 rounded bg-primary" /> {POSICOES[p].plural} <span className="font-normal text-zinc-400">({grupo.length})</span>
                </h2>
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {grupo.map((a) => (
                    <Link key={a.id} href={`/atletas/${a.id}`} className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition hover:border-primary/50 hover:shadow">
                      <Avatar nome={a.nome} foto={a.foto_url} numero={a.numero} tamanho={48} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-zinc-900">{a.nome}</p>
                        <p className="truncate text-xs text-zinc-500">
                          {POSICOES[a.posicao].label}{a.posicao_secundaria ? ` / ${POSICOES[a.posicao_secundaria].label}` : ''}
                          {idade(a.data_nascimento) != null ? ` · ${idade(a.data_nascimento)} anos` : ''}
                        </p>
                        <p className="truncate text-xs text-zinc-400">{telefoneBR(a.telefone)}</p>
                      </div>
                      <Selo tom={TOM_STATUS[a.status]}>{STATUS_ATLETA[a.status]}</Selo>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {acessos && dados && <ModalAcessos aberto atletas={dados} aoFechar={() => setAcessos(false)} />}
      <FormModal aberto={novo} titulo="Novo atleta" campos={CAMPOS_ATLETA} inicial={{ status: 'ativo', data_entrada: hojeBR() }} aoSalvar={salvar} aoFechar={() => setNovo(false)} pasta="atletas" />
    </>
  );
}
