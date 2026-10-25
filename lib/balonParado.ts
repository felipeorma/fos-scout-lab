/**
 * El balón parado de un equipo, a favor y en contra, frente a su liga.
 *
 * Sale de los eventos de StatsBomb (el puente: /api/statsbomb/set-pieces):
 * cada córner y cada falta lateral al área, con quién la saca, desde qué
 * lado, con qué rosca, a qué zona cae, quién la toca primero, si acaba en
 * remate, su xG y si fue gol. Lo que un cuerpo técnico prepara el día antes:
 * a qué palo van sus córners, si los juegan en corto, quién los saca, quién
 * remata, y cuánto ganamos nosotros el primer contacto cuando defendemos.
 *
 * Las zonas son relativas al lado del saque: el primer palo es el del lado
 * desde el que se saca. "En corto": el pase corto o el que cae fuera del área
 * cerca de la esquina. Todo se compara con la media de su liga, porque un
 * 30 % al primer palo no dice nada sin saber que lo normal es un 14 %.
 */

export type ZonaDeParado = "corto" | "borde" | "primer_palo" | "centro" | "segundo_palo" | "fuera" | "desconocida";

export type AccionParada = {
  clase: "corner" | "falta";
  equipo: number;
  lanzador: string | null;
  lado: "izquierda" | "derecha";
  rosca: string | null;
  corto: boolean;
  zona: ZonaDeParado;
  /** Quién toca primero: el que saca (ataque), el que defiende, o nadie. */
  contacto: "ataque" | "defensa" | "nadie";
  quien: string | null;
  remate: boolean;
  rematador: string | null;
  xg: number;
  gol: boolean;
};

export type PartidoDeParado = { partido: number; fecha: string; local: number; visita: number; acciones: AccionParada[] };
export type LigaDeParado = { partidos: PartidoDeParado[]; fallidos: number };

export type Resumen = {
  corners: number;
  faltas: number;
  cornersPorPartido: number;
  /** Córners jugados en corto, sobre todos los córners. */
  enCorto: number;
  /** De los córners al área: rosca hacia la portería, hacia fuera o recta. */
  rosca: { cerrada: number; abierta: number; recta: number };
  /** De los córners al área: a qué zona caen. */
  zonas: { primer_palo: number; centro: number; segundo_palo: number; borde: number };
  /** De los córners al área: el primer contacto es del que saca. */
  primerContacto: number;
  /** De todos los córners: acaban en remate. */
  remate: number;
  xgPorCorner: number;
  /** xG de córners y faltas, por partido. */
  xgPorPartido: number;
  goles: number;
};

export type PerfilDeParado = {
  partidos: number;
  favor: Resumen;
  contra: Resumen;
  lanzadores: Array<{ nombre: string; corners: number; cerrada: number; lado: "izquierda" | "derecha" | "los dos" }>;
  /** Quién gana el primer contacto en sus córners y faltas al área. */
  primeros: Array<{ nombre: string; veces: number }>;
  rematadores: Array<{ nombre: string; remates: number; goles: number; xg: number }>;
};

const proporcion = (n: number, total: number) => (total > 0 ? n / total : Number.NaN);
const alArea = (a: AccionParada) => !a.corto && a.zona !== "corto" && a.zona !== "fuera" && a.zona !== "desconocida";

function resumir(acciones: AccionParada[], partidos: number): Resumen {
  const corners = acciones.filter((a) => a.clase === "corner");
  const faltas = acciones.filter((a) => a.clase === "falta");
  const directos = corners.filter(alArea);
  const cuenta = (lista: AccionParada[], f: (a: AccionParada) => boolean) => lista.filter(f).length;
  return {
    corners: corners.length,
    faltas: faltas.length,
    cornersPorPartido: proporcion(corners.length, partidos),
    enCorto: proporcion(corners.length - directos.length - cuenta(corners, (a) => a.zona === "fuera" || a.zona === "desconocida"), corners.length),
    rosca: {
      cerrada: proporcion(cuenta(directos, (a) => a.rosca === "inswinging"), directos.length),
      abierta: proporcion(cuenta(directos, (a) => a.rosca === "outswinging"), directos.length),
      recta: proporcion(cuenta(directos, (a) => a.rosca !== "inswinging" && a.rosca !== "outswinging"), directos.length),
    },
    zonas: {
      primer_palo: proporcion(cuenta(directos, (a) => a.zona === "primer_palo"), directos.length),
      centro: proporcion(cuenta(directos, (a) => a.zona === "centro"), directos.length),
      segundo_palo: proporcion(cuenta(directos, (a) => a.zona === "segundo_palo"), directos.length),
      borde: proporcion(cuenta(directos, (a) => a.zona === "borde"), directos.length),
    },
    primerContacto: proporcion(cuenta(directos, (a) => a.contacto === "ataque"), cuenta(directos, (a) => a.contacto !== "nadie")),
    remate: proporcion(cuenta(corners, (a) => a.remate), corners.length),
    xgPorCorner: proporcion(corners.reduce((s, a) => s + (a.xg || 0), 0), corners.length),
    xgPorPartido: proporcion(acciones.reduce((s, a) => s + (a.xg || 0), 0), partidos),
    goles: cuenta(acciones, (a) => a.gol),
  };
}

const losMas = <T,>(mapa: Map<string, T>, orden: (x: T) => number, cuantos: number) =>
  [...mapa.values()].sort((x, y) => orden(y) - orden(x)).slice(0, cuantos);

/** El balón parado de un equipo: lo suyo (a favor), lo de sus rivales contra él (en contra) y sus especialistas. */
export function balonParadoDe(liga: LigaDeParado, equipo: number): PerfilDeParado | null {
  const suyos = liga.partidos.filter((p) => p.local === equipo || p.visita === equipo);
  if (!suyos.length) return null;
  const favor = suyos.flatMap((p) => p.acciones.filter((a) => a.equipo === equipo));
  const contra = suyos.flatMap((p) => p.acciones.filter((a) => a.equipo !== equipo));

  const lanzadores = new Map<string, { nombre: string; corners: number; cerradas: number; izquierda: number; derecha: number; directos: number }>();
  const primeros = new Map<string, { nombre: string; veces: number }>();
  const rematadores = new Map<string, { nombre: string; remates: number; goles: number; xg: number }>();
  for (const a of favor) {
    if (a.clase === "corner" && a.lanzador) {
      const l = lanzadores.get(a.lanzador) ?? { nombre: a.lanzador, corners: 0, cerradas: 0, izquierda: 0, derecha: 0, directos: 0 };
      l.corners += 1;
      l[a.lado] += 1;
      if (alArea(a)) { l.directos += 1; if (a.rosca === "inswinging") l.cerradas += 1; }
      lanzadores.set(a.lanzador, l);
    }
    if (a.contacto === "ataque" && a.quien && alArea(a)) {
      const p = primeros.get(a.quien) ?? { nombre: a.quien, veces: 0 };
      p.veces += 1;
      primeros.set(a.quien, p);
    }
    if (a.remate && a.rematador) {
      const r = rematadores.get(a.rematador) ?? { nombre: a.rematador, remates: 0, goles: 0, xg: 0 };
      r.remates += 1;
      r.xg += a.xg || 0;
      if (a.gol) r.goles += 1;
      rematadores.set(a.rematador, r);
    }
  }
  return {
    partidos: suyos.length,
    favor: resumir(favor, suyos.length),
    contra: resumir(contra, suyos.length),
    lanzadores: losMas(lanzadores, (l) => l.corners, 3).map((l) => ({
      nombre: l.nombre, corners: l.corners, cerrada: proporcion(l.cerradas, l.directos),
      lado: l.izquierda >= 2 * l.derecha ? "izquierda" : l.derecha >= 2 * l.izquierda ? "derecha" : "los dos",
    })),
    primeros: losMas(primeros, (p) => p.veces, 3),
    rematadores: losMas(rematadores, (r) => r.xg + r.goles * 0.01, 3),
  };
}

/** La referencia: el balón parado de la liga entera (cada acción una vez). */
export function balonParadoDeLaLiga(liga: LigaDeParado): Resumen {
  const acciones = liga.partidos.flatMap((p) => p.acciones);
  // Por partido y equipo: cada partido tiene dos.
  return resumir(acciones, liga.partidos.length * 2);
}

export type LecturaDeParado = { texto: string; valores: Record<string, string | number>; peso: number };

/**
 * Lo que hay que preparar, en frases: solo lo que se separa de su liga lo
 * bastante como para no ser ruido (diez puntos en una proporción con al
 * menos 25 córners detrás, o un 40 % más en xG por córner).
 */
export function lecturasDeParado(su: PerfilDeParado, nuestro: PerfilDeParado | null, liga: Resumen): LecturaDeParado[] {
  const salida: LecturaDeParado[] = [];
  const directos = su.favor.corners * (1 - (Number.isFinite(su.favor.enCorto) ? su.favor.enCorto : 0));
  const pct = (v: number) => Math.round(v * 100);
  if (directos >= 25) {
    for (const [zona, nombre] of [["primer_palo", "al primer palo"], ["segundo_palo", "al segundo palo"], ["centro", "al centro del área"], ["borde", "al borde del área"]] as const) {
      const suyo = su.favor.zonas[zona], normal = liga.zonas[zona];
      if (suyo - normal >= 0.1) salida.push({ texto: "Sus córners van {donde} el {p} % (su liga, {l} %).", valores: { donde: nombre, p: pct(suyo), l: pct(normal) }, peso: suyo - normal });
    }
    if (su.favor.rosca.cerrada - liga.rosca.cerrada >= 0.12) salida.push({ texto: "Los saca cerrados, hacia la portería, el {p} % (su liga, {l} %): portero y primer palo atentos al balón que se mete.", valores: { p: pct(su.favor.rosca.cerrada), l: pct(liga.rosca.cerrada) }, peso: su.favor.rosca.cerrada - liga.rosca.cerrada });
    if (liga.rosca.abierta > 0 && su.favor.rosca.abierta - liga.rosca.abierta >= 0.12) salida.push({ texto: "Los saca abiertos, hacia fuera, el {p} % (su liga, {l} %): el remate llega desde atrás, a la carrera.", valores: { p: pct(su.favor.rosca.abierta), l: pct(liga.rosca.abierta) }, peso: su.favor.rosca.abierta - liga.rosca.abierta });
  }
  if (su.favor.corners >= 25 && su.favor.enCorto - liga.enCorto >= 0.1) salida.push({ texto: "Juega en corto el {p} % de sus córners (su liga, {l} %): que salga un hombre a la esquina.", valores: { p: pct(su.favor.enCorto), l: pct(liga.enCorto) }, peso: su.favor.enCorto - liga.enCorto });
  if (su.favor.corners >= 25 && liga.xgPorCorner > 0 && su.favor.xgPorCorner >= 1.4 * liga.xgPorCorner) salida.push({ texto: "Saca {x} de xG por córner, {r} veces lo normal en su liga.", valores: { x: su.favor.xgPorCorner.toFixed(3), r: (su.favor.xgPorCorner / liga.xgPorCorner).toFixed(1) }, peso: su.favor.xgPorCorner / liga.xgPorCorner - 1 });
  if (su.favor.corners >= 25 && Number.isFinite(su.favor.primerContacto) && su.favor.primerContacto - liga.primerContacto >= 0.1) salida.push({ texto: "Gana el primer contacto en el {p} % de sus córners al área (su liga, {l} %): tiene juego aéreo.", valores: { p: pct(su.favor.primerContacto), l: pct(liga.primerContacto) }, peso: su.favor.primerContacto - liga.primerContacto });
  // Nosotros defendiendo y atacando.
  if (nuestro && nuestro.contra.corners >= 25 && Number.isFinite(nuestro.contra.primerContacto)) {
    const ganamos = 1 - nuestro.contra.primerContacto, normal = 1 - liga.primerContacto;
    if (Math.abs(ganamos - normal) >= 0.08) salida.push({ texto: ganamos > normal ? "Tú ganas el primer contacto defendiendo córners el {p} % (su liga, {l} %): fuerte por arriba." : "Tú solo ganas el primer contacto defendiendo córners el {p} % (su liga, {l} %): refuerza la zona.", valores: { p: pct(ganamos), l: pct(normal) }, peso: Math.abs(ganamos - normal) });
  }
  if (nuestro && su.contra.corners >= 25 && liga.xgPorCorner > 0 && su.contra.xgPorCorner >= 1.3 * liga.xgPorCorner) salida.push({ texto: "Concede {x} de xG por córner, {r} veces lo normal: tus córners pueden hacer daño.", valores: { x: su.contra.xgPorCorner.toFixed(3), r: (su.contra.xgPorCorner / liga.xgPorCorner).toFixed(1) }, peso: su.contra.xgPorCorner / liga.xgPorCorner - 1 });
  return salida.sort((x, y) => y.peso - x.peso);
}
