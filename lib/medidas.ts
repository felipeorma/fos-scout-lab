/**
 * La pizarra sabe de metros: lo que mide cada equipo en una fase y quién
 * tiene más gente en cada zona. Todo sale de dónde están las fichas, en
 * metros reales del campo de 105 × 68, sin contar a los porteros.
 *
 * Nosotros atacamos hacia +x (defendemos la portería de x = −52,5); ellos,
 * al revés. Los tercios y los carriles se nombran siempre desde nosotros.
 */

import { CAMPO, posicionEn, type Equipo, type Fase, type Jugada, type Punto } from "./abp.ts";
import { area, envolvente } from "./geometria.ts";

export const esPortero = (rol: string) => /^(portero|por|gk|goalkeeper)$/i.test(rol.trim());

export type MedidasDeEquipo = {
  equipo: Equipo;
  /** Jugadores de campo con sitio en la fase. */
  jugadores: number;
  /** De banda a banda: entre los dos más abiertos. */
  anchura: number;
  /** Del más retrasado al más adelantado. */
  profundidad: number;
  /** La superficie que encierran, en m². */
  area: number;
  /** De su portería a su jugador de campo más retrasado. */
  lineaDefensiva: number;
  /** Quiénes marcan cada medida, para dibujarlas pegadas a ellos. */
  extremos: { izquierda: string; derecha: string; atras: string; delante: string };
};

const MEDIO = CAMPO.largo / 2;

function deCampo(jugada: Jugada, fase: Fase, equipo: Equipo, t: number) {
  return jugada.fichas
    .filter((f) => f.equipo === equipo && !esPortero(f.rol))
    .map((f) => ({ id: f.id, p: posicionEn(fase, f.id, t) }))
    .filter((f): f is { id: string; p: Punto } => Boolean(f.p));
}

/** Las medidas de un equipo en el instante `t` de la fase; null si tiene menos de dos jugadores de campo. */
export function medidasDeEquipo(jugada: Jugada, fase: Fase, equipo: Equipo, t = 0): MedidasDeEquipo | null {
  const campo = deCampo(jugada, fase, equipo, t);
  if (campo.length < 2) return null;
  // Desde su portería: para nosotros, cuanto más x más lejos; para ellos, al revés.
  const hondo = (p: Punto) => (equipo === "local" ? p.x + MEDIO : MEDIO - p.x);
  // Su izquierda: para nosotros, −z; para ellos, que atacan hacia −x, +z.
  const lado = (p: Punto) => (equipo === "local" ? p.z : -p.z);
  const extremo = (valor: (p: Punto) => number, mayor: boolean) =>
    campo.reduce((mejor, f) => ((mayor ? valor(f.p) > valor(mejor.p) : valor(f.p) < valor(mejor.p)) ? f : mejor));
  const izquierda = extremo(lado, false), derecha = extremo(lado, true), atras = extremo(hondo, false), delante = extremo(hondo, true);
  return {
    equipo,
    jugadores: campo.length,
    anchura: Math.abs(lado(derecha.p) - lado(izquierda.p)),
    profundidad: hondo(delante.p) - hondo(atras.p),
    area: area(envolvente(campo.map((f) => f.p))),
    lineaDefensiva: Math.max(0, hondo(atras.p)),
    extremos: { izquierda: izquierda.id, derecha: derecha.id, atras: atras.id, delante: delante.id },
  };
}

export type Zona = { id: string; nombre: string; local: number; rival: number };

/** Nuestros tercios, de nuestra portería a la suya. */
export const TERCIOS = [
  { id: "nuestro", nombre: "Nuestro tercio", dentro: (p: Punto) => p.x < -CAMPO.largo / 6 },
  { id: "medio", nombre: "Tercio medio", dentro: (p: Punto) => p.x >= -CAMPO.largo / 6 && p.x <= CAMPO.largo / 6 },
  { id: "suyo", nombre: "Su tercio", dentro: (p: Punto) => p.x > CAMPO.largo / 6 },
] as const;
/** Nuestros carriles, mirando a su portería: +z es nuestra derecha. */
export const CARRILES = [
  { id: "izquierda", nombre: "Banda izquierda", dentro: (p: Punto) => p.z < -CAMPO.ancho / 6 },
  { id: "centro", nombre: "Pasillo central", dentro: (p: Punto) => p.z >= -CAMPO.ancho / 6 && p.z <= CAMPO.ancho / 6 },
  { id: "derecha", nombre: "Banda derecha", dentro: (p: Punto) => p.z > CAMPO.ancho / 6 },
] as const;

/** Cuántos de cada equipo hay en cada tercio y en cada carril (sin porteros). */
export function superioridades(jugada: Jugada, fase: Fase, t = 0): { tercios: Zona[]; carriles: Zona[] } {
  const nuestros = deCampo(jugada, fase, "local", t), suyos = deCampo(jugada, fase, "rival", t);
  const contar = (zonas: ReadonlyArray<{ id: string; nombre: string; dentro: (p: Punto) => boolean }>) => zonas.map((z) => ({
    id: z.id, nombre: z.nombre,
    local: nuestros.filter((f) => z.dentro(f.p)).length,
    rival: suyos.filter((f) => z.dentro(f.p)).length,
  }));
  return { tercios: contar(TERCIOS), carriles: contar(CARRILES) };
}
