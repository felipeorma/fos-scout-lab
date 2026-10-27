/**
 * La presentación para el vestuario: clips del partido y sistemas del
 * estudio, en el orden en que se van a enseñar, cada uno con una nota para
 * los jugadores. Se presenta a pantalla completa (flechas, lápiz) o se baja
 * entera como un solo vídeo.
 *
 * Guarda solo referencias: el momento por su id (en la codificación de ese
 * vídeo) y el sistema por el suyo (en el cuaderno del estudio). Si uno ya no
 * está, se dice y se salta.
 */

import { duracionTotal, type Jugada } from "./abp.ts";
import type { Momento } from "./codificacion.ts";

export type ElementoDePresentacion =
  | { id: string; tipo: "momento"; momento: string; nota: string }
  | { id: string; tipo: "sistema"; jugada: string; nota: string };
export type Presentacion = { version: 1; titulo: string; elementos: ElementoDePresentacion[] };

export const PREFIJO_PRESENTACION = "fos-scout-lab:presentacion:";
/** La clave de la presentación: va con el vídeo, porque sus clips son de ese vídeo; sin vídeo, una general. */
export const claveDePresentacion = (claveDelVideo: string | null) => `${PREFIJO_PRESENTACION}${claveDelVideo ?? "general"}`;
/** Donde guarda el estudio sus sistemas (EstudioTactico). */
export const CLAVE_CUADERNO = "fos-scout-abp-v1";
const MAX_ELEMENTOS = 60;

export const presentacionVacia = (): Presentacion => ({ version: 1, titulo: "", elementos: [] });

let contador = 0;
const nuevoId = () => { contador += 1; return `p${Date.now().toString(36)}${contador.toString(36)}`; };

export function agregarMomento(p: Presentacion, momento: string, nota = ""): Presentacion {
  if (p.elementos.length >= MAX_ELEMENTOS || p.elementos.some((e) => e.tipo === "momento" && e.momento === momento)) return p;
  return { ...p, elementos: [...p.elementos, { id: nuevoId(), tipo: "momento", momento, nota: nota.slice(0, 200) }] };
}
export function agregarSistema(p: Presentacion, jugada: string, nota = ""): Presentacion {
  if (p.elementos.length >= MAX_ELEMENTOS) return p;
  return { ...p, elementos: [...p.elementos, { id: nuevoId(), tipo: "sistema", jugada, nota: nota.slice(0, 200) }] };
}
export const quitarElemento = (p: Presentacion, id: string): Presentacion => ({ ...p, elementos: p.elementos.filter((e) => e.id !== id) });
export const cambiarNota = (p: Presentacion, id: string, nota: string): Presentacion => ({
  ...p, elementos: p.elementos.map((e) => (e.id === id ? { ...e, nota: nota.slice(0, 200) } : e)),
});
/** Sube (-1) o baja (+1) un elemento. */
export function moverElemento(p: Presentacion, id: string, paso: -1 | 1): Presentacion {
  const i = p.elementos.findIndex((e) => e.id === id), j = i + paso;
  if (i < 0 || j < 0 || j >= p.elementos.length) return p;
  const elementos = [...p.elementos];
  [elementos[i], elementos[j]] = [elementos[j], elementos[i]];
  return { ...p, elementos };
}

export type Diapositiva =
  | { elemento: ElementoDePresentacion; tipo: "momento"; momento: Momento; segundos: number }
  | { elemento: ElementoDePresentacion; tipo: "sistema"; jugada: Jugada; segundos: number }
  | { elemento: ElementoDePresentacion; tipo: "falta"; segundos: 0 };

/**
 * Cada elemento con lo que enseña y cuánto dura: un clip, lo que va de su
 * inicio a su fin; un sistema, sus fases enteras y un segundo quieto al final.
 * Lo que ya no existe queda como «falta».
 */
export function diapositivas(p: Presentacion, momentos: Momento[], jugadas: Jugada[]): Diapositiva[] {
  return p.elementos.map((elemento): Diapositiva => {
    if (elemento.tipo === "momento") {
      const momento = momentos.find((m) => m.id === elemento.momento);
      return momento ? { elemento, tipo: "momento", momento, segundos: Math.max(0.5, momento.fin - momento.inicio) } : { elemento, tipo: "falta", segundos: 0 };
    }
    const jugada = jugadas.find((j) => j.id === elemento.jugada);
    return jugada ? { elemento, tipo: "sistema", jugada, segundos: duracionTotal(jugada) + 1 } : { elemento, tipo: "falta", segundos: 0 };
  });
}

/** Lo que dura todo, con la portadilla de cada diapositiva. */
export const duracionDePresentacion = (lista: Diapositiva[], portadilla = 1.2) =>
  lista.filter((d) => d.tipo !== "falta").reduce((s, d) => s + d.segundos + portadilla, 0);

export function presentacionValida(v: unknown): Presentacion {
  const p = v as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return presentacionVacia();
  const elementos = Array.isArray(p.elementos) ? (p.elementos as Array<Record<string, unknown>>).flatMap((e): ElementoDePresentacion[] => {
    if (!e || typeof e.id !== "string") return [];
    const nota = typeof e.nota === "string" ? e.nota.slice(0, 200) : "";
    if (e.tipo === "momento" && typeof e.momento === "string") return [{ id: e.id, tipo: "momento", momento: e.momento, nota }];
    if (e.tipo === "sistema" && typeof e.jugada === "string") return [{ id: e.id, tipo: "sistema", jugada: e.jugada, nota }];
    return [];
  }).slice(0, MAX_ELEMENTOS) : [];
  return { version: 1, titulo: typeof p.titulo === "string" ? p.titulo.slice(0, 80) : "", elementos };
}
