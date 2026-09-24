"use client";

import { useMemo } from "react";
import { useEstilos } from "./useEstilos";
import { usePuestos } from "./usePuestosDeEquipo";
import { refuerzosDe, useVersionDeAjustes } from "./useAjustesDeEncaje";
import { buildPlayerReport, cohortOf, detectCoreColumns, headersOf, numeric, type DataRow } from "@/lib/scouting";
import { familiasCompuestas, type GrupoCompuesto } from "@/lib/snapshot";
import { EQUIPO_PROPIO, crearBuscadorDeEquipos, mismoEquipo, perfilesDeEstilo } from "@/lib/estiloEquipo";
import { ajustarPuesto, compararConPuesto, nivelFrenteAPlantilla, perfilDelPuesto, presenciaDelPuesto, type Perfil } from "@/lib/encaje";

/**
 * El encaje con un equipo en una lista (Ranking, Entre ligas).
 *
 * Es el de la ficha ampliada con una diferencia: aquí "lo que pide el
 * puesto" se mide solo con las familias, sin los roles en la secuencia. Los
 * roles exigen analizar las secuencias de cada liga de la lista —minutos por
 * liga la primera vez—, y una columna no puede esperar a eso. Por eso la
 * cifra puede diferir un poco de la de la ficha; la celda lo dice.
 */

export type EncajeDeFila = {
  equipo: string;
  /** 0–100: cuánto se parece a lo que el equipo pide en su puesto. */
  puesto: number | null;
  /** Qué lugar ocuparía por índice entre los que ya tiene el equipo en su puesto. */
  lugar: { lugar: number; de: number } | null;
  /** % de partidos en que el equipo usa su puesto (o uno de su familia). */
  sitio: number | null;
  /** Lo que el scout marcó que ese puesto necesita reforzar (ver useAjustesDeEncaje). */
  refuerzos: string[];
};

/** Los equipos de la base, con el nuestro primero: es el que más se elige. */
export function equiposParaEncaje(rows: DataRow[]) {
  const todos = [...new Set(rows.map((fila) => String(fila.Team ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const propio = todos.find((equipo) => mismoEquipo(equipo, EQUIPO_PROPIO));
  return propio ? [propio, ...todos.filter((equipo) => equipo !== propio)] : todos;
}

type DeCohorte = {
  grupo: GrupoCompuesto;
  actuales: number[];
  perfilDe: (i: number) => Perfil;
  plantilla: Array<{ i: number; nombre: string; indice: number; minutos: number }>;
};

export function useEncajeDeLista(rows: DataRow[], minutosMin: number, destino: string) {
  const activo = Boolean(destino);
  const estilos = useEstilos();
  const buscar = useMemo(() => crearBuscadorDeEquipos(estilos.filas ? perfilesDeEstilo(estilos.filas) : []), [estilos.filas]);
  const llegada = activo ? buscar(destino) : null;
  const { datos: alineaciones, error } = usePuestos(llegada?.clave ?? "");
  const columnaMinutos = useMemo(() => detectCoreColumns(headersOf(rows)).minutes, [rows]);
  // Al marcar o quitar un refuerzo, la columna se recalcula.
  const versionAjustes = useVersionDeAjustes();

  // Lo que se calcula por grupo de posición y por fila, una vez por base,
  // mínimo de minutos y equipo. Una lista se vuelve a pintar a menudo y el
  // informe de cada jugador no es barato.
  const cache = useMemo(() => ({ cohortes: new Map<string, DeCohorte>(), filas: new Map<string, EncajeDeFila | null>() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, minutosMin, destino, alineaciones, versionAjustes]);

  const minutos = (i: number) => (columnaMinutos ? numeric(rows[i]?.[columnaMinutos]) : 0) || 0;

  const deCohorte = (cohorte: string): DeCohorte => {
    const guardado = cache.cohortes.get(cohorte);
    if (guardado) return guardado;
    const grupo = familiasCompuestas(rows, cohorte, minutosMin);
    const actuales = grupo.indices.filter((i) => mismoEquipo(String(rows[i]?.Team ?? ""), destino));
    const perfilDe = (i: number): Perfil => Object.fromEntries(Object.entries(grupo.valores.get(i) ?? {}).map(([id, valor]) => [id, valor.z]));
    const plantilla = actuales.map((i) => ({
      i, nombre: String(rows[i]?.Player ?? ""),
      indice: buildPlayerReport(rows, i, minutosMin, cohorte)?.indice ?? 0,
      minutos: minutos(i),
    }));
    const hecho = { grupo, actuales, perfilDe, plantilla };
    cache.cohortes.set(cohorte, hecho);
    return hecho;
  };

  /** El encaje de una fila. `cohorte` fuerza el grupo (el puesto elegido en Ranking). */
  const para = (indice: number, cohorte?: string): EncajeDeFila | null => {
    if (!activo || !rows[indice]) return null;
    const grupoId = cohorte ?? cohortOf(rows[indice].Position);
    const clave = `${indice}|${grupoId}`;
    if (cache.filas.has(clave)) return cache.filas.get(clave)!;
    const datos = deCohorte(grupoId);
    // Si ya juega en el equipo, se le compara con sus compañeros, no consigo.
    const otros = datos.actuales.filter((i) => i !== indice);
    const puesto = perfilDelPuesto(otros.map((i) => ({ perfil: datos.perfilDe(i), minutos: minutos(i) })));
    // Lo que el scout marcó que el puesto necesita, el mismo ajuste que en la ficha.
    const ajustado = ajustarPuesto(puesto, refuerzosDe(destino, grupoId));
    const comparacion = datos.grupo.valores.has(indice) && otros.length
      ? compararConPuesto(datos.perfilDe(indice), ajustado.perfil, ajustado.pesos) : null;
    const suyo = buildPlayerReport(rows, indice, minutosMin, grupoId)?.indice;
    const plantilla = datos.plantilla.filter((p) => p.i !== indice);
    const nivel = suyo != null && plantilla.length ? nivelFrenteAPlantilla(suyo, plantilla) : null;
    const presencia = alineaciones ? presenciaDelPuesto(alineaciones, rows[indice].Position) : null;
    const resultado: EncajeDeFila = {
      equipo: llegada?.equipo ?? destino,
      puesto: comparacion?.parecido ?? null,
      lugar: nivel ? { lugar: nivel.lugar, de: nivel.de } : null,
      sitio: presencia?.porcentajeRol ?? null,
      refuerzos: Object.keys(ajustado.pesos),
    };
    cache.filas.set(clave, resultado);
    return resultado;
  };

  return { activo, para, cargandoSitio: activo && Boolean(llegada) && !alineaciones && !error };
}
