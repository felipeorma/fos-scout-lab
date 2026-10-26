/**
 * Lo que la pantalla del estudio le pide a un motor de dibujo. Hay dos: el
 * tablero 2D (lienzo plano, al estilo de una pizarra de análisis) y el campo
 * 3D (three.js, con estadio). La pantalla no sabe cuál tiene delante.
 */

import type { Ambiente, Encuadre, Equipacion, Equipo, EstiloFlecha, Extremo, Grosor, Jugada, Pase, Punto, RellenoBloque, TipoMaterial } from "@/lib/abp";

export type Vista = "tactica" | "3d" | "cenital";
export type Elemento = { tipo: "ficha" | "anotacion" | "material"; id: string };
/** Lo elegido: una cosa, o un grupo (Mayús+clic o un recuadro con Mayús) que se mueve y se borra junto. */
export type Seleccion = Elemento | { tipo: "grupo"; elementos: Elemento[] } | null;
export const estaElegido = (s: Seleccion, tipo: Elemento["tipo"], id: string) =>
  s?.tipo === "grupo" ? s.elementos.some((e) => e.tipo === tipo && e.id === id) : s?.tipo === tipo && s.id === id;
/** Cómo se pone el material: qué pieza, cada cuántos metros y si en slalom. */
export type ComoPoner = { tipo: TipoMaterial; separacion: number; slalom: boolean; color: string };
/** Lo que se está dibujando con el puntero, antes de soltar. */
export type Borrador =
  | {
    tipo: "flecha" | "rect" | "zona" | "carrera" | "pase" | "material" | "medida"; a: Punto; b: Punto;
    fichaId?: string; estilo?: EstiloFlecha; extremo?: Extremo; grosor?: Grosor; material?: ComoPoner;
    /** El envío que se está dibujando: raso o elevado. */
    envio?: Pase["tipo"];
    /** Las fichas sobre las que empieza o acaba (flecha y medida): el trazo se pega a ellas. */
    desde?: string; hasta?: string;
  }
  | { tipo: "trazo"; puntos: Punto[]; grosor?: Grosor; punta?: boolean }
  /** El bloque que se está formando: los jugadores ya elegidos, que se marcan con un aro. */
  | { tipo: "bloque"; fichas: string[]; relleno: RellenoBloque }
  /** Al arrastrar una ficha: la línea de la ficha con la que se ha alineado. */
  | { tipo: "guia"; x?: number; z?: number }
  /** El recuadro de Mayús+arrastre que elige todo lo que queda dentro. */
  | { tipo: "marco"; a: Punto; b: Punto }
  | null;
export type Opciones = {
  colorLocal: string;
  colorRival: string;
  colorAnotacion: string;
  acento: string;
  nombres: boolean;
  /** El dibujo de la camiseta de cada equipo; el portero va siempre liso. */
  equipaciones: Record<Equipo, Equipacion>;
  ambiente: Ambiente;
  fuente: string;
  /** El rol tal como se enseña (traducido si es uno de los de serie). */
  rotulo: (rol: string) => string;
  /** Una distancia como se lee en el idioma de la pantalla: «12,4 m» o «12.4 m». */
  metros?: (m: number) => string;
};

export interface Motor {
  readonly canvas: HTMLCanvasElement;
  /** Si el arrastre en vacío mueve la cámara (3D) o el tablero (2D). Se apaga mientras se dibuja. */
  orbitar: boolean;
  /** Al reproducir: la cámara va detrás del balón. */
  seguirBalon: boolean;
  montar(jugada: Jugada, indice: number, opciones: Opciones, seleccion: Seleccion, borrador: Borrador): void;
  instante(t: number): void;
  vista(vista: Vista, encuadre: Encuadre, centro: Punto | null, inmediato?: boolean): void;
  centrar(puntos: Punto[]): void;
  puntoDelCampo(clienteX: number, clienteY: number): Punto | null;
  renderizarAhora(): void;
  capturar(tipo?: "image/png" | "image/jpeg", calidad?: number): string;
  /** Solo el tablero 2D: acerca (factor > 1) o aleja y devuelve el zoom en %, 100 = el encuadre. */
  acercar?(factor: number): number;
  zoom?(): number;
  destruir(): void;
}

export type { Ambiente };
