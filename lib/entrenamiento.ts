/**
 * El entrenamiento en la pizarra: los espacios de juego con su medida real y
 * los petos.
 *
 * Un espacio es un rectángulo rotulado con su largo × ancho, setas en las
 * esquinas y, en los partidos reducidos, sus porterías. Se pone en la fase
 * elegida y en las siguientes con los mismos ids: es la misma marca, como si
 * se hubiera dibujado una vez y pasado de fase (lib/abp.ts, marcas enlazadas).
 */

import { CAMPO, cambiarAnotacion, datosDeMaterial, moverMaterial, nuevoId, type Anotacion, type CambiosDeAnotacion, type Jugada, type Material, type Punto } from "./abp.ts";

export type Espacio = {
  id: string;
  /** Nombre corto, para el botón. */
  nombre: string;
  /** A lo largo del campo (x) y de banda a banda (z), en metros. */
  largo: number;
  ancho: number;
  porterias: "ninguna" | "mini" | "reglamentaria";
};

export const ESPACIOS: Espacio[] = [
  { id: "rondo10", nombre: "Rondo 10 × 10", largo: 10, ancho: 10, porterias: "ninguna" },
  { id: "rondo20", nombre: "Rondo 20 × 20", largo: 20, ancho: 20, porterias: "ninguna" },
  { id: "posesion30", nombre: "Posesión 30 × 20", largo: 30, ancho: 20, porterias: "ninguna" },
  { id: "posesion40", nombre: "Posesión 40 × 30", largo: 40, ancho: 30, porterias: "ninguna" },
  { id: "reducido5", nombre: "5 contra 5 · 40 × 25", largo: 40, ancho: 25, porterias: "mini" },
  { id: "reducido7", nombre: "7 contra 7 · 55 × 40", largo: 55, ancho: 40, porterias: "reglamentaria" },
  { id: "reducido9", nombre: "9 contra 9 · 70 × 50", largo: 70, ancho: 50, porterias: "reglamentaria" },
];

/** Los colores de peto de cualquier almacén de material. */
export const PETOS: Array<{ color: string; nombre: string }> = [
  { color: "#f4e04d", nombre: "Amarillo" },
  { color: "#ff8a1f", nombre: "Naranja" },
  { color: "#7ee04f", nombre: "Verde" },
  { color: "#3a8dff", nombre: "Azul" },
  { color: "#ff5fa2", nombre: "Rosa" },
  { color: "#f5f5f7", nombre: "Blanco" },
];

/** El centro donde cabe entero un espacio de `largo` × `ancho` lo más cerca posible de `centro`. */
export function centroQueCabe(centro: Punto, largo: number, ancho: number): Punto {
  const holguraX = Math.max(0, (CAMPO.largo - largo) / 2), holguraZ = Math.max(0, (CAMPO.ancho - ancho) / 2);
  return { x: Math.max(-holguraX, Math.min(holguraX, centro.x)), z: Math.max(-holguraZ, Math.min(holguraZ, centro.z)) };
}

/** El rectángulo, las setas y las porterías de un espacio puesto en `centro`. */
export function piezasDeEspacio(espacio: Espacio, centro: Punto, color: string): { zona: Anotacion; material: Material[] } {
  const c = centroQueCabe(centro, espacio.largo, espacio.ancho);
  const l = espacio.largo / 2, a = espacio.ancho / 2;
  const zona: Anotacion = { id: nuevoId("a"), tipo: "rect", a: { x: c.x - l, z: c.z - a }, b: { x: c.x + l, z: c.z + a }, color, estilo: "borde", medidas: true };
  const seta = (x: number, z: number): Material => ({ id: nuevoId("m"), tipo: "seta", p: { x, z }, giro: 0, color: datosDeMaterial("seta").color });
  const material: Material[] = [seta(c.x - l, c.z - a), seta(c.x + l, c.z - a), seta(c.x + l, c.z + a), seta(c.x - l, c.z + a)];
  // En los espacios largos, también a mitad de las bandas: marcan el medio campo del reducido.
  if (espacio.largo >= 40) material.push(seta(c.x, c.z - a), seta(c.x, c.z + a));
  if (espacio.porterias !== "ninguna") {
    const tipo = espacio.porterias === "mini" ? "miniporteria" : "porteria";
    // La boca de una portería mira hacia +x de la pieza: la de atrás sin girar y la de delante, media vuelta.
    material.push(
      { id: nuevoId("m"), tipo, p: { x: c.x - l, z: c.z }, giro: 0, color: datosDeMaterial(tipo).color },
      { id: nuevoId("m"), tipo, p: { x: c.x + l, z: c.z }, giro: 180, color: datosDeMaterial(tipo).color },
    );
  }
  return { zona, material };
}

/** Pone un espacio en la fase `indice` y en las siguientes (las mismas marcas, enlazadas). */
export function ponerEspacio(jugada: Jugada, indice: number, espacio: Espacio, centro: Punto, color: string): { jugada: Jugada; zona: string } {
  const { zona, material } = piezasDeEspacio(espacio, centro, color);
  return {
    jugada: {
      ...jugada,
      fases: jugada.fases.map((f, i) => (i < indice ? f : {
        ...f,
        anotaciones: [...f.anotaciones, zona],
        material: [...(f.material ?? []), ...material],
      })),
    },
    zona: zona.id,
  };
}

/** El largo × ancho de una zona, en metros. */
export const tamanoDeZona = (a: Punto, b: Punto) => ({ largo: Math.abs(b.x - a.x), ancho: Math.abs(b.z - a.z) });

/**
 * Cambia el tamaño de una zona (por su medida o por una esquina) y lleva con
 * ella el material que está en su borde: las setas de las esquinas y de las
 * bandas y las porterías de los fondos siguen en su sitio del espacio, como
 * cuando se abre un rondo de 20 a 30 metros moviendo los conos.
 */
export function estirarZona(jugada: Jugada, indice: number, id: string, cambio: Pick<CambiosDeAnotacion, "tamano" | "caja">): Jugada {
  const antes = jugada.fases[indice]?.anotaciones.find((a) => a.id === id);
  if (!antes || (antes.tipo !== "rect" && antes.tipo !== "zona")) return jugada;
  let siguiente = cambiarAnotacion(jugada, indice, id, cambio);
  const despues = siguiente.fases[indice].anotaciones.find((a) => a.id === id);
  if (!despues || (despues.tipo !== "rect" && despues.tipo !== "zona") || antes.tipo !== "rect") return siguiente;
  const caja = (a: Punto, b: Punto) => ({ x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) });
  const vieja = caja(antes.a, antes.b), nueva = caja(despues.a, despues.b);
  const enElBorde = (p: Punto) => {
    const dentro = p.x > vieja.x0 - 0.5 && p.x < vieja.x1 + 0.5 && p.z > vieja.z0 - 0.5 && p.z < vieja.z1 + 0.5;
    const cerca = Math.min(Math.abs(p.x - vieja.x0), Math.abs(p.x - vieja.x1), Math.abs(p.z - vieja.z0), Math.abs(p.z - vieja.z1)) < 0.5;
    return dentro && cerca;
  };
  const llevar = (v: number, de0: number, de1: number, a0: number, a1: number) => (de1 - de0 < 1e-6 ? a0 : a0 + ((v - de0) / (de1 - de0)) * (a1 - a0));
  for (const m of jugada.fases[indice].material ?? []) {
    if (!enElBorde(m.p)) continue;
    siguiente = moverMaterial(siguiente, indice, m.id, { x: llevar(m.p.x, vieja.x0, vieja.x1, nueva.x0, nueva.x1), z: llevar(m.p.z, vieja.z0, vieja.z1, nueva.z0, nueva.z1) });
  }
  return siguiente;
}
