/**
 * Los duelos de la pizarra: quién se enfrenta a quién y quién se espera que
 * gane, con los números de cada jugador en su temporada (StatsBomb).
 *
 * Método: log5, el de toda la vida para un uno contra uno cuando se conoce la
 * tasa de cada uno contra rivales medios. Para el regate, el % de regates que
 * completa el atacante y el % de regates que frena el defensor (entradas
 * sobre regates encarados); para el juego aéreo, el % de aéreos que gana
 * cada uno. Antes, cada tasa se encoge hacia la media de su liga según los
 * intentos que la sostienen: tres de tres no es un 100 %.
 *
 * Lo que NO hace: decir cuántas veces se enfrentarán, ni ajustar por nivel
 * de liga cuando los dos juegan en ligas distintas (cada tasa es contra los
 * rivales de su liga, y la pantalla lo dice).
 *
 * Validado contra los duelos reales de 2026 (VALIDACION_DUELOS): 1.119
 * partidos de cinco ligas, cada jugador con sus números de 2025 (fuera de
 * muestra). El aéreo funciona: con 60 % o más para uno, gana el 67 % (el
 * modelo decía 68 %). El regate depende poco de quién encara a quién: mejora
 * la media de la liga un 0,6 % en log loss, aunque cuando el atacante sale
 * con 65 % o más gana el 67 %. Por eso el regate pide más intentos antes de
 * creerse un número (PESO_REGATE) y la pantalla lo da como tendencia.
 *
 * El % de regate de StatsBomb de una temporada coincide con lo que pasa en
 * sus duelos (2026: 58,8 % en la CPL contra 58,2 % en los pares de eventos),
 * pero entre temporadas se mueve (en 2025 rondaba el 53 %): por eso cada
 * jugador se mide contra la media de su liga en esa misma temporada.
 */

import { distanciaDePuesto, SITIO } from "./pizarra.ts";

export type PerfilDeDuelo = {
  minutos: number;
  /** Regates completados por 90 y su %. */
  regates90: number;
  regatePct: number;
  /** Veces por 90 que le regatean, y el % de regates encarados que frena. */
  regateado90: number;
  frenaPct: number;
  /** Aéreos ganados por 90 y su %. */
  aereos90: number;
  aereoPct: number;
};

export type MediasDeDuelo = { regate: number; frena: number; aereo: number };

/**
 * Intentos que sostienen el número: sin ellos vuelve a la media de su liga.
 * Los que mejor predicen en la validación: el regate (y frenarlo) necesita
 * muchos más que el aéreo, porque depende menos del jugador.
 */
export const PESO_REGATE = 50;
export const PESO_AEREO = 20;

/** Lo que salió al probar el modelo con los duelos reales de 2026 (ver arriba). */
export const VALIDACION_DUELOS = {
  partidos: 1119,
  ligas: 5,
  regates: 25703,
  aereos: 27713,
  /** Con ≥ 60 % para uno en el aéreo, cuántas veces lo gana. */
  aereo: { umbral: 0.6, gana: 0.672, mejora: 0.038 },
  /** Con ≥ 65 % para el atacante, cuántas veces completa el regate; y cuánto mejora la media de la liga. */
  regate: { umbral: 0.65, gana: 0.673, mejora: 0.006 },
} as const;

const odds = (p: number) => p / (1 - p);
const deOdds = (o: number) => o / (1 + o);
const acotar = (p: number) => Math.min(0.97, Math.max(0.03, p));
const valido = (x: number) => Number.isFinite(x) && x >= 0;

/** Lo que tiene de cada cosa en la temporada: éxitos e intentos. */
function muestras(perfil: PerfilDeDuelo) {
  const partidos = perfil.minutos / 90;
  const intentosRegate = valido(perfil.regates90) && perfil.regatePct > 0 ? (perfil.regates90 / perfil.regatePct) * partidos : 0;
  const encarados = valido(perfil.regateado90) && perfil.frenaPct < 1 ? (perfil.regateado90 / (1 - perfil.frenaPct)) * partidos : 0;
  const aereos = valido(perfil.aereos90) && perfil.aereoPct > 0 ? (perfil.aereos90 / perfil.aereoPct) * partidos : 0;
  return { intentosRegate, encarados, aereos };
}

/** La tasa encogida hacia la media de su liga, según cuántos intentos la sostienen. */
export function encoger(tasa: number, intentos: number, media: number, peso: number) {
  if (!Number.isFinite(tasa) || !(intentos > 0)) return media;
  return (tasa * intentos + media * peso) / (intentos + peso);
}

/** Las medias de una liga (con los que tienen 450′ o más), ponderadas por intentos. */
export function mediasDeDuelo(perfiles: PerfilDeDuelo[]): MediasDeDuelo {
  let rE = 0, rI = 0, fS = 0, fN = 0, aG = 0, aN = 0;
  for (const p of perfiles) {
    if (!(p.minutos >= 450)) continue;
    const m = muestras(p);
    if (m.intentosRegate > 0) { rE += p.regatePct * m.intentosRegate; rI += m.intentosRegate; }
    if (m.encarados > 0) { fS += p.frenaPct * m.encarados; fN += m.encarados; }
    if (m.aereos > 0) { aG += p.aereoPct * m.aereos; aN += m.aereos; }
  }
  return { regate: rI ? rE / rI : 0.5, frena: fN ? fS / fN : 0.5, aereo: aN ? aG / aN : 0.5 };
}

/** Las tasas del jugador ya encogidas hacia su liga. */
export function tasas(perfil: PerfilDeDuelo, liga: MediasDeDuelo) {
  const m = muestras(perfil);
  return {
    regate: encoger(perfil.regatePct, m.intentosRegate, liga.regate, PESO_REGATE),
    frena: encoger(perfil.frenaPct, m.encarados, liga.frena, PESO_REGATE),
    aereo: encoger(perfil.aereoPct, m.aereos, liga.aereo, PESO_AEREO),
    intentosRegate90: perfil.minutos > 0 ? (m.intentosRegate * 90) / perfil.minutos : 0,
    muestras: m,
  };
}

/**
 * Probabilidad de que el atacante complete el regate: su tasa, corregida por
 * cuánto mejor o peor que la media de su liga frena el defensor.
 */
export function probabilidadDeRegate(atacante: PerfilDeDuelo, ligaAtacante: MediasDeDuelo, defensor: PerfilDeDuelo, ligaDefensor: MediasDeDuelo) {
  const pa = tasas(atacante, ligaAtacante).regate;
  const deja = 1 - tasas(defensor, ligaDefensor).frena;
  const dejaMedia = 1 - ligaDefensor.frena;
  return deOdds(odds(acotar(pa)) * odds(acotar(deja)) / odds(acotar(dejaMedia)));
}

/**
 * El regate entre un atacante y un defensor normales de su liga (≈ 58 % en
 * 2026): la referencia para decir quién tiene ventaja, porque un 58 % no es
 * ventaja de nadie.
 */
export function regateMedio(ligaAtacante: MediasDeDuelo) {
  return acotar(ligaAtacante.regate);
}

/** Probabilidad de que A gane el aéreo contra B. */
export function probabilidadAerea(a: PerfilDeDuelo, ligaA: MediasDeDuelo, b: PerfilDeDuelo, ligaB: MediasDeDuelo) {
  const pa = acotar(tasas(a, ligaA).aereo);
  const pb = acotar(tasas(b, ligaB).aereo);
  return deOdds(odds(pa) / odds(pb));
}

// ---- Quién se enfrenta a quién ---------------------------------------------------------

type Familia = "GK" | "DEF" | "LAT" | "MED" | "ATA";
const familia = (codigo: string): Familia => (
  codigo === "GK" ? "GK"
    : ["LCB", "CB", "RCB"].includes(codigo) ? "DEF"
      : ["LB", "RB", "LWB", "RWB"].includes(codigo) ? "LAT"
        : ["LDMF", "DMF", "RDMF", "LCMF", "CMF", "RCMF"].includes(codigo) ? "MED"
          : "ATA"
);

/** Dónde cae cada puesto en la pizarra superpuesta: A ataca a la derecha, B a la izquierda. */
export function sitioEnPizarra(codigo: string, lado: "a" | "b"): [number, number] {
  const [d, w] = SITIO[codigo] ?? [50, 40];
  if (codigo === "GK") return [lado === "a" ? 3 : 117, 40];
  return lado === "a" ? [10 + d, w] : [110 - d, 80 - w];
}

export type Emparejamiento = {
  /** El que ataca en este duelo. */
  ataca: "a" | "b";
  puestoAtacante: number;
  puestoDefensor: number;
  tipos: Array<"regate" | "aereo">;
};

/**
 * Los duelos que el dibujo pone sobre la cancha: cada jugador de ataque (y
 * los laterales, que también encaran) contra el defensor del otro equipo que
 * le queda más cerca en la pizarra. El punta, además, en el juego aéreo
 * contra su central.
 */
export function emparejar(puestosA: string[], puestosB: string[]): Emparejamiento[] {
  const salida: Emparejamiento[] = [];
  const duelosDe = (ataca: "a" | "b", atacantes: string[], defensores: string[]) => {
    const ladoDef = ataca === "a" ? "b" : "a";
    atacantes.forEach((codigo, i) => {
      const f = familia(codigo);
      if (f !== "ATA" && f !== "LAT") return;
      const [x, y] = sitioEnPizarra(codigo, ataca);
      let mejor = -1, distancia = Number.POSITIVE_INFINITY;
      defensores.forEach((otro, j) => {
        const g = familia(otro);
        if (g !== "DEF" && g !== "LAT" && g !== "MED") return;
        // Un lateral solo encara al que le sale por su banda: no a un central.
        if (f === "LAT" && g === "DEF") return;
        const [ox, oy] = sitioEnPizarra(otro, ladoDef);
        const d = Math.hypot(x - ox, y - oy);
        if (d < distancia) { distancia = d; mejor = j; }
      });
      if (mejor < 0 || distancia > 30) return;
      const tipos: Emparejamiento["tipos"] = ["regate"];
      if (["LCF", "CF", "RCF", "SS"].includes(codigo) && familia(defensores[mejor]) === "DEF") tipos.push("aereo");
      salida.push({ ataca, puestoAtacante: i, puestoDefensor: mejor, tipos });
    });
  };
  duelosDe("a", puestosA, puestosB);
  duelosDe("b", puestosB, puestosA);
  return salida;
}

export type JugadorConDuelo = { nombre: string; posicion: string; minutos: number; duelo: PerfilDeDuelo | null };

/**
 * El mejor del plantel para un duelo: de los que caben en el puesto (su
 * posición habitual de la misma familia que el puesto) y tienen 450′ o más, el que más
 * sube la probabilidad. `valor` dice cuánto vale cada candidato en el duelo.
 */
export function mejorParaElDuelo(
  puesto: string,
  actual: string | null,
  plantel: JugadorConDuelo[],
  enCancha: (nombre: string) => boolean,
  valor: (perfil: PerfilDeDuelo) => number,
) {
  const base = plantel.find((j) => j.nombre === actual);
  const deAhora = base?.duelo ? valor(base.duelo) : Number.NaN;
  let mejor: { jugador: JugadorConDuelo; valor: number } | null = null;
  for (const jugador of plantel) {
    if (!jugador.duelo || jugador.minutos < 450 || jugador.nombre === actual || enCancha(jugador.nombre)) continue;
    // Solo de su misma familia de puesto (un lateral no se propone de extremo); el lado puede cambiar.
    if (!(distanciaDePuesto(jugador.posicion, puesto) <= 2)) continue;
    const v = valor(jugador.duelo);
    if (Number.isFinite(v) && (!mejor || v > mejor.valor)) mejor = { jugador, valor: v };
  }
  if (!mejor || !Number.isFinite(deAhora) || mejor.valor - deAhora < 0.05) return null;
  return { ...mejor, ganancia: mejor.valor - deAhora };
}
