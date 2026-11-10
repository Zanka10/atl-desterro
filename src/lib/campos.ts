import type { SupabaseClient } from '@supabase/supabase-js';
import type { Campo } from '@/components/formulario';
import { GRAVIDADE, OPCOES_PE, OPCOES_POSICAO, OPCOES_STATUS_ATLETA, STATUS_PARTIDA, TIPOS_OCORRENCIA, paraOpcoes, type Opcao } from './constants';
import { diaBR, hojeBR } from './format';
import type { Linha, Partida } from './types';

export const CAMPOS_ATLETA: Campo[] = [
  { nome: 'nome', rotulo: 'Nome completo', obrigatorio: true },
  { nome: 'apelido', rotulo: 'Apelido (nome na escalação)' },
  { nome: 'foto_url', rotulo: 'Foto do atleta', tipo: 'imagem', largo: true },
  { nome: 'data_nascimento', rotulo: 'Data de nascimento', tipo: 'data', validar: (v) => (v && String(v) > hojeBR() ? 'A data não pode ser futura.' : undefined) },
  { nome: 'telefone', rotulo: 'Telefone / WhatsApp', tipo: 'tel', placeholder: '(48) 99999-0000' },
  { nome: 'email', rotulo: 'E-mail', tipo: 'email' },
  { nome: 'numero', rotulo: 'Número da camisa', tipo: 'numero', min: 0, max: 999 },
  { nome: 'posicao', rotulo: 'Posição principal', tipo: 'selecao', opcoes: OPCOES_POSICAO, obrigatorio: true },
  { nome: 'posicao_secundaria', rotulo: 'Posição secundária', tipo: 'selecao', opcoes: OPCOES_POSICAO },
  { nome: 'pe_dominante', rotulo: 'Pé dominante', tipo: 'selecao', opcoes: OPCOES_PE },
  { nome: 'data_entrada', rotulo: 'Entrada no clube', tipo: 'data' },
  { nome: 'status', rotulo: 'Status', tipo: 'selecao', opcoes: OPCOES_STATUS_ATLETA, obrigatorio: true },
  { nome: 'observacoes', rotulo: 'Observações', tipo: 'area' },
];

export const camposOcorrencia = (atletas?: Opcao[]): Campo[] => [
  ...(atletas ? [{ nome: 'atleta_id', rotulo: 'Atleta', tipo: 'selecao', opcoes: atletas, obrigatorio: true } as Campo] : []),
  { nome: 'tipo', rotulo: 'Tipo', tipo: 'selecao', opcoes: paraOpcoes(TIPOS_OCORRENCIA), obrigatorio: true },
  { nome: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true },
  { nome: 'jogos_suspensao', rotulo: 'Jogos de suspensão', tipo: 'numero', min: 0, max: 50, mostrar: (v) => v.tipo === 'suspensao' || v.tipo === 'cartao_vermelho' },
  { nome: 'cumprida', rotulo: 'Suspensão', tipo: 'caixa', dica: 'Suspensão já cumprida', mostrar: (v) => v.tipo === 'suspensao' || v.tipo === 'cartao_vermelho' },
  { nome: 'descricao', rotulo: 'Descrição', tipo: 'area' },
];

export const camposLesao = (atletas?: Opcao[]): Campo[] => [
  ...(atletas ? [{ nome: 'atleta_id', rotulo: 'Atleta', tipo: 'selecao', opcoes: atletas, obrigatorio: true } as Campo] : []),
  { nome: 'descricao', rotulo: 'Lesão', obrigatorio: true, placeholder: 'Ex.: Entorse no tornozelo direito' },
  { nome: 'gravidade', rotulo: 'Gravidade', tipo: 'selecao', opcoes: paraOpcoes(GRAVIDADE) },
  { nome: 'data_lesao', rotulo: 'Data da lesão', tipo: 'data', obrigatorio: true },
  { nome: 'previsao_retorno', rotulo: 'Previsão de retorno', tipo: 'data' },
  { nome: 'data_retorno', rotulo: 'Retorno efetivo', tipo: 'data', dica: 'Preencha quando o atleta for liberado.' },
  { nome: 'observacoes', rotulo: 'Observações', tipo: 'area' },
];

/** Ajusta o status do atleta conforme a lesão registrada (lesionado <-> ativo). */
export async function sincronizarLesao(supabase: SupabaseClient, v: Linha, atletaId: string) {
  if (v.data_retorno) await supabase.from('atletas').update({ status: 'ativo' }).eq('id', atletaId).eq('status', 'lesionado');
  else await supabase.from('atletas').update({ status: 'lesionado' }).eq('id', atletaId).eq('status', 'ativo');
}

/** Ajusta o status do atleta conforme a suspensão registrada (suspenso <-> ativo). */
export async function sincronizarSuspensao(supabase: SupabaseClient, v: Linha, atletaId: string) {
  const suspende = v.tipo === 'suspensao' || (v.tipo === 'cartao_vermelho' && Number(v.jogos_suspensao) > 0);
  if (!suspende) return;
  if (v.cumprida) await supabase.from('atletas').update({ status: 'ativo' }).eq('id', atletaId).eq('status', 'suspenso');
  else await supabase.from('atletas').update({ status: 'suspenso' }).eq('id', atletaId).eq('status', 'ativo');
}

export const CAMPOS_PARTIDA: Campo[] = [
  { nome: 'adversario', rotulo: 'Adversário', obrigatorio: true },
  { nome: 'data_hora', rotulo: 'Data e horário (Brasília)', tipo: 'datahora', obrigatorio: true },
  { nome: 'local', rotulo: 'Local', placeholder: 'Campo / estádio' },
  { nome: 'competicao', rotulo: 'Competição', placeholder: 'Amistoso, campeonato…' },
  { nome: 'mando', rotulo: 'Mando de campo', tipo: 'selecao', obrigatorio: true, opcoes: [{ value: 'casa', label: 'Mandante' }, { value: 'fora', label: 'Visitante' }] },
  { nome: 'status', rotulo: 'Situação', tipo: 'selecao', obrigatorio: true, opcoes: paraOpcoes(STATUS_PARTIDA) },
  { nome: 'observacoes', rotulo: 'Observações', tipo: 'area' },
];

/** A temporada é o ano (em Brasília) da data do jogo. */
export const comTemporada = (v: Linha) => ({ ...v, temporada: Number(diaBR(v.data_hora).slice(0, 4)) });

export function resultado(p: Pick<Partida, 'gols_pro' | 'gols_contra'>) {
  if (p.gols_pro == null || p.gols_contra == null) return null;
  return p.gols_pro > p.gols_contra ? 'V' : p.gols_pro < p.gols_contra ? 'D' : 'E';
}

