import type { AtletaBasico, Estatistica, Partida } from './types';

export type Coletivo = { jogos: number; v: number; e: number; d: number; gp: number; gc: number; aproveitamento: number };

/** Estatísticas coletivas das partidas realizadas (com placar). */
export function coletivo(partidas: Pick<Partida, 'status' | 'gols_pro' | 'gols_contra'>[]): Coletivo {
  const jogadas = partidas.filter((p) => p.status === 'realizada' && p.gols_pro != null && p.gols_contra != null);
  const v = jogadas.filter((p) => p.gols_pro! > p.gols_contra!).length;
  const e = jogadas.filter((p) => p.gols_pro === p.gols_contra).length;
  const gp = jogadas.reduce((s, p) => s + p.gols_pro!, 0);
  const gc = jogadas.reduce((s, p) => s + p.gols_contra!, 0);
  const jogos = jogadas.length;
  return { jogos, v, e, d: jogos - v - e, gp, gc, aproveitamento: jogos ? Math.round(((v * 3 + e) / (jogos * 3)) * 1000) / 10 : 0 };
}

export type Individual = {
  atleta: AtletaBasico; jogos: number; titular: number; minutos: number; gols: number; assistencias: number; amarelos: number; vermelhos: number;
};

/** Soma as estatísticas individuais por atleta, ordenando por gols e assistências. */
export function individuais(stats: Estatistica[], atletas: AtletaBasico[]): Individual[] {
  const mapa = new Map<string, Individual>();
  const porId = new Map(atletas.map((a) => [a.id, a]));
  for (const s of stats) {
    const atleta = porId.get(s.atleta_id);
    if (!atleta) continue;
    const i = mapa.get(s.atleta_id) ?? { atleta, jogos: 0, titular: 0, minutos: 0, gols: 0, assistencias: 0, amarelos: 0, vermelhos: 0 };
    i.jogos += 1;
    i.titular += s.titular ? 1 : 0;
    i.minutos += s.minutos ?? 0;
    i.gols += s.gols;
    i.assistencias += s.assistencias;
    i.amarelos += s.amarelos;
    i.vermelhos += s.vermelhos;
    mapa.set(s.atleta_id, i);
  }
  return [...mapa.values()].sort((a, b) => b.gols - a.gols || b.assistencias - a.assistencias || b.jogos - a.jogos || a.atleta.nome.localeCompare(b.atleta.nome));
}
