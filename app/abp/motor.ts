/**
 * Lo que la pantalla del estudio le pide a un motor de dibujo. Hay dos: el
 * tablero 2D (lienzo plano, al estilo de una pizarra de análisis) y el campo
 * 3D (three.js, con estadio). La pantalla no sabe cuál tiene delante.
 */

import type { Ambiente, Encuadre, EstiloFlecha, Jugada, Punto } from "@/lib/abp";

export type Vista = "tactica" | "3d" | "cenital";
export type Seleccion = { tipo: "ficha" | "anotacion"; id: string } | null;
/** Lo que se está dibujando con el puntero, antes de soltar. */
export type Borrador = { tipo: "flecha" | "rect" | "zona" | "carrera" | "pase"; a: Punto; b: Punto; fichaId?: string; estilo?: EstiloFlecha } | null;
export type Opciones = {
  colorLocal: string;
  colorRival: string;
  colorAnotacion: string;
  acento: string;
  nombres: boolean;
  ambiente: Ambiente;
  fuente: string;
  /** El rol tal como se enseña (traducido si es uno de los de serie). */
  rotulo: (rol: string) => string;
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
