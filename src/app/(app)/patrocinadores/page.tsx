'use client';

import { MessageCircle } from 'lucide-react';
import { useApp } from '@/components/contexto';
import { PaginaCrud } from '@/components/crud';
import type { Campo } from '@/components/formulario';
import { BotaoIcone, Selo } from '@/components/ui';
import { PERIODICIDADE, paraOpcoes } from '@/lib/constants';
import { dataBR, moeda, telefoneBR } from '@/lib/format';

const CAMPOS: Campo[] = [
  { nome: 'nome', rotulo: 'Empresa / patrocinador', obrigatorio: true, largo: true },
  { nome: 'contato', rotulo: 'Pessoa de contato' },
  { nome: 'telefone', rotulo: 'Telefone / WhatsApp', tipo: 'tel' },
  { nome: 'email', rotulo: 'E-mail', tipo: 'email' },
  { nome: 'valor', rotulo: 'Valor do patrocínio (R$)', tipo: 'dinheiro', min: 0 },
  { nome: 'periodicidade', rotulo: 'Periodicidade', tipo: 'selecao', opcoes: paraOpcoes(PERIODICIDADE) },
  { nome: 'inicio', rotulo: 'Início do contrato', tipo: 'data' },
  { nome: 'fim', rotulo: 'Fim do contrato', tipo: 'data', validar: (v, t) => (v && t.inicio && String(v) < t.inicio ? 'O fim deve ser posterior ao início.' : undefined) },
  { nome: 'logo_url', rotulo: 'Logomarca', tipo: 'imagem' },
  { nome: 'ativo', rotulo: 'Situação', tipo: 'caixa', dica: 'Patrocínio ativo' },
  { nome: 'observacoes', rotulo: 'Observações', tipo: 'area' },
];

export default function Patrocinadores() {
  const { whats } = useApp();
  return (
    <PaginaCrud
      titulo="Patrocinadores" descricao="Parceiros e contratos de patrocínio do clube." tabela="patrocinadores" ordem="nome" crescente
      item="Patrocinador" pasta="patrocinadores" padrao={{ ativo: true }} campos={CAMPOS} podeEditar textoBusca={(l) => `${l.nome} ${l.contato ?? ''}`}
      acoes={(l) => l.telefone && (
        <BotaoIcone titulo="Conversar no WhatsApp" onClick={() => whats({ tel: l.telefone, nome: l.contato ?? l.nome, msg: `Olá${l.contato ? `, ${l.contato}` : ''}! Aqui é do Atlético Desterro.` })}>
          <MessageCircle className="h-4 w-4" />
        </BotaoIcone>
      )}
      colunas={[
        { titulo: 'Patrocinador', celula: (l) => (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {l.logo_url ? <img src={l.logo_url} alt="" className="h-9 w-9 rounded-lg border border-zinc-200 object-contain" /> : <span className="h-9 w-9 rounded-lg bg-zinc-100" />}
            <div><p className="font-medium text-zinc-900">{l.nome}</p><p className="text-xs text-zinc-500">{l.contato ?? '—'}</p></div>
          </div>
        ) },
        { titulo: 'Telefone', celula: (l) => telefoneBR(l.telefone) },
        { titulo: 'Valor', direita: true, celula: (l) => (l.valor != null ? moeda(l.valor) : '—') },
        { titulo: 'Periodicidade', celula: (l) => PERIODICIDADE[l.periodicidade] ?? '—' },
        { titulo: 'Vigência', celula: (l) => (l.inicio || l.fim ? `${dataBR(l.inicio)} a ${dataBR(l.fim)}` : '—') },
        { titulo: 'Situação', celula: (l) => <Selo tom={l.ativo ? 'verde' : 'cinza'}>{l.ativo ? 'Ativo' : 'Encerrado'}</Selo> },
      ]}
    />
  );
}
