'use client';

import { KeyRound, Plus } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/components/contexto';
import { FalhaCarregamento, AcoesLinha, ok, useDados } from '@/components/crud';
import { FormModal, type Campo } from '@/components/formulario';
import { Botao, BotaoIcone, Cabecalho, Carregando, Cartao, Selo, Tabela } from '@/components/ui';
import { OPCOES_PAPEL, PAPEIS } from '@/lib/constants';
import { dataBR } from '@/lib/format';
import type { Atleta, Linha, Perfil } from '@/lib/types';

const DESCRICOES: Record<string, string> = {
  admin: 'Acesso total ao sistema.',
  diretoria: 'Atletas, financeiro, relatórios e gestão geral.',
  tesoureiro: 'Caixa, receitas, despesas, taxas de jogo e inadimplência.',
  comissao: 'Elenco, convocações, escalações e estatísticas.',
  atleta: 'Apenas o portal individual.',
};

export default function Usuarios() {
  const { supabase, perfil, sucesso, erro, confirmar } = useApp();
  const [modal, setModal] = useState<{ item?: Perfil } | null>(null);
  const { dados, carregando, recarregar, falha } = useDados<{ perfis: Perfil[]; atletas: Pick<Atleta, 'id' | 'nome'>[] }>(async () => {
    const [p, a] = await Promise.all([supabase.from('profiles').select('*').order('nome'), supabase.from('atletas').select('id, nome').order('nome')]);
    return { perfis: ok(p), atletas: ok(a) };
  });
  if (falha && !dados) return <FalhaCarregamento mensagem={falha} aoTentar={recarregar} />;
  if (carregando || !dados) return <Carregando />;

  const opcoesAtleta = dados.atletas.map((a) => ({ value: a.id, label: a.nome }));
  const vinculo: Campo = { nome: 'atleta_id', rotulo: 'Atleta vinculado', tipo: 'selecao', opcoes: opcoesAtleta, largo: true, mostrar: (v) => v.papel === 'atleta',
    validar: (v, t) => (t.papel === 'atleta' && !v ? 'Selecione o atleta que usará este acesso.' : undefined) };
  const papel: Campo = { nome: 'papel', rotulo: 'Perfil de acesso', tipo: 'selecao', opcoes: OPCOES_PAPEL.map((o) => ({ ...o, label: `${o.label} — ${DESCRICOES[o.value]}` })), obrigatorio: true, largo: true };
  const camposNovo: Campo[] = [
    { nome: 'nome', rotulo: 'Nome', obrigatorio: true, largo: true },
    { nome: 'email', rotulo: 'E-mail de acesso', tipo: 'email', obrigatorio: true },
    { nome: 'senha', rotulo: 'Senha provisória', tipo: 'senha', obrigatorio: true, dica: 'Mínimo de 8 caracteres.' },
    papel, vinculo,
  ];
  const camposEdicao: Campo[] = [
    { nome: 'nome', rotulo: 'Nome', obrigatorio: true, largo: true }, papel, vinculo,
    { nome: 'ativo', rotulo: 'Acesso', tipo: 'caixa', dica: 'Usuário ativo (pode entrar no sistema)' },
  ];

  const salvar = async (v: Linha) => {
    if (modal?.item) {
      if (modal.item.id === perfil.id && (v.papel !== 'admin' || !v.ativo)) throw new Error('Você não pode remover o próprio acesso de administrador.');
      ok(await supabase.from('profiles').update({ ...v, atleta_id: v.papel === 'atleta' ? v.atleta_id : null }).eq('id', modal.item.id).select('id'));
      sucesso('Usuário atualizado.');
    } else {
      const r = await fetch('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro);
      sucesso('Usuário criado. Informe o e-mail e a senha provisória a ele.');
    }
    await recarregar();
  };

  const excluir = async (u: Perfil) => {
    if (!(await confirmar({ titulo: 'Excluir usuário', perigo: true, textoConfirmar: 'Excluir', mensagem: <>O acesso de <strong>{u.nome}</strong> ({u.email}) será removido definitivamente.</> }))) return;
    const r = await fetch(`/api/usuarios?id=${u.id}`, { method: 'DELETE' });
    const d = await r.json();
    if (!r.ok) return erro(d.erro);
    sucesso('Usuário excluído.');
    recarregar();
  };

  const redefinir = async (u: Perfil) => {
    if (!u.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(u.email, { redirectTo: `${location.origin}/auth/callback?next=/redefinir-senha` });
    if (error) return erro(error);
    sucesso(`Link de redefinição de senha enviado para ${u.email}.`);
  };

  return (
    <>
      <Cabecalho titulo="Usuários e permissões" descricao="Quem acessa o sistema e o que cada perfil pode fazer.">
        <Botao icone={<Plus className="h-4 w-4" />} onClick={() => setModal({})}>Novo usuário</Botao>
      </Cabecalho>
      <Cartao>
        <Tabela linhas={dados.perfis} chave={(u) => u.id} colunas={[
          { titulo: 'Usuário', celula: (u) => <div><p className="font-medium text-zinc-900">{u.nome}{u.id === perfil.id && <span className="ml-1.5 text-xs font-normal text-zinc-400">(você)</span>}</p><p className="text-xs text-zinc-500">{u.email}</p></div> },
          { titulo: 'Perfil', celula: (u) => <Selo tom={u.papel === 'admin' ? 'roxo' : u.papel === 'atleta' ? 'cinza' : 'azul'}>{PAPEIS[u.papel]}</Selo> },
          { titulo: 'Atleta vinculado', celula: (u) => dados.atletas.find((a) => a.id === u.atleta_id)?.nome ?? '—' },
          { titulo: 'Situação', celula: (u) => <Selo tom={u.ativo ? 'verde' : 'amarelo'}>{u.ativo ? 'Ativo' : 'Aguardando liberação'}</Selo> },
          { titulo: 'Criado em', celula: (u) => dataBR(u.criado_em) },
          { titulo: '', celula: (u) => (
            <AcoesLinha aoEditar={() => setModal({ item: u })} aoExcluir={u.id !== perfil.id ? () => excluir(u) : undefined}>
              <BotaoIcone titulo="Enviar link de redefinição de senha" onClick={() => redefinir(u)}><KeyRound className="h-4 w-4" /></BotaoIcone>
            </AcoesLinha>
          ) },
        ]} />
      </Cartao>
      <Cartao titulo="Perfis de acesso" className="mt-4">
        <dl className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          {OPCOES_PAPEL.map((o) => <div key={o.value}><dt className="text-sm font-semibold text-zinc-900">{o.label}</dt><dd className="text-xs text-zinc-500">{DESCRICOES[o.value]}</dd></div>)}
        </dl>
      </Cartao>
      {modal && <FormModal aberto titulo={modal.item ? 'Editar usuário' : 'Novo usuário'} campos={modal.item ? camposEdicao : camposNovo} inicial={modal.item ?? { papel: 'comissao' }} aoSalvar={salvar} aoFechar={() => setModal(null)} />}
    </>
  );
}
