export type Papel = 'admin' | 'diretoria' | 'tesoureiro' | 'comissao' | 'atleta';
export type Posicao = 'goleiro' | 'zagueiro' | 'lateral' | 'volante' | 'meia' | 'ponta' | 'atacante';
export type StatusAtleta = 'ativo' | 'inativo' | 'lesionado' | 'suspenso' | 'afastado';
export type StatusConvocacao = 'aguardando' | 'confirmado' | 'ausente' | 'lesionado' | 'suspenso';
export type SituacaoFinanceira = 'em_dia' | 'pendente' | 'inadimplente' | 'isento' | 'negociacao';

export interface Perfil {
  id: string;
  nome: string;
  email: string | null;
  papel: Papel;
  atleta_id: string | null;
  ativo: boolean;
  criado_em: string;
}

export interface Config {
  id: number;
  nome_clube: string;
  cor_primaria: string;
  cor_secundaria: string;
  cor_destaque: string;
  escudo_url: string | null;
  valor_mensalidade: number;
  dia_vencimento: number;
  geracao_automatica: boolean;
  dias_alerta: number;
  chave_pix: string | null;
  /** Taxa cobrada de cada atleta que confirma presença em um jogo. */
  valor_jogo: number;
}

export interface Atleta {
  id: string;
  nome: string;
  apelido: string | null;
  foto_url: string | null;
  data_nascimento: string | null;
  telefone: string | null;
  email: string | null;
  numero: number | null;
  posicao: Posicao;
  posicao_secundaria: Posicao | null;
  pe_dominante: string | null;
  data_entrada: string | null;
  status: StatusAtleta;
  observacoes: string | null;
}

/** Dados esportivos mínimos, comuns à tabela completa e à visão pública. */
export type AtletaBasico = Pick<Atleta, 'id' | 'nome' | 'apelido' | 'foto_url' | 'numero' | 'posicao' | 'posicao_secundaria' | 'status'>;

export interface AtletaFinanceiro {
  atleta_id: string;
  situacao: 'normal' | 'isento' | 'negociacao';
  valor_personalizado: number | null;
  observacao: string | null;
}

export interface Mensalidade {
  id: string;
  atleta_id: string;
  competencia: string;
  valor: number;
  vencimento: string;
  /** 'creditado': foi paga, mas o atleta não foi ao jogo — o valor virou crédito. */
  status: 'pendente' | 'pago' | 'isento' | 'cancelado' | 'creditado';
  pago_em: string | null;
  forma_pagamento: string | null;
  comprovante_path: string | null;
  comprovante_enviado_em: string | null;
  observacao: string | null;
  /** Preenchidos nas taxas de jogo (ex.: "Jogo x Rival (15/11)"). */
  partida_id?: string | null;
  descricao?: string | null;
  /** Parte do valor coberta pelo crédito do atleta. */
  abatido?: number;
}

export interface Credito {
  id: string;
  atleta_id: string;
  valor: number;
  descricao: string;
  mensalidade_id: string | null;
  usuario_nome: string | null;
  criado_em: string;
}

export interface Movimentacao {
  id: string;
  tipo: 'receita' | 'despesa';
  categoria: string;
  descricao: string;
  valor: number;
  data: string;
  forma_pagamento: string | null;
  status: 'confirmado' | 'pendente';
  responsavel_nome: string | null;
  anexo_path: string | null;
  mensalidade_id: string | null;
  criado_em: string;
}

export interface Partida {
  id: string;
  adversario: string;
  data_hora: string;
  local: string | null;
  competicao: string | null;
  mando: 'casa' | 'fora';
  observacoes: string | null;
  status: 'agendada' | 'realizada' | 'cancelada' | 'adiada';
  gols_pro: number | null;
  gols_contra: number | null;
  temporada: number;
  formacao: string;
  capitao_id: string | null;
  escalacao_publicada: boolean;
}

export interface Convocacao {
  id: string;
  partida_id: string;
  atleta_id: string;
  status: StatusConvocacao;
  observacao: string | null;
  respondido_em: string | null;
}

export interface ItemEscalacao {
  atleta_id: string;
  tipo: 'titular' | 'reserva';
  slot: number;
  x: number | null;
  y: number | null;
  funcao: string | null;
  autorizado_por?: string | null;
}

export interface Substituicao {
  sai_id: string;
  entra_id: string;
  minuto: number | null;
  observacao: string | null;
}

export interface Estatistica {
  id?: string;
  partida_id: string;
  atleta_id: string;
  titular: boolean;
  minutos: number | null;
  gols: number;
  assistencias: number;
  amarelos: number;
  vermelhos: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Linha = Record<string, any>;
