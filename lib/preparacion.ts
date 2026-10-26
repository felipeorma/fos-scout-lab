/**
 * Preparar el partido en la pizarra: los dos onces de El partido —con sus
 * dibujos y sus nombres— frente a frente, y el bloque del rival puesto donde
 * lo pone él de verdad. Con StatsBomb, la temporada del rival dice a qué
 * altura defiende (la distancia media de sus acciones defensivas a su
 * portería), cuánto mide su bloque de la primera a la última línea y de
 * banda a banda. La pizarra coloca a sus jugadores de campo con esas medidas,
 * marca su línea de atrás, dibuja la profundidad pegada a los jugadores que
 * la marcan y cuenta quién tiene más gente en cada tercio.
 *
 * Nosotros atacamos hacia +x; ellos defienden la portería de x = 52,5.
 */

import { CAMPO, nuevoId, sistemaDePartido, type Anotacion, type Ficha, type Jugada, type Punto } from "./abp.ts";
import { DIBUJOS } from "./pizarra.ts";
import { esPortero, medidasDeEquipo, superioridades, type Zona } from "./medidas.ts";

/** Las medidas del bloque de un equipo, en metros; null si no se sabe. */
export type BloqueReal = { altura: number | null; largo: number | null; ancho: number | null };

export type LadoDelPartido = {
  /** Cómo se llama el equipo. */
  equipo: string;
  /** El dibujo, como en DIBUJOS ("4231"). */
  formacion: string;
  /** El nombre de quien juega en cada puesto del dibujo, en su orden; null si no se sabe. */
  nombres: Array<string | null>;
  bloque?: BloqueReal | null;
};

export type Idioma = "es" | "en";
const T = {
  es: {
    fase: "El bloque de {equipo}",
    nota: "{datos}Por tercios, nosotros–ellos: {tercios}.",
    datos: "Bloque medio de {equipo}: centro a {altura} m de su portería, {largo} × {ancho} m. ",
    tercios: { nuestro: "atrás", medio: "en medio", suyo: "arriba" },
    linea: "Su línea de atrás",
  },
  en: {
    fase: "{equipo}'s block",
    nota: "{datos}By third, us–them: {tercios}.",
    datos: "{equipo}'s average block: centre {altura} m from their goal, {largo} × {ancho} m. ",
    tercios: { nuestro: "at the back", medio: "in midfield", suyo: "up front" },
    linea: "Their back line",
  },
} as const;

const rellenar = (plantilla: string, valores: Record<string, string | number>) =>
  plantilla.replace(/\{(\w+)\}/g, (_, k) => String(valores[k] ?? ""));
const apellido = (nombre: string) => nombre.trim().split(/\s+/).slice(-1)[0] ?? nombre;
const entero = (n: number) => String(Math.round(n));

/** Cuántos defensores tiene un dibujo: la primera cifra (4 en un 4-2-3-1). */
export const defensasDe = (formacion: string) => {
  const n = Number(formacion.replace(/\D/g, "")[0]);
  return n >= 3 && n <= 5 ? n : 4;
};

/**
 * Coloca a los jugadores de campo de un equipo con las medidas de su bloque:
 * la misma forma que su dibujo, estirada o encogida a lo largo y a lo ancho,
 * con el centro a `altura` metros de su portería. Lo que no se sabe se queda
 * como lo pone el dibujo.
 */
export function ajustarBloque(sitios: Array<{ id: string; p: Punto }>, defiendeEn: number, bloque: BloqueReal): Map<string, Punto> {
  const salida = new Map<string, Punto>();
  if (sitios.length < 2) return salida;
  // Hondo: metros desde su portería, que está en x = defiendeEn.
  const hondo = (p: Punto) => Math.abs(p.x - defiendeEn);
  const hs = sitios.map((s) => hondo(s.p)), zs = sitios.map((s) => s.p.z);
  const h0 = Math.min(...hs), h1 = Math.max(...hs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const largo = bloque.largo && bloque.largo > 5 ? bloque.largo : h1 - h0;
  const ancho = bloque.ancho && bloque.ancho > 10 ? Math.min(CAMPO.ancho - 4, bloque.ancho) : z1 - z0;
  const centro = bloque.altura && bloque.altura > 5 ? bloque.altura : (h0 + h1) / 2;
  // El bloque no se sale del campo: ni detrás de su portería ni pasada la línea de fondo rival.
  const atras = Math.max(4, Math.min(CAMPO.largo - 4 - largo, centro - largo / 2));
  const haciaDentro = defiendeEn > 0 ? -1 : 1;
  for (const s of sitios) {
    const u = h1 > h0 ? (hondo(s.p) - h0) / (h1 - h0) : 0.5;
    const v = z1 > z0 ? (s.p.z - (z0 + z1) / 2) / (z1 - z0) : 0;
    salida.set(s.id, { x: defiendeEn + haciaDentro * (atras + u * largo), z: v * ancho });
  }
  return salida;
}

/** La pizarra del partido: nuestro once contra el suyo, con su bloque real, su línea y sus medidas. */
export function pizarraDelPartido(nuestroDado: LadoDelPartido, rivalDado: LadoDelPartido, idioma: Idioma = "es"): Jugada {
  const txt = T[idioma];
  // Un dibujo que la pizarra no sabe poner se cambia por un 4-2-3-1, y sus nombres ya no casan con los puestos.
  const conocido = (lado: LadoDelPartido): LadoDelPartido => (DIBUJOS[lado.formacion] ? lado : { ...lado, formacion: "4231", nombres: [] });
  const nuestro = conocido(nuestroDado), rival = conocido(rivalDado);
  const base = sistemaDePartido(nuestro.formacion, rival.formacion, "nuestro", "ataque");
  // Los nombres, en el orden del dibujo: la ficha i de cada equipo es el puesto i.
  const conNombre = (fichas: Ficha[], lado: LadoDelPartido) => fichas.map((f, i) => {
    const nombre = lado.nombres[i];
    return nombre ? { ...f, nombre: apellido(nombre).slice(0, 24) } : f;
  });
  const locales = conNombre(base.fichas.filter((f) => f.equipo === "local"), nuestro);
  const suyas = conNombre(base.fichas.filter((f) => f.equipo === "rival"), rival);
  let fase = base.fases[0];
  const deCampo = suyas.filter((f) => !esPortero(f.rol)).map((f) => ({ id: f.id, p: fase.pos[f.id] }));
  if (rival.bloque) {
    const colocados = ajustarBloque(deCampo, CAMPO.largo / 2, rival.bloque);
    fase = { ...fase, pos: { ...fase.pos, ...Object.fromEntries(colocados) } };
    // Nosotros, con el balón contra ese bloque: los de arriba a la altura de su última línea
    // (no detrás, que sería fuera de juego), un equipo de 45 m como mucho y más abierto que ellos.
    const nuestrosDeCampo = locales.filter((f) => !esPortero(f.rol)).map((f) => ({ id: f.id, p: fase.pos[f.id] }));
    const suUltima = Math.max(...deCampo.map((s) => fase.pos[s.id].x));
    const xs = nuestrosDeCampo.map((s) => s.p.x);
    const largo = Math.min(45, Math.max(...xs) - Math.min(...xs));
    const delante = suUltima - 1 + CAMPO.largo / 2;
    const nuestros = ajustarBloque(nuestrosDeCampo, -CAMPO.largo / 2, {
      altura: delante - largo / 2, largo, ancho: Math.min(CAMPO.ancho - 4, (rival.bloque.ancho ?? 44) + 14),
    });
    fase = { ...fase, pos: { ...fase.pos, ...Object.fromEntries(nuestros) } };
    // El balón, con el central más centrado: empezamos a atacar el bloque desde atrás.
    const central = [...nuestrosDeCampo].sort((x, y) => fase.pos[x.id].x - fase.pos[y.id].x).slice(0, 4)
      .sort((x, y) => Math.abs(fase.pos[x.id].z) - Math.abs(fase.pos[y.id].z))[0];
    if (central) fase = { ...fase, balon: { x: fase.pos[central.id].x + 1.2, z: fase.pos[central.id].z + 0.6 } };
  }
  const jugada: Jugada = {
    ...base,
    nombre: `${nuestro.equipo} vs ${rival.equipo}`.slice(0, 80),
    // Dentro de la ficha, el puesto; debajo, el jugador.
    ambiente: { ...base.ambiente, fichas: "puesto" },
    fichas: [...locales, ...suyas],
    fases: [fase],
  };

  // Su línea de atrás: los `n` más retrasados, con el espacio a su espalda sombreado.
  const n = defensasDe(rival.formacion);
  const linea = [...deCampo].map((s) => s.id).sort((a, b) => fase.pos[b].x - fase.pos[a].x).slice(0, n);
  const colorRival = base.colores.rival;
  const anotaciones: Anotacion[] = [
    { id: nuevoId("a"), tipo: "bloque", fichas: linea, color: base.colores.anotacion, relleno: "atras" },
  ];
  const suyasMedidas = medidasDeEquipo(jugada, fase, "rival");
  if (suyasMedidas) {
    // La profundidad, pegada a sus jugadores; la anchura iría por encima de su línea de atrás
    // y taparía a nuestros delanteros: va en la nota y en el panel de medidas.
    const { atras, delante } = suyasMedidas.extremos;
    anotaciones.push({ id: nuevoId("a"), tipo: "medida", a: fase.pos[atras], b: fase.pos[delante], color: colorRival, desde: atras, hasta: delante });
  }
  const fondo = Math.max(...linea.map((id) => fase.pos[id].x));
  anotaciones.push({ id: nuevoId("a"), tipo: "etiqueta", a: { x: Math.min(CAMPO.largo / 2 - 4, fondo + 5), z: -CAMPO.ancho / 2 + 5 }, texto: txt.linea, color: base.colores.anotacion });

  const { tercios } = superioridades(jugada, fase);
  const deTercio = (z: Zona) => `${z.local}–${z.rival} ${txt.tercios[z.id as keyof typeof txt.tercios]}`;
  const b = rival.bloque;
  const datos = b?.altura && b.largo && b.ancho ? rellenar(txt.datos, { equipo: rival.equipo, altura: entero(b.altura), largo: entero(b.largo), ancho: entero(b.ancho) }) : "";
  const nota = rellenar(txt.nota, { datos, tercios: tercios.map(deTercio).join(", ") });
  return {
    ...jugada,
    fases: [{ ...fase, nombre: rellenar(txt.fase, { equipo: rival.equipo }).slice(0, 40), nota: nota.slice(0, 160), anotaciones }],
  };
}

