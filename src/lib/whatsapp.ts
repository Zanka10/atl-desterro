import { dataBR, dataExtensa, devido, diaBR, horaBR, moeda, nomeCobranca } from './format';
import type { Config, Mensalidade, Partida } from './types';

/** Normaliza para o formato internacional (55 + DDD + número). */
export function numeroWhats(tel: string | null | undefined): string | null {
  let d = (tel ?? '').replace(/\D/g, '');
  if (d.length < 10) return null;
  if (d.length <= 11) d = '55' + d;
  return d;
}

/** Link oficial "clique para conversar": abre o WhatsApp com a mensagem pronta para o usuário enviar. */
export function linkWhats(msg: string, tel?: string | null) {
  const n = numeroWhats(tel);
  return `https://wa.me/${n ?? ''}?text=${encodeURIComponent(msg)}`;
}

const jogo = (p: Partida, clube: string) =>
  `⚽ *${p.mando === 'casa' ? `${clube} x ${p.adversario}` : `${p.adversario} x ${clube}`}*\n` +
  `📅 ${dataExtensa(p.data_hora)} às ${horaBR(p.data_hora)}\n` +
  (p.local ? `📍 ${p.local}\n` : '') +
  (p.competicao ? `🏆 ${p.competicao}\n` : '');

export const MSG = {
  convocacao: (p: Partida, c: Config, link: string, nome?: string) =>
    `*CONVOCAÇÃO — ${c.nome_clube.toUpperCase()}*\n\n${nome ? `Fala, ${nome}! Você foi convocado.\n\n` : 'Atletas convocados, atenção:\n\n'}` +
    `${jogo(p, c.nome_clube)}\n💰 Taxa do jogo: *${moeda(c.valor_jogo)}* — quem confirmar deve pagar até *${dataBR(diaBR(p.data_hora))}* (dia do jogo).\n` +
    (c.chave_pix ? `Pix: ${c.chave_pix}\n` : '') +
    `\nConfirme sua presença no portal do atleta (entre com seu telefone e PIN):\n${link}`,
  lembrete: (p: Partida, c: Config) =>
    `*LEMBRETE DE JOGO — ${c.nome_clube.toUpperCase()}*\n\n${jogo(p, c.nome_clube)}\n💰 Confirmados: pagar a taxa de *${moeda(c.valor_jogo)}* até hoje, dia do jogo.` +
    (c.chave_pix ? ` Pix: ${c.chave_pix}` : '') +
    `\n\nNão se atrase! Chegue com antecedência.`,
  alteracao: (p: Partida, c: Config) =>
    `*⚠️ ALTERAÇÃO DE HORÁRIO — ${c.nome_clube.toUpperCase()}*\n\nAtenção para os novos dados da partida:\n\n${jogo(p, c.nome_clube)}`,
  escalacao: (p: Partida, c: Config) => `*ESCALAÇÃO — ${c.nome_clube.toUpperCase()}*\n\n${jogo(p, c.nome_clube)}`,
  cobranca: (nome: string, pendentes: Pick<Mensalidade, 'competencia' | 'valor' | 'vencimento' | 'descricao' | 'abatido'>[], c: Config) => {
    const total = pendentes.reduce((s, m) => s + devido(m), 0);
    return `Olá, ${nome}! Tudo bem?\n\nConsta em aberto no *${c.nome_clube}*:\n\n` +
      pendentes.map((m) => `• ${nomeCobranca(m)} — ${moeda(devido(m))}${m.abatido ? ` (já descontado ${moeda(m.abatido)} de crédito)` : ''} — pagar até ${dataBR(m.vencimento)}`).join('\n') +
      `\n\n*Total: ${moeda(total)}*\n` +
      (c.chave_pix ? `\nChave Pix: ${c.chave_pix}\n` : '') +
      `\nApós o pagamento, envie o comprovante. Obrigado! 💚`;
  },
  pagamento: (nome: string, m: Pick<Mensalidade, 'competencia' | 'valor' | 'descricao'>, data: string, c: Config) =>
    `Olá, ${nome}! ✅\n\nConfirmamos o recebimento do seu pagamento: *${nomeCobranca(m)}* (${moeda(m.valor)}) em ${dataBR(data)}.\n\nObrigado por manter o *${c.nome_clube}* em dia! 💚`,
  acesso: (nome: string, telefone: string, pin: string, link: string, c: Config) =>
    `Olá, ${nome}! 👋\n\nSeu acesso ao *portal do atleta — ${c.nome_clube}*:\n\n🔗 ${link}\n📱 Telefone: *${telefone}*\n🔑 PIN: *${pin}*\n\nPelo portal você confirma presença nos jogos, vê suas taxas e créditos e envia comprovantes.\nNão compartilhe seu PIN. Você pode trocá-lo em "Meus dados".`,
  comunicado: (titulo: string, conteudo: string, c: Config) =>
    `*📢 ${c.nome_clube.toUpperCase()} — ${titulo.toUpperCase()}*\n\n${conteudo}`,
};

/** Compartilha arquivo pelo menu nativo do celular; devolve false se o navegador não suportar. */
export async function compartilharArquivo(blob: Blob, nome: string, texto?: string): Promise<boolean> {
  const arquivo = new File([blob], nome, { type: blob.type });
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], text: texto });
    } catch {
      // usuário cancelou
    }
    return true;
  }
  return false;
}

export function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
