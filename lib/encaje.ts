import { roleForPosition, splitPlayerPositions } from "./positions.ts";

/**
 * El encaje de un jugador en un equipo, en cuatro partes que se leen por
 * separado —juntarlas en un número escondería cuál falla—:
 *
 * 1. Estilo de origen: cuánto se parece su equipo al de destino (eso lo da
 *    parecidoDeEstilo en estiloEquipo.ts; aquí solo se interpreta).
 * 2. El rol que pide el puesto: qué hacen los jugadores de su posición en el
 *    equipo de destino —familias y roles en la secuencia, ponderados por
 *    minutos— frente a lo que hace él.
 * 3. Sitio en el dibujo: en cuántos partidos usa el equipo su puesto.
 * 4. Nivel frente a la plantilla: su índice frente al de los que ya están.
 */

/** Un perfil: por dimensión (familia o rol), un valor en desviaciones típicas. */
export type Perfil = Record<string, number>;

/** De percentil a una escala comparable con z: P50 → 0, P90 → +1,6. */
export const percentilAZ = (percentil: number) => (percentil - 50) / 25;

/**
 * Lo que pide el puesto: la media, ponderada por minutos, del perfil de los
 * jugadores que ya lo ocupan. Una dimensión entra si la tiene al menos uno.
 */
export function perfilDelPuesto(actuales: Array<{ perfil: Perfil; minutos: number }>): Perfil {
  const suma: Record<string, number> = {}, peso: Record<string, number> = {};
  for (const { perfil, minutos } of actuales) {
    const w = Math.max(0, minutos) || 0;
    if (!w) continue;
    for (const [id, valor] of Object.entries(perfil)) {
      if (!Number.isFinite(valor)) continue;
      suma[id] = (suma[id] ?? 0) + valor * w;
      peso[id] = (peso[id] ?? 0) + w;
    }
  }
  return Object.fromEntries(Object.keys(suma).map((id) => [id, suma[id] / peso[id]]));
}

export type ComparacionDePuesto = {
  /** 0–100: 100 es hacer lo mismo que el puesto pide, 50 no tener nada que ver. */
  parecido: number;
  dimensiones: number;
  /** El puesto lo pide (≥ +0,3) y él lo da. */
  pideYDa: string[];
  /** El puesto lo pide y él se queda medio punto o más por debajo. */
  pideYNoDa: string[];
  /** Él lo da de sobra (tres cuartos de punto por encima) y el puesto no lo pide. */
  daDeMas: string[];
};

const recorte = (z: number) => Math.max(-3, Math.min(3, z));

/**
 * Compara al jugador con el perfil del puesto. El parecido es el coseno entre
 * los dos perfiles —como el de estilo entre equipos—, con los z recortados a
 * ±3 para que un valor extremo no decida solo. `pesos` da más voz a unas
 * dimensiones (las que el ajuste refuerza); sin pesos, todas igual.
 */
export function compararConPuesto(jugador: Perfil, puesto: Perfil, pesos: Record<string, number> = {}): ComparacionDePuesto | null {
  const ids = Object.keys(puesto).filter((id) => Number.isFinite(jugador[id]) && Number.isFinite(puesto[id]));
  if (ids.length < 3) return null;
  const w = ids.map((id) => pesos[id] ?? 1);
  const a = ids.map((id) => recorte(jugador[id])), b = ids.map((id) => recorte(puesto[id]));
  const punto = a.reduce((s, v, i) => s + w[i] * v * b[i], 0);
  const na = Math.sqrt(a.reduce((s, v, i) => s + w[i] * v * v, 0)), nb = Math.sqrt(b.reduce((s, v, i) => s + w[i] * v * v, 0));
  const coseno = na && nb ? punto / (na * nb) : 0;
  const pide = ids.filter((id) => puesto[id] >= 0.3).sort((x, y) => puesto[y] - puesto[x]);
  return {
    parecido: Math.round(((coseno + 1) / 2) * 1000) / 10,
    dimensiones: ids.length,
    pideYDa: pide.filter((id) => jugador[id] >= puesto[id] - 0.25).slice(0, 3),
    pideYNoDa: pide.filter((id) => jugador[id] < puesto[id] - 0.5)
      .sort((x, y) => (puesto[y] - jugador[y]) - (puesto[x] - jugador[x])).slice(0, 3),
    daDeMas: ids.filter((id) => puesto[id] < 0.3 && jugador[id] - puesto[id] >= 0.75)
      .sort((x, y) => (jugador[y] - puesto[y]) - (jugador[x] - puesto[x])).slice(0, 3),
  };
}

// ---- Ajuste: lo que necesita el puesto ------------------------------------

/** El nivel que se pide en lo reforzado: una desviación típica, en torno al percentil 84. */
export const NIVEL_REFUERZO = 1;
/** Cuánta más voz tiene lo reforzado en el parecido. */
export const PESO_REFUERZO = 2;

/**
 * Ajusta lo que pide el puesto a lo que necesita el equipo. En las
 * dimensiones reforzadas se pide al menos un nivel bueno (NIVEL_REFUERZO) y
 * cuentan el doble; el resto queda como está, porque es la esencia de cómo
 * juega ese equipo. Si la plantilla ya pide más de ese nivel, no se baja.
 */
export function ajustarPuesto(puesto: Perfil, refuerzos: string[]) {
  const perfil: Perfil = { ...puesto };
  const pesos: Record<string, number> = {};
  for (const id of refuerzos) {
    if (!(id in perfil)) continue;
    perfil[id] = Math.max(perfil[id], NIVEL_REFUERZO);
    pesos[id] = PESO_REFUERZO;
  }
  return { perfil, pesos };
}

/**
 * Lo que la plantilla actual hace por debajo de la media en el puesto: las
 * candidatas a reforzar, de la más floja a la menos. Es una sugerencia; lo
 * decide quien conoce la temporada.
 */
export function sugerirRefuerzos(puesto: Perfil, cuantas = 4) {
  return Object.keys(puesto)
    .filter((id) => puesto[id] <= -0.3)
    .sort((a, b) => puesto[a] - puesto[b])
    .slice(0, cuantas);
}

export type Alineaciones = {
  partidos: number;
  puestos: Record<string, { partidos: number; minutos: number }>;
  /** Por partido, los puestos que el equipo usó 20 minutos o más. */
  porPartido: string[][];
};

/**
 * Sitio en el dibujo: en cuántos partidos el equipo usa el puesto del
 * jugador, exacto (su código, "LW") y por familia de puesto (cualquier
 * extremo). El segundo cuenta cada partido una vez aunque use dos extremos.
 */
export function presenciaDelPuesto(alineaciones: Alineaciones, posicionJugador: unknown) {
  const codigo = splitPlayerPositions(posicionJugador)[0] ?? "";
  const rol = roleForPosition(codigo);
  if (!codigo || !alineaciones.partidos) return null;
  const exacto = alineaciones.porPartido.filter((puestos) => puestos.includes(codigo)).length;
  const deRol = rol ? alineaciones.porPartido.filter((puestos) => puestos.some((p) => roleForPosition(p) === rol)).length : exacto;
  return {
    codigo,
    rol,
    partidos: alineaciones.partidos,
    exacto,
    deRol,
    porcentajeExacto: Math.round((exacto / alineaciones.partidos) * 100),
    porcentajeRol: Math.round((deRol / alineaciones.partidos) * 100),
  };
}

/** Nivel frente a la plantilla: en qué lugar quedaría por índice entre los que ya ocupan el puesto. */
export function nivelFrenteAPlantilla(indiceJugador: number, actuales: Array<{ nombre: string; indice: number; minutos: number }>) {
  const ordenados = [...actuales].sort((a, b) => b.indice - a.indice);
  const lugar = ordenados.filter((a) => a.indice > indiceJugador).length + 1;
  return { lugar, de: ordenados.length + 1, actuales: ordenados };
}

/** El tramo de un parecido, como el encaje de estilo: alto desde 75, medio desde 60. */
export const tramo = (valor: number) => (valor >= 75 ? "alto" : valor >= 60 ? "medio" : "bajo");
