"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cohortOf, detectCoreColumns, headersOf, positionColumnOf, type DataRow, type SourceDataset } from "@/lib/scouting";
import { playerPassports } from "@/lib/similarity";
import { ligasDeBases, origenPorFila, type Procedencia } from "@/lib/procedencia";

/**
 * La base activa y su red de filtros, una sola para toda la plataforma.
 *
 * Antes cada pantalla se traía la suya. El buscador entre ligas llegó a
 * mantener un fondo aparte, cargado con sus propias peticiones, así que las
 * mismas competiciones se descargaban dos veces y no se enteraban entre ellas.
 * Y los filtros habían crecido por separado: el ranking tenía siete y contexto
 * dos, de modo que la misma pregunta daba respuestas distintas según la
 * pestaña. Todo eso vive ahora aquí.
 *
 * La regla que ordena el conjunto, y que conviene no romper:
 *
 * - Los filtros de MERCADO —liga, año, club, pasaporte, edad, puesto— acotan a
 *   QUIÉN ves, nunca CÓMO se le mide. Los percentiles se siguen calculando
 *   contra la base entera. Si estrecharan el grupo de referencia, cerrar una
 *   competición movería el número de todos los demás y las cifras cambiarían
 *   bajo los pies sin que nadie lo pidiera.
 * - El mínimo de MINUTOS es la excepción, y lo es a propósito: define quién
 *   cuenta como jugador comparable, así que sí entra en el grupo de referencia.
 *   Es el mismo criterio en la ficha, en el ranking y en la similitud.
 */

export type FiltrosGlobales = {
  /** "TODAS" o el nombre de la liga. */
  liga: string;
  /** 0 = todos los años. */
  anio: number;
  /** "TODOS" o el nombre del club. */
  equipo: string;
  /** "TODOS" o el pasaporte; cuenta también el secundario. */
  pasaporte: string;
  /** "" = sin filtrar por puesto; si no, la cohorte (CB, WING…). */
  puesto: string;
  /** Entra en el grupo de referencia, no solo en la vista. */
  minutosMin: number;
  /** 0 = sin tope. */
  edadMax: number;
};

export const FILTROS_VACIOS: FiltrosGlobales = {
  liga: "TODAS",
  anio: 0,
  equipo: "TODOS",
  pasaporte: "TODOS",
  puesto: "",
  minutosMin: 500,
  edadMax: 0,
};

export type OpcionesDeFiltro = {
  ligas: string[];
  anios: number[];
  equipos: string[];
  pasaportes: string[];
};

export type BaseActiva = {
  /** Las filas ya cruzadas. */
  rows: DataRow[];
  /** Las bases que se cruzaron para armarlas. */
  datasets: SourceDataset[];
  /** Nombre visible de la base activa. */
  nombre: string;
  /**
   * Qué hay cargado, dicho en una línea.
   *
   * El nombre interno de una base cruzada es "Combinación temporal 01", que
   * no dice nada de lo que estás mirando: ni qué ligas ni de qué temporada.
   * En un informe que se enseña a un director deportivo eso es peor que no
   * poner nada. Con una o dos competiciones se nombran; con más se cuentan,
   * porque una lista de dieciséis no cabe ni se lee.
   */
  descripcion: string;
  /** Liga y año de cada fila, alineado con `rows`. */
  procedencia: Array<{ ligas: string[]; anios: number[] }> | null;
  /** Las competiciones cargadas, con sus archivos. */
  competiciones: Procedencia[];

  filtros: FiltrosGlobales;
  cambiarFiltros: (cambio: Partial<FiltrosGlobales>) => void;
  limpiarFiltros: () => void;
  /** Cuántos filtros de mercado están activos, para poder avisarlo. */
  filtrosActivos: number;

  opciones: OpcionesDeFiltro;
  /** ¿Esta fila pasa los filtros de mercado? El minuto va aparte. */
  pasaFiltros: (indice: number) => boolean;
  /** Los índices que pasan, calculados una vez. */
  indicesVisibles: number[];
};

const Contexto = createContext<BaseActiva | null>(null);

/**
 * Un valor inerte para cuando no hay proveedor. No lanza: hay pantallas que se
 * montan antes de que haya base y no deberían romperse por preguntar.
 */
const VACIA: BaseActiva = {
  rows: [],
  datasets: [],
  nombre: "",
  descripcion: "",
  procedencia: null,
  competiciones: [],
  filtros: FILTROS_VACIOS,
  cambiarFiltros: () => {},
  limpiarFiltros: () => {},
  filtrosActivos: 0,
  opciones: { ligas: [], anios: [], equipos: [], pasaportes: [] },
  pasaFiltros: () => true,
  indicesVisibles: [],
};

export function useBaseActiva() {
  return useContext(Contexto) ?? VACIA;
}

/**
 * El estado de la base activa, como hook.
 *
 * Está separado del proveedor porque quien lo reparte también lo necesita: la
 * pantalla que envuelve a todas las demás no puede consumir su propio
 * contexto, y duplicar el cálculo daría dos verdades que se irían separando.
 * Así hay una sola: se llama al hook, se usa lo que hace falta y se pasa el
 * mismo valor al proveedor para los hijos.
 */
export function useEstadoDeBase({
  rows,
  datasets,
  nombre,
  minutosMin,
  onMinutosMin,
}: {
  rows: DataRow[];
  datasets: SourceDataset[];
  nombre: string;
  /** El mínimo de minutos vive fuera porque la ficha ya lo tenía y varias
   *  pantallas lo escriben; aquí solo se refleja. */
  minutosMin: number;
  onMinutosMin: (minutos: number) => void;
}): BaseActiva {
  const [filtros, setFiltros] = useState<FiltrosGlobales>(FILTROS_VACIOS);

  const competiciones = useMemo(() => ligasDeBases(datasets), [datasets]);
  const procedencia = useMemo(
    () => (competiciones.length ? origenPorFila(rows, competiciones) : null),
    [rows, competiciones],
  );

  const opciones = useMemo<OpcionesDeFiltro>(() => {
    const headers = headersOf(rows);
    const core = detectCoreColumns(headers);
    const equipos = new Set<string>();
    const pasaportes = new Map<string, string>();
    for (const fila of rows) {
      const equipo = String(fila.Team ?? "").trim();
      if (equipo) equipos.add(equipo);
      for (const pasaporte of playerPassports(fila["Passport country"])) {
        const clave = pasaporte.trim().toLowerCase();
        if (clave && !pasaportes.has(clave)) pasaportes.set(clave, pasaporte.trim());
      }
    }
    void core;
    return {
      ligas: [...new Set(competiciones.map((c) => c.liga))].sort((a, b) => a.localeCompare(b, "es")),
      anios: [...new Set(competiciones.map((c) => c.anio).filter(Boolean))].sort(),
      equipos: [...equipos].sort((a, b) => a.localeCompare(b, "es")),
      pasaportes: [...pasaportes.values()].sort((a, b) => a.localeCompare(b, "es")),
    };
  }, [rows, competiciones]);

  /** Índice de apoyo para no releer la fila entera en cada comprobación. */
  const resumen = useMemo(() => {
    const headers = headersOf(rows);
    const core = detectCoreColumns(headers);
    const columnaPuesto = positionColumnOf(headers);
    return rows.map((fila) => ({
      equipo: String(fila.Team ?? "").trim(),
      pasaportes: playerPassports(fila["Passport country"]).map((x) => x.trim().toLowerCase()),
      puesto: cohortOf(columnaPuesto ? fila[columnaPuesto] : ""),
      edad: Number(String(fila.Age ?? "").replace(",", ".")),
      minutos: Number(String(fila[core.minutes] ?? "").replace(",", ".")),
    }));
  }, [rows]);

  const pasaFiltros = useCallback((indice: number) => {
    const fila = resumen[indice];
    if (!fila) return false;
    if (filtros.equipo !== "TODOS" && fila.equipo !== filtros.equipo) return false;
    if (filtros.puesto && fila.puesto !== filtros.puesto) return false;
    if (filtros.pasaporte !== "TODOS" && !fila.pasaportes.includes(filtros.pasaporte.toLowerCase())) return false;
    if (filtros.edadMax > 0 && !(Number.isFinite(fila.edad) && fila.edad <= filtros.edadMax)) return false;
    if (filtros.liga !== "TODAS" || filtros.anio) {
      const origen = procedencia?.[indice];
      if (!origen) return false;
      if (filtros.liga !== "TODAS" && !origen.ligas.includes(filtros.liga)) return false;
      if (filtros.anio && !origen.anios.includes(filtros.anio)) return false;
    }
    return true;
  }, [resumen, filtros, procedencia]);

  const indicesVisibles = useMemo(() => {
    const salida: number[] = [];
    for (let i = 0; i < rows.length; i += 1) if (pasaFiltros(i)) salida.push(i);
    return salida;
  }, [rows.length, pasaFiltros]);

  const filtrosActivos = useMemo(() => (
    (filtros.liga !== "TODAS" ? 1 : 0)
    + (filtros.anio ? 1 : 0)
    + (filtros.equipo !== "TODOS" ? 1 : 0)
    + (filtros.pasaporte !== "TODOS" ? 1 : 0)
    + (filtros.puesto ? 1 : 0)
    + (filtros.edadMax > 0 ? 1 : 0)
  ), [filtros]);

  const cambiarFiltros = useCallback((cambio: Partial<FiltrosGlobales>) => {
    if (cambio.minutosMin !== undefined) onMinutosMin(Math.max(0, cambio.minutosMin));
    setFiltros((actuales) => ({ ...actuales, ...cambio }));
  }, [onMinutosMin]);

  const limpiarFiltros = useCallback(() => {
    setFiltros({ ...FILTROS_VACIOS, minutosMin });
  }, [minutosMin]);

  const descripcion = useMemo(() => {
    if (!competiciones.length) return nombre;
    const anios = [...new Set(competiciones.map((c) => c.anio).filter(Boolean))].sort();
    const temporada = anios.length > 1 ? `${anios[0]}–${anios[anios.length - 1]}` : String(anios[0] ?? "");
    const ligas = [...new Set(competiciones.map((c) => c.liga))];
    if (ligas.length <= 2) return [ligas.join(" · "), temporada].filter(Boolean).join(" · ");
    return [`${ligas.length} ${ligas.length === 1 ? "competición" : "competiciones"}`, temporada].filter(Boolean).join(" · ");
  }, [competiciones, nombre]);

  return useMemo<BaseActiva>(() => ({
    rows,
    datasets,
    nombre,
    descripcion,
    procedencia,
    competiciones,
    filtros: { ...filtros, minutosMin },
    cambiarFiltros,
    limpiarFiltros,
    filtrosActivos,
    opciones,
    pasaFiltros,
    indicesVisibles,
  }), [rows, datasets, nombre, descripcion, procedencia, competiciones, filtros, minutosMin, cambiarFiltros, limpiarFiltros, filtrosActivos, opciones, pasaFiltros, indicesVisibles]);
}

/** Reparte a las pantallas el estado que ya calculó `useEstadoDeBase`. */
export function ProveedorDeBase({ valor, children }: { valor: BaseActiva; children: ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
