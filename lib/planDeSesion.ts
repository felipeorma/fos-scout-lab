/**
 * El plan de una sesión de entrenamiento: sus bloques en orden, cada uno con
 * un sistema del estudio, sus minutos y sus notas. Se guarda en el navegador
 * y sale en un PDF A4 para llevar al campo.
 */

import { nuevoId, type Jugada } from "./abp.ts";

export type BloqueDePlan = { id: string; jugadaId: string; minutos: number; notas: string };
export type PlanDeSesion = { version: 1; titulo: string; fecha: string; objetivo: string; bloques: BloqueDePlan[] };

export const CLAVE_PLAN = "fos-scout-lab:plan-de-sesion";
export const MINUTOS_POR_DEFECTO = 15;
const MAX_BLOQUES = 12;

const hoy = () => new Date().toISOString().slice(0, 10);

export const planVacio = (): PlanDeSesion => ({ version: 1, titulo: "", fecha: hoy(), objetivo: "", bloques: [] });

const minutosValidos = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(1, Math.min(180, Math.round(v))) : MINUTOS_POR_DEFECTO);
const textoValido = (v: unknown, largo: number) => (typeof v === "string" ? v.slice(0, largo) : "");

/** Lo leído del navegador, sano: lo que no se entiende se queda vacío en vez de romper la pantalla. */
export function planValido(v: unknown): PlanDeSesion {
  const p = v as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return planVacio();
  const bloques = Array.isArray(p.bloques) ? (p.bloques as Array<Record<string, unknown>>)
    .filter((b) => b && typeof b.jugadaId === "string")
    .slice(0, MAX_BLOQUES)
    .map((b): BloqueDePlan => ({
      id: typeof b.id === "string" && b.id ? b.id : nuevoId("b"),
      jugadaId: b.jugadaId as string,
      minutos: minutosValidos(b.minutos),
      notas: textoValido(b.notas, 400),
    })) : [];
  return {
    version: 1,
    titulo: textoValido(p.titulo, 80),
    fecha: typeof p.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha) ? p.fecha : hoy(),
    objetivo: textoValido(p.objetivo, 300),
    bloques,
  };
}

/** Un bloque más, con el sistema que se pide o, si no, el primero que aún no está en el plan. */
export function agregarBloque(plan: PlanDeSesion, jugadas: Jugada[], jugadaId?: string): PlanDeSesion {
  if (plan.bloques.length >= MAX_BLOQUES || !jugadas.length) return plan;
  const usadas = new Set(plan.bloques.map((b) => b.jugadaId));
  const id = jugadaId ?? (jugadas.find((j) => !usadas.has(j.id)) ?? jugadas[0]).id;
  return { ...plan, bloques: [...plan.bloques, { id: nuevoId("b"), jugadaId: id, minutos: MINUTOS_POR_DEFECTO, notas: "" }] };
}

export const cambiarBloque = (plan: PlanDeSesion, id: string, cambios: Partial<Omit<BloqueDePlan, "id">>): PlanDeSesion => ({
  ...plan,
  bloques: plan.bloques.map((b) => (b.id !== id ? b : {
    ...b, ...cambios,
    ...(cambios.minutos !== undefined ? { minutos: minutosValidos(cambios.minutos) } : {}),
    ...(cambios.notas !== undefined ? { notas: textoValido(cambios.notas, 400) } : {}),
  })),
});

export const quitarBloque = (plan: PlanDeSesion, id: string): PlanDeSesion => ({ ...plan, bloques: plan.bloques.filter((b) => b.id !== id) });

/** Sube (-1) o baja (+1) un bloque en el orden de la sesión. */
export function moverBloque(plan: PlanDeSesion, id: string, paso: -1 | 1): PlanDeSesion {
  const i = plan.bloques.findIndex((b) => b.id === id), j = i + paso;
  if (i < 0 || j < 0 || j >= plan.bloques.length) return plan;
  const bloques = [...plan.bloques];
  [bloques[i], bloques[j]] = [bloques[j], bloques[i]];
  return { ...plan, bloques };
}

/** Los bloques cuyo sistema sigue existiendo, con él al lado: un sistema borrado no sale en el PDF. */
export const bloquesConSistema = (plan: PlanDeSesion, jugadas: Jugada[]) =>
  plan.bloques.flatMap((b) => {
    const jugada = jugadas.find((j) => j.id === b.jugadaId);
    return jugada ? [{ bloque: b, jugada }] : [];
  });

export const minutosTotales = (plan: PlanDeSesion, jugadas: Jugada[]) => bloquesConSistema(plan, jugadas).reduce((n, { bloque }) => n + bloque.minutos, 0);

/** Cuándo empieza cada bloque, en minutos desde el inicio de la sesión. */
export const inicios = (minutos: number[]) => minutos.reduce<number[]>((salida, m, i) => [...salida, i ? salida[i - 1] + minutos[i - 1] : 0], []);
