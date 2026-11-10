import type { Papel, Posicao, SituacaoFinanceira, StatusAtleta, StatusConvocacao } from './types';

export type Opcao = { value: string; label: string };
const opcoes = (m: Record<string, string>): Opcao[] => Object.entries(m).map(([value, label]) => ({ value, label }));

export const POSICOES: Record<Posicao, { label: string; plural: string; sigla: string }> = {
  goleiro: { label: 'Goleiro', plural: 'Goleiros', sigla: 'GOL' },
  zagueiro: { label: 'Zagueiro', plural: 'Zagueiros', sigla: 'ZAG' },
  lateral: { label: 'Lateral', plural: 'Laterais', sigla: 'LAT' },
  volante: { label: 'Volante', plural: 'Volantes', sigla: 'VOL' },
  meia: { label: 'Meia', plural: 'Meias', sigla: 'MEI' },
  ponta: { label: 'Ponta', plural: 'Pontas', sigla: 'PTA' },
  atacante: { label: 'Atacante', plural: 'Atacantes', sigla: 'ATA' },
};
export const ORDEM_POSICOES = Object.keys(POSICOES) as Posicao[];
export const OPCOES_POSICAO: Opcao[] = ORDEM_POSICOES.map((p) => ({ value: p, label: POSICOES[p].label }));

export const STATUS_ATLETA: Record<StatusAtleta, string> = {
  ativo: 'Ativo', inativo: 'Inativo', lesionado: 'Lesionado', suspenso: 'Suspenso', afastado: 'Afastado',
};
export const OPCOES_STATUS_ATLETA = opcoes(STATUS_ATLETA);

export const PE: Record<string, string> = { direito: 'Direito', esquerdo: 'Esquerdo', ambidestro: 'Ambidestro' };
export const OPCOES_PE = opcoes(PE);

export const FORMAS: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', transferencia: 'Transferência', outros: 'Outros', credito: 'Crédito do atleta' };
/** Formas aceitas ao registrar um pagamento (crédito é aplicado automaticamente). */
export const OPCOES_FORMA = opcoes(FORMAS).filter((o) => o.value !== 'credito');

export const CATEGORIAS_RECEITA = ['Taxas de jogo', 'Patrocínios', 'Doações', 'Premiações', 'Eventos', 'Outras receitas'];
export const CATEGORIAS_DESPESA = [
  'Arbitragem', 'Aluguel de campo', 'Uniformes', 'Materiais esportivos', 'Transporte', 'Alimentação',
  'Inscrições em campeonatos', 'Taxas', 'Outras despesas',
];

export const SITUACAO: Record<SituacaoFinanceira, string> = {
  em_dia: 'Em dia', pendente: 'Pendente', inadimplente: 'Inadimplente', isento: 'Isento', negociacao: 'Em negociação',
};

export const STATUS_CONVOCACAO: Record<StatusConvocacao, string> = {
  confirmado: 'Confirmado', ausente: 'Não poderá comparecer', aguardando: 'Aguardando resposta',
  lesionado: 'Lesionado', suspenso: 'Suspenso',
};
export const OPCOES_CONVOCACAO = opcoes(STATUS_CONVOCACAO);

export const STATUS_PARTIDA: Record<string, string> = {
  agendada: 'Agendada', realizada: 'Realizada', cancelada: 'Cancelada', adiada: 'Adiada',
};

export const PAPEIS: Record<Papel, string> = {
  admin: 'Administrador', diretoria: 'Diretoria', tesoureiro: 'Tesoureiro', comissao: 'Comissão técnica', atleta: 'Atleta',
};
export const OPCOES_PAPEL = opcoes(PAPEIS);

export const TIPOS_OCORRENCIA: Record<string, string> = {
  cartao_amarelo: 'Cartão amarelo', cartao_vermelho: 'Cartão vermelho', suspensao: 'Suspensão',
  advertencia: 'Advertência', outro: 'Outra ocorrência',
};
export const TIPOS_EVENTO: Record<string, string> = { treino: 'Treino', evento: 'Evento', reuniao: 'Reunião', outro: 'Outro' };
export const STATUS_UNIFORME: Record<string, string> = {
  disponivel: 'Disponível', entregue: 'Entregue', extraviado: 'Extraviado', baixado: 'Baixado',
};
export const PERIODICIDADE: Record<string, string> = { mensal: 'Mensal', anual: 'Anual', unico: 'Pagamento único', permuta: 'Permuta' };
export const GRAVIDADE: Record<string, string> = { leve: 'Leve', moderada: 'Moderada', grave: 'Grave' };
export const paraOpcoes = opcoes;

/** Categorias lançadas automaticamente pelo sistema ao registrar um pagamento. */
export const CATEGORIAS_AUTOMATICAS = ['Taxas de jogo', 'Mensalidades'];

// ---------------------------------------------------------------------
// Formações táticas — coordenadas em % do campo (y = 0 é o ataque)
// ---------------------------------------------------------------------
export type Slot = { x: number; y: number; funcao: Posicao };
const GOL: Slot = { x: 50, y: 91, funcao: 'goleiro' };
const LINHA4: Slot[] = [
  { x: 13, y: 70, funcao: 'lateral' }, { x: 37, y: 75, funcao: 'zagueiro' },
  { x: 63, y: 75, funcao: 'zagueiro' }, { x: 87, y: 70, funcao: 'lateral' },
];

export const FORMACOES: Record<string, Slot[]> = {
  '4-4-2': [GOL, ...LINHA4,
    { x: 13, y: 46, funcao: 'ponta' }, { x: 37, y: 51, funcao: 'volante' }, { x: 63, y: 51, funcao: 'meia' }, { x: 87, y: 46, funcao: 'ponta' },
    { x: 36, y: 20, funcao: 'atacante' }, { x: 64, y: 20, funcao: 'atacante' }],
  '4-3-3': [GOL, ...LINHA4,
    { x: 28, y: 50, funcao: 'meia' }, { x: 50, y: 56, funcao: 'volante' }, { x: 72, y: 50, funcao: 'meia' },
    { x: 15, y: 24, funcao: 'ponta' }, { x: 50, y: 17, funcao: 'atacante' }, { x: 85, y: 24, funcao: 'ponta' }],
  '4-2-3-1': [GOL, ...LINHA4,
    { x: 36, y: 57, funcao: 'volante' }, { x: 64, y: 57, funcao: 'volante' },
    { x: 15, y: 36, funcao: 'ponta' }, { x: 50, y: 36, funcao: 'meia' }, { x: 85, y: 36, funcao: 'ponta' },
    { x: 50, y: 15, funcao: 'atacante' }],
  '3-5-2': [GOL,
    { x: 25, y: 74, funcao: 'zagueiro' }, { x: 50, y: 77, funcao: 'zagueiro' }, { x: 75, y: 74, funcao: 'zagueiro' },
    { x: 10, y: 48, funcao: 'lateral' }, { x: 31, y: 54, funcao: 'volante' }, { x: 50, y: 44, funcao: 'meia' },
    { x: 69, y: 54, funcao: 'volante' }, { x: 90, y: 48, funcao: 'lateral' },
    { x: 36, y: 20, funcao: 'atacante' }, { x: 64, y: 20, funcao: 'atacante' }],
  '4-1-4-1': [GOL, ...LINHA4,
    { x: 50, y: 60, funcao: 'volante' },
    { x: 13, y: 40, funcao: 'ponta' }, { x: 37, y: 43, funcao: 'meia' }, { x: 63, y: 43, funcao: 'meia' }, { x: 87, y: 40, funcao: 'ponta' },
    { x: 50, y: 17, funcao: 'atacante' }],
};
export const FORMACAO_PERSONALIZADA = 'Personalizada';
export const NOMES_FORMACOES = [...Object.keys(FORMACOES), FORMACAO_PERSONALIZADA];

// ---------------------------------------------------------------------
// Navegação e permissões por perfil
// ---------------------------------------------------------------------
const STAFF: Papel[] = ['admin', 'diretoria', 'tesoureiro', 'comissao'];
const FIN: Papel[] = ['admin', 'diretoria', 'tesoureiro'];
const ESP: Papel[] = ['admin', 'diretoria', 'comissao'];
export const PAPEIS_FIN = FIN;
export const PAPEIS_ESP = ESP;
export const PAPEIS_COMISSAO: Papel[] = ['admin', 'comissao'];

export const MENU: { grupo: string; itens: { href: string; label: string; icone: string; papeis: Papel[] }[] }[] = [
  { grupo: 'Geral', itens: [
    { href: '/painel', label: 'Painel', icone: 'LayoutDashboard', papeis: STAFF },
    { href: '/portal', label: 'Meu portal', icone: 'Smartphone', papeis: ['atleta'] },
    { href: '/calendario', label: 'Calendário', icone: 'CalendarDays', papeis: STAFF },
    { href: '/mural', label: 'Mural de avisos', icone: 'Megaphone', papeis: STAFF },
  ] },
  { grupo: 'Esportivo', itens: [
    { href: '/atletas', label: 'Atletas', icone: 'Users', papeis: ESP },
    { href: '/partidas', label: 'Partidas e escalação', icone: 'Trophy', papeis: ESP },
    { href: '/estatisticas', label: 'Estatísticas', icone: 'BarChart3', papeis: ESP },
    { href: '/disciplina', label: 'Elenco e disciplina', icone: 'ShieldAlert', papeis: ESP },
    { href: '/uniformes', label: 'Uniformes', icone: 'Shirt', papeis: ESP },
  ] },
  { grupo: 'Financeiro', itens: [
    { href: '/mensalidades', label: 'Taxas de jogo', icone: 'Receipt', papeis: FIN },
    { href: '/financeiro', label: 'Caixa', icone: 'Wallet', papeis: FIN },
    { href: '/patrocinadores', label: 'Patrocinadores', icone: 'Handshake', papeis: FIN },
  ] },
  { grupo: 'Clube', itens: [
    { href: '/galeria', label: 'Galeria', icone: 'Images', papeis: STAFF },
    { href: '/relatorios', label: 'Relatórios', icone: 'FileText', papeis: STAFF },
    { href: '/usuarios', label: 'Usuários', icone: 'UserCog', papeis: ['admin'] },
    { href: '/configuracoes', label: 'Configurações', icone: 'Settings', papeis: ['admin', 'diretoria'] },
  ] },
];

export function podeAcessar(caminho: string, papel: Papel): boolean {
  for (const g of MENU) for (const i of g.itens) {
    if (caminho === i.href || caminho.startsWith(i.href + '/')) return i.papeis.includes(papel);
  }
  return true;
}
