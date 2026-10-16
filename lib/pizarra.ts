/**
 * La pizarra del partido: los dibujos, quién juega en cada puesto y lo que el
 * cruce de dibujos aconseja, con los datos de cada equipo como prueba.
 *
 * Las reglas de pizarra vienen del Campograma de CCFC (superioridad en el
 * medio, línea de 3 o de 5, puntas contra centrales, amplitud...). Aquí cada
 * consejo lleva al lado lo que dicen los partidos de los dos equipos —"y
 * defiende alto para su liga: 47 m, 2º de 8"— y si el dato no acompaña a la
 * regla, no se da el consejo como si lo hiciera.
 */

import { centroDelCampo, estructuraDe, porBanda, type Estructura } from "./partido.ts";
import type { LecturaDeMetrica } from "./fases.ts";

/** Los dibujos que ofrece la pizarra, con el código de StatsBomb y los once puestos. */
export const DIBUJOS: Record<string, string[]> = {
  "442": ["GK", "LB", "LCB", "RCB", "RB", "LM", "LCMF", "RCMF", "RM", "LCF", "RCF"],
  "4411": ["GK", "LB", "LCB", "RCB", "RB", "LM", "LCMF", "RCMF", "RM", "AMF", "CF"],
  "41212": ["GK", "LB", "LCB", "RCB", "RB", "DMF", "LCMF", "RCMF", "AMF", "LCF", "RCF"],
  "433": ["GK", "LB", "LCB", "RCB", "RB", "LCMF", "DMF", "RCMF", "LW", "CF", "RW"],
  "4141": ["GK", "LB", "LCB", "RCB", "RB", "DMF", "LM", "LCMF", "RCMF", "RM", "CF"],
  "4231": ["GK", "LB", "LCB", "RCB", "RB", "LDMF", "RDMF", "LW", "AMF", "RW", "CF"],
  "4321": ["GK", "LB", "LCB", "RCB", "RB", "LCMF", "CMF", "RCMF", "LAMF", "RAMF", "CF"],
  "451": ["GK", "LB", "LCB", "RCB", "RB", "LM", "LCMF", "CMF", "RCMF", "RM", "CF"],
  "4312": ["GK", "LB", "LCB", "RCB", "RB", "LCMF", "CMF", "RCMF", "AMF", "LCF", "RCF"],
  "4222": ["GK", "LB", "LCB", "RCB", "RB", "LDMF", "RDMF", "LAMF", "RAMF", "LCF", "RCF"],
  "352": ["GK", "LCB", "CB", "RCB", "LWB", "LCMF", "CMF", "RCMF", "RWB", "LCF", "RCF"],
  "3412": ["GK", "LCB", "CB", "RCB", "LWB", "LCMF", "RCMF", "RWB", "AMF", "LCF", "RCF"],
  "3421": ["GK", "LCB", "CB", "RCB", "LWB", "LCMF", "RCMF", "RWB", "LAMF", "RAMF", "CF"],
  "343": ["GK", "LCB", "CB", "RCB", "LWB", "LCMF", "RCMF", "RWB", "LW", "CF", "RW"],
  "3142": ["GK", "LCB", "CB", "RCB", "DMF", "LWB", "LCMF", "RCMF", "RWB", "LCF", "RCF"],
  "3511": ["GK", "LCB", "CB", "RCB", "LWB", "LCMF", "CMF", "RCMF", "RWB", "AMF", "CF"],
  "532": ["GK", "LWB", "LCB", "CB", "RCB", "RWB", "LCMF", "CMF", "RCMF", "LCF", "RCF"],
  "541": ["GK", "LWB", "LCB", "CB", "RCB", "RWB", "LM", "LCMF", "RCMF", "RM", "CF"],
};

/** Los puestos de un dibujo: los de la plantilla conocida o, si no está, los de su once real. */
export const puestosDe = (formacion: string, onceReal?: string[] | null) => DIBUJOS[formacion] ?? (onceReal && onceReal.length === 11 ? onceReal : DIBUJOS["442"]);

/*
 * Dónde se dibuja cada puesto: profundidad desde la propia portería (0–100) y
 * ancho (0–80, su izquierda arriba). Los dos equipos se superponen —A ataca a
 * la derecha, B a la izquierda— de modo que los delanteros de uno caen sobre
 * los centrales del otro y los medios se encuentran: así se ven los choques.
 */
export const SITIO: Record<string, [number, number]> = {
  GK: [0, 40],
  LB: [24, 10], RB: [24, 70], LCB: [17, 27], CB: [16, 40], RCB: [17, 53],
  LWB: [36, 7], RWB: [36, 73],
  LDMF: [35, 31], DMF: [34, 40], RDMF: [35, 49],
  LCMF: [47, 27], CMF: [47, 40], RCMF: [47, 53],
  LM: [54, 10], RM: [54, 70],
  LAMF: [62, 27], AMF: [62, 40], RAMF: [62, 53],
  LW: [70, 11], RW: [70, 69],
  SS: [72, 40], LCF: [80, 32], CF: [81, 40], RCF: [80, 48],
};

type Familia = "GK" | "CB" | "LAT" | "MCD" | "MC" | "MCO" | "EXT" | "DEL";
const FAMILIA: Record<string, Familia> = {
  GK: "GK", LCB: "CB", CB: "CB", RCB: "CB", LB: "LAT", RB: "LAT", LWB: "LAT", RWB: "LAT",
  LDMF: "MCD", DMF: "MCD", RDMF: "MCD", LCMF: "MC", CMF: "MC", RCMF: "MC",
  LAMF: "MCO", AMF: "MCO", RAMF: "MCO", LM: "EXT", RM: "EXT", LW: "EXT", RW: "EXT",
  LCF: "DEL", CF: "DEL", RCF: "DEL", SS: "DEL",
};
const lado = (codigo: string) => (codigo.startsWith("L") ? "L" : codigo.startsWith("R") ? "R" : "C");
/** Qué familias pueden cubrir otra, de la más natural a la menos. */
const VECINAS: Record<Familia, Familia[]> = {
  GK: ["GK"], CB: ["CB", "MCD", "LAT"], LAT: ["LAT", "EXT", "CB"], MCD: ["MCD", "MC", "CB"], MC: ["MC", "MCD", "MCO"],
  MCO: ["MCO", "MC", "EXT", "DEL"], EXT: ["EXT", "LAT", "MCO", "DEL"], DEL: ["DEL", "MCO", "EXT"],
};

/**
 * Cuánto encaja un jugador que juega de `de` en el puesto `a`: 0 perfecto;
 * más, peor. Un jugador de campo puede acabar en cualquier puesto de campo
 * (un once se completa aunque sea fuera de sitio), pero el portero solo en la
 * portería: Infinity.
 */
export function distanciaDePuesto(de: string, a: string) {
  if (de === a) return 0;
  const fd = FAMILIA[de], fa = FAMILIA[a];
  if (!fd || !fa || (fd === "GK") !== (fa === "GK")) return Number.POSITIVE_INFINITY;
  const orden = VECINAS[fa].indexOf(fd);
  const mismoLado = lado(de) === lado(a) || lado(de) === "C" || lado(a) === "C";
  return (orden < 0 ? 20 : 1 + orden * 2) + (mismoLado ? 0 : 1);
}

export type Titular = [string, string]; // [puesto, jugador]

/**
 * El once de partida para un dibujo: los titulares del último partido en que
 * el equipo salió con él; si nunca salió así, los del último partido,
 * recolocados en los puestos del dibujo por cercanía (un lateral izquierdo
 * va al carril izquierdo antes que al derecho). Devuelve un nombre por puesto,
 * o null donde no hay quién.
 */
export function oncePara(puestos: string[], partidos: Array<{ formacion: string | null; titulares?: Titular[] }>, formacion: string): Array<string | null> {
  const conTitulares = partidos.filter((p) => (p.titulares?.length ?? 0) >= 10);
  const mismoDibujo = [...conTitulares].reverse().find((p) => p.formacion === formacion);
  const base = mismoDibujo ?? conTitulares[conTitulares.length - 1];
  if (!base?.titulares) return puestos.map(() => null);
  return colocar(puestos, base.titulares);
}

/** Coloca a cada titular en el puesto libre más cercano a su posición, de los encajes más claros a los menos. */
export function colocar(puestos: string[], titulares: Titular[]): Array<string | null> {
  const salida: Array<string | null> = puestos.map(() => null);
  const pendientes = [...titulares];
  const candidatos: Array<{ i: number; j: number; d: number }> = [];
  puestos.forEach((puesto, i) => pendientes.forEach(([suyo], j) => {
    const d = distanciaDePuesto(suyo, puesto);
    if (Number.isFinite(d)) candidatos.push({ i, j, d });
  }));
  candidatos.sort((a, b) => a.d - b.d);
  const usados = new Set<number>();
  const asignado: Array<number | null> = puestos.map(() => null);
  for (const { i, j } of candidatos) {
    if (asignado[i] !== null || usados.has(j)) continue;
    asignado[i] = j;
    usados.add(j);
  }
  // El reparto codicioso puede dejar a un extremo de interior teniendo libre
  // el hueco de punta: se cambian parejas mientras baje el desajuste total.
  const coste = (i: number, j: number | null) => (j === null ? 0 : distanciaDePuesto(pendientes[j][0], puestos[i]));
  for (let mejora = true, vueltas = 0; mejora && vueltas < 20; vueltas += 1) {
    mejora = false;
    for (let x = 0; x < puestos.length; x += 1) {
      for (let y = x + 1; y < puestos.length; y += 1) {
        const ahora = coste(x, asignado[x]) + coste(y, asignado[y]);
        const cambiado = coste(x, asignado[y]) + coste(y, asignado[x]);
        if (Number.isFinite(cambiado) && cambiado < ahora) {
          [asignado[x], asignado[y]] = [asignado[y], asignado[x]];
          mejora = true;
        }
      }
    }
  }
  asignado.forEach((j, i) => { if (j !== null) salida[i] = pendientes[j][1]; });
  return salida;
}

// ---- Lo que aconseja la pizarra -----------------------------------------------------------

export type Consejo = {
  id: string;
  /** El texto, con {a} y {b} por los nombres; se traduce en la pantalla. */
  texto: string;
  /** Los datos que lo tocan, cada uno diciendo si lo apoya. */
  pruebas: Prueba[];
  /**
   * respaldado: algún dato lo apoya y ninguno lo contradice (o más apoyan);
   * pizarra: solo lo dice el dibujo; contradicho: los datos dicen lo
   * contrario y la pantalla lo avisa en vez de darlo como cierto.
   */
  estado: "respaldado" | "pizarra" | "contradicho";
};

/**
 * Un dato junto a un consejo. `apoya`: true si va en la dirección que el
 * consejo necesita (por ejemplo, "su contra irá por las bandas" necesita que
 * el rival contragolpee mucho), false si va en la contraria, null si está en
 * el tercio medio de su liga o el consejo solo lo enseña como contexto.
 */
export type Prueba = { equipo: "a" | "b"; lectura: LecturaDeMetrica; apoya: boolean | null };

type Lecturas = { a: (id: string) => LecturaDeMetrica | null; b: (id: string) => LecturaDeMetrica | null };

/** El tercio de una métrica del equipo en su liga: 0 alto, 1 medio, 2 bajo; null sin dato. */
const tercio = (l: LecturaDeMetrica | null) => l?.tercio ?? null;

const ORDEN_DE_ESTADO: Record<Consejo["estado"], number> = { respaldado: 0, pizarra: 1, contradicho: 2 };

/**
 * Oportunidades y riesgos para A (el que mira la pizarra) contra B, con sus
 * dibujos elegidos. Cada consejo dice de dónde sale: del dibujo (pizarra) y,
 * cuando los hay, de los datos de los dos.
 */
export function consejosDePizarra(puestosA: string[], puestosB: string[], lecturas: Lecturas, formacionB?: string) {
  const a = estructuraDe(puestosA);
  const b = estructuraDe(puestosB);
  const oportunidades: Array<Omit<Consejo, "estado">> = [];
  const riesgos: Array<Omit<Consejo, "estado">> = [];
  /** `espera`: qué tercio de su liga necesita el consejo ("alto" el primero, "bajo" el último). */
  const prueba = (equipo: "a" | "b", id: string, espera?: "alto" | "bajo"): Prueba[] => {
    const lectura = equipo === "a" ? lecturas.a(id) : lecturas.b(id);
    if (!lectura) return [];
    const apoya = !espera || lectura.tercio === null || lectura.tercio === 1 ? null : espera === "alto" ? lectura.tercio === 0 : lectura.tercio === 2;
    return [{ equipo, lectura, apoya }];
  };
  const conDato = (equipo: "a" | "b", lectura: LecturaDeMetrica): Prueba => ({ equipo, lectura, apoya: true });

  // ---- El medio ----
  const medioA = centroDelCampo(a), medioB = centroDelCampo(b);
  if (medioA > medioB) oportunidades.push({ id: "medio_mas", texto: "Superioridad en el medio ({n} contra {m}): ten el balón y juega entre líneas para fijar a sus mediocentros.", pruebas: prueba("a", "posesion", "alto") });
  else if (medioA < medioB) riesgos.push({ id: "medio_menos", texto: "Inferioridad en el medio ({n} contra {m}): {b} puede dominar por dentro. Cierra el pasillo central con un pivote y bascula rápido.", pruebas: prueba("b", "posesion", "alto") });
  else oportunidades.push({ id: "medio_igual", texto: "Medio igualado ({n} contra {m}): lo deciden la transición y la recuperación tras pérdida.", pruebas: [...prueba("a", "contrapresiones"), ...prueba("b", "contrapresiones")] });

  // ---- La línea del rival ----
  const lineaDeTres = b.centrales >= 3;
  // 3-5-2 y 5-3-2 tienen los mismos puestos: lo que cambia es la altura de
  // los carrileros, y eso lo dice el código del dibujo.
  const lineaDeCinco = formacionB ? formacionB.startsWith("5") : lineaDeTres && b.carrileros >= 2 && b.bandas === 0 && centroDelCampo(b) <= 3;
  if (lineaDeCinco) {
    oportunidades.push({ id: "linea5", texto: "{b} defiende con línea de 5 y poca salida: ten el balón, carga el área con centros y busca el remate de segunda línea.", pruebas: prueba("b", "altura_defensa", "bajo") });
    riesgos.push({ id: "linea5_espacios", texto: "Contra la línea de 5 no habrá espacio entre líneas: circula rápido y no pierdas el balón por dentro, que es su contra.", pruebas: prueba("b", "contragolpe", "alto") });
  } else if (lineaDeTres) {
    const ancho = lecturas.b("ancho_bloque");
    oportunidades.push({ id: "linea3", texto: "{b} defiende con línea de 3: la banda tiene menos cobertura. Extremo abierto y lateral profundo para el 2 contra 1 sobre el carrilero.", pruebas: [...(ancho && tercio(ancho) === 2 ? [conDato("b", ancho)] : []), ...prueba("a", "amplitud", "alto")] });
  }

  // ---- Sus puntas contra nuestros centrales ----
  if (b.delanteros >= 2 && a.centrales <= 2) {
    riesgos.push({ id: "dos_puntas", texto: "Dos puntas contra tus dos centrales: duelo directo atrás. Asegura la cobertura del pivote o del lateral del lado contrario y vigila la espalda.", pruebas: [...prueba("a", "altura_defensa", "alto"), ...prueba("b", "balon_largo", "alto")] });
  }
  if (b.delanteros === 1 && a.centrales >= 2) {
    oportunidades.push({ id: "un_punta", texto: "{b} presiona con un solo punta: sales con un central de sobra. Conduce con él hasta que salte un medio y entonces juega al hombre libre.", pruebas: prueba("a", "salida_corta", "alto") });
  }

  // ---- Nuestra amplitud ----
  if (a.bandas >= 2 && a.laterales >= 2) {
    oportunidades.push({ id: "amplitud", texto: "Tu dibujo da amplitud natural: estira con los extremos y ataca los pasillos interiores que se abren.", pruebas: [...prueba("b", "ancho_bloque", "bajo"), ...prueba("a", "cambios", "alto")] });
  }
  if (a.carrileros >= 2) {
    oportunidades.push({ id: "carrileros", texto: "Los carrileros dan la anchura: que ataquen la espalda de sus laterales.", pruebas: prueba("a", "amplitud", "alto") });
    riesgos.push({ id: "carrileros_espalda", texto: "Si suben los carrileros, la contra de {b} irá por las bandas: que repliegue el interior de ese lado.", pruebas: prueba("b", "contragolpe", "alto") });
  }
  if (a.bandas === 0 && a.carrileros === 0) {
    riesgos.push({ id: "estrecho", texto: "Tu dibujo es estrecho: falta amplitud. Los laterales tendrán que llegar muy arriba, y eso deja la espalda.", pruebas: prueba("b", "contragolpe", "alto") });
  }
  if (a.pivotes >= 1) {
    oportunidades.push({ id: "pivote", texto: "El pivote te da equilibrio para soltar a los laterales sin dejar la zaga sola.", pruebas: [] });
  }

  // ---- Lo que dicen sus datos: dónde defiende y cómo presiona ----
  const alturaB = lecturas.b("altura_defensa");
  if (tercio(alturaB) === 0) {
    oportunidades.push({ id: "espalda", texto: "{b} defiende alto para su liga: hay espacio a la espalda de su línea para desmarques de ruptura y balón al espacio.", pruebas: [conDato("b", alturaB!), ...prueba("a", "balon_largo", "alto")] });
  } else if (tercio(alturaB) === 2) {
    oportunidades.push({ id: "bloque_bajo", texto: "{b} se repliega en bloque bajo: el espacio está delante de su defensa. Llega con segunda línea y tira desde la frontal.", pruebas: [conDato("b", alturaB!)] });
  }
  const largoB = lecturas.b("largo_bloque");
  if (tercio(largoB) === 0) oportunidades.push({ id: "entre_lineas", texto: "Su bloque es largo: queda espacio entre sus líneas para recibir de cara y girar.", pruebas: [conDato("b", largoB!)] });
  const anchoB = lecturas.b("ancho_bloque");
  if (tercio(anchoB) === 2) oportunidades.push({ id: "lado_debil", texto: "Su bloque es estrecho: el cambio de orientación encuentra el lado débil.", pruebas: [conDato("b", anchoB!), ...prueba("a", "cambios", "alto")] });
  const presionB = lecturas.b("altura_presion");
  if (tercio(presionB) === 0 || tercio(lecturas.b("ppda")) === 2) {
    riesgos.push({ id: "su_presion", texto: "{b} presiona arriba: si sales en corto, prepara el tercer hombre o el balón largo al punta para saltar su primera línea.", pruebas: [...prueba("b", "altura_presion", "alto"), ...prueba("b", "ppda", "bajo"), ...prueba("a", "salida_corta", "alto")] });
  }
  if (tercio(lecturas.b("amplitud")) === 0) riesgos.push({ id: "su_amplitud", texto: "{b} ataca muy abierto: tus laterales tendrán duelos 1 contra 1. Que el extremo ayude atrás.", pruebas: prueba("b", "amplitud", "alto") });
  if (tercio(lecturas.b("balon_largo")) === 0) riesgos.push({ id: "su_balon_largo", texto: "{b} juega largo: gana el duelo aéreo y, sobre todo, la segunda jugada.", pruebas: prueba("b", "balon_largo", "alto") });
  if (tercio(lecturas.b("contragolpe")) === 0 && (lineaDeCinco || tercio(alturaB) === 2)) {
    riesgos.push({ id: "su_contra", texto: "{b} está hecho para defender y salir: no te desordenes al atacar y deja siempre un hombre de vigilancia.", pruebas: [...prueba("b", "contragolpe", "alto"), ...prueba("b", "altura_defensa", "bajo")] });
  }
  if (tercio(lecturas.b("parado_favor")) === 0) riesgos.push({ id: "su_parado", texto: "{b} hace daño a balón parado: cuida faltas cerca del área y el marcaje en los córners.", pruebas: prueba("b", "parado_favor", "alto") });
  if (tercio(lecturas.b("parado_contra")) === 0) oportunidades.push({ id: "parado", texto: "{b} sufre a balón parado: busca faltas y córners.", pruebas: prueba("b", "parado_contra", "alto") });

  const conEstado = (lista: Array<Omit<Consejo, "estado"> & { estado?: Consejo["estado"] }>): Consejo[] => lista
    .map((c) => {
      const si = c.pruebas.filter((p) => p.apoya === true).length;
      const no = c.pruebas.filter((p) => p.apoya === false).length;
      return { ...c, estado: (si > no ? "respaldado" : no > si ? "contradicho" : "pizarra") as Consejo["estado"] };
    })
    .sort((x, y) => ORDEN_DE_ESTADO[x.estado] - ORDEN_DE_ESTADO[y.estado]);
  return { oportunidades: conEstado(oportunidades), riesgos: conEstado(riesgos), estructuraA: a, estructuraB: b, medio: [medioA, medioB] as const, bandas: [porBanda(a), porBanda(b)] as const };
}

export type { Estructura };
