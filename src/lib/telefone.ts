/**
 * Chave para comparar telefones brasileiros, independente da formatação:
 * remove símbolos, o código do país (55) e o 9 inicial do celular.
 * "(48) 99999-0000", "+55 48 99999 0000" e "48 9999-0000" geram a mesma chave.
 */
export function chaveTelefone(tel: string | null | undefined): string | null {
  let d = (tel ?? '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
  return d.length === 10 ? d : null;
}

export const pinValido = (pin: unknown): pin is string => typeof pin === 'string' && /^\d{4}$/.test(pin);

/** PINs fáceis demais de adivinhar. */
export const pinFraco = (pin: string) =>
  /^(\d)\1{3}$/.test(pin) || ['0123', '1234', '2345', '3456', '4567', '5678', '6789', '9876', '8765', '7654', '6543', '5432', '4321', '3210'].includes(pin);
