'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useApp } from '@/components/contexto';
import { FalhaCarregamento, PaginaCrud, ok, useDados } from '@/components/crud';
import { Abas, Avatar, Cabecalho, Carregando, Cartao, Indicador, Selo, TOM_STATUS, Tabela, estiloCampo } from '@/components/ui';
import { camposLesao, camposOcorrencia, sincronizarLesao, sincronizarSuspensao } from '@/lib/campos';
import { GRAVIDADE, OPCOES_STATUS_ATLETA, PAPEIS_COMISSAO, POSICOES, STATUS_ATLETA, TIPOS_OCORRENCIA } from '@/lib/constants';
import { dataBR, hojeBR } from '@/lib/format';
import type { Atleta, StatusAtleta } from '@/lib/types';

type Aba = 'elenco' | 'ocorrencias' | 'lesoes';

export default function Disciplina() {
  const { supabase, pode, sucesso, erro } = useApp();
  const verLesoes = pode(...PAPEIS_COMISSAO);
  const [aba, setAba] = useState<Aba>('elenco');
  const { dados: atletas, recarregar, falha } = useDados<Atleta[]>(async () => ok(await supabase.from('atletas').select('*').order('nome')), [aba]);
  if (falha && !atletas) return <FalhaCarregamento mensagem={falha} aoTentar={recarregar} />;
  if (!atletas) return <Carregando />;

  const opcoes = atletas.map((a) => ({ value: a.id, label: a.nome }));
  const conta = (s: StatusAtleta) => atletas.filter((a) => a.status === s).length;
  const mudarStatus = async (a: Atleta, status: string) => {
    const { error } = await supabase.from('atletas').update({ status }).eq('id', a.id);
    if (error) return erro(error);
    sucesso(`${a.nome} agora está como ${STATUS_ATLETA[status as StatusAtleta].toLowerCase()}.`);
    recarregar();
  };

  return (
    <>
      <Abas ativa={aba} aoMudar={setAba} abas={[
        { id: 'elenco', rotulo: 'Situação do elenco' },
        { id: 'ocorrencias', rotulo: 'Cartões e ocorrências' },
        ...(verLesoes ? [{ id: 'lesoes' as Aba, rotulo: 'Lesões' }] : []),
      ]} />

      {aba === 'elenco' && (
        <>
          <Cabecalho titulo="Controle de elenco" descricao="Situação atual de cada atleta. Suspensos e lesionados ficam bloqueados na escalação." />
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(Object.keys(STATUS_ATLETA) as StatusAtleta[]).map((s) => <Indicador key={s} rotulo={STATUS_ATLETA[s]} valor={conta(s)} />)}
          </div>
          <Cartao>
            <Tabela linhas={atletas} chave={(a) => a.id} colunas={[
              { titulo: 'Atleta', celula: (a) => (
                <Link href={`/atletas/${a.id}`} className="flex items-center gap-3 hover:underline">
                  <Avatar nome={a.nome} foto={a.foto_url} numero={a.numero} tamanho={36} />
                  <span className="font-medium text-zinc-900">{a.nome}</span>
                </Link>
              ) },
              { titulo: 'Posição', celula: (a) => POSICOES[a.posicao].label },
              { titulo: 'Situação', celula: (a) => <Selo tom={TOM_STATUS[a.status]}>{STATUS_ATLETA[a.status]}</Selo> },
              { titulo: 'Alterar', celula: (a) => (
                <select className={`${estiloCampo} !w-auto !py-1.5`} value={a.status} onChange={(e) => mudarStatus(a, e.target.value)} aria-label={`Alterar situação de ${a.nome}`}>
                  {OPCOES_STATUS_ATLETA.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) },
            ]} />
          </Cartao>
        </>
      )}

      {aba === 'ocorrencias' && (
        <PaginaCrud
          titulo="Cartões e ocorrências" descricao="Registro de cartões, suspensões e advertências." tabela="ocorrencias" select="*, atletas(nome)"
          ordem="data" item="Ocorrência" campos={camposOcorrencia(opcoes)} podeEditar padrao={{ data: hojeBR() }}
          textoBusca={(l) => `${l.atletas?.nome ?? ''} ${TIPOS_OCORRENCIA[l.tipo]}`}
          depoisSalvar={(v) => sincronizarSuspensao(supabase, v, v.atleta_id)}
          colunas={[
            { titulo: 'Data', celula: (l) => dataBR(l.data) },
            { titulo: 'Atleta', celula: (l) => <span className="font-medium text-zinc-900">{l.atletas?.nome}</span> },
            { titulo: 'Tipo', celula: (l) => <Selo tom={l.tipo === 'cartao_amarelo' ? 'amarelo' : l.tipo === 'advertencia' || l.tipo === 'outro' ? 'cinza' : 'vermelho'}>{TIPOS_OCORRENCIA[l.tipo]}</Selo> },
            { titulo: 'Suspensão', celula: (l) => (l.jogos_suspensao ? `${l.jogos_suspensao} jogo(s) · ${l.cumprida ? 'cumprida' : 'a cumprir'}` : '—') },
            { titulo: 'Descrição', celula: (l) => l.descricao ?? '—', classe: 'max-w-xs' },
          ]}
        />
      )}

      {aba === 'lesoes' && verLesoes && (
        <PaginaCrud
          titulo="Lesões" descricao="Histórico e previsão de retorno. Acesso restrito à comissão técnica." tabela="lesoes" select="*, atletas(nome)"
          ordem="data_lesao" item="Lesão" campos={camposLesao(opcoes)} podeEditar padrao={{ data_lesao: hojeBR() }}
          textoBusca={(l) => `${l.atletas?.nome ?? ''} ${l.descricao}`}
          depoisSalvar={(v) => sincronizarLesao(supabase, v, v.atleta_id)}
          colunas={[
            { titulo: 'Atleta', celula: (l) => <span className="font-medium text-zinc-900">{l.atletas?.nome}</span> },
            { titulo: 'Lesão', celula: (l) => l.descricao },
            { titulo: 'Gravidade', celula: (l) => (l.gravidade ? GRAVIDADE[l.gravidade] : '—') },
            { titulo: 'Data', celula: (l) => dataBR(l.data_lesao) },
            { titulo: 'Previsão de retorno', celula: (l) => dataBR(l.previsao_retorno) },
            { titulo: 'Situação', celula: (l) => (l.data_retorno ? <Selo tom="verde">Recuperado em {dataBR(l.data_retorno)}</Selo> : <Selo tom="amarelo">Em recuperação</Selo>) },
          ]}
        />
      )}
    </>
  );
}
