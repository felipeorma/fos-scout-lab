"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useCruceDeAnios } from "./estudio/useCruceDeAnios";
import { type DataRow, type SourceDataset } from "@/lib/scouting";
import { FILTROS_VACIOS, cuantosFiltrosActivos, cuantosFiltrosDeJugador, pasaLosFiltros, pasaLosFiltrosDeJugador, resumirFilas, type FiltrosGlobales } from "@/lib/filtros";
import { playerPassports } from "@/lib/similarity";
import { ligasDeBases, origenPorFila, type Procedencia } from "@/lib/procedencia";
import { opcionesDePeriodo, type OpcionDePeriodo, type PeriodoDeLista } from "@/lib/periodoDeLista";
import { tf } from "@/lib/i18n";

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

/* El tipo y los valores por defecto viven en lib/filtros.ts, donde se pueden
   probar sin montar React. Se reexportan para que las pantallas sigan
   importándolos de un solo sitio. */
export type { FiltrosGlobales };
export { FILTROS_VACIOS };

export type OpcionesDeFiltro = {
  ligas: string[];
  anios: number[];
  equipos: string[];
  pasaportes: string[];
};

type Origen = { ligas: string[]; anios: number[]; claves: string[] };

export type { PeriodoDeLista, OpcionDePeriodo };

/**
 * La base vista con un período: lo que usan las listas (Ranking, Pizarra).
 *
 * Las filas de la base juntan TODAS las temporadas cargadas de cada jugador,
 * y el filtro de año solo decide quién aparece, no con qué se le mide: con
 * 2025 y 2026 cargados, "Año 2026" enseñaba la mezcla de los dos años de
 * quien jugó ambos. Aquí la lista se rehace con las temporadas elegidas —una,
 * o la media explícita de varias— y nada más; los demás jugadores, también.
 */
export type VistaDelPeriodo = {
  periodo: PeriodoDeLista;
  clave: string;
  /** "Temporada 2026" o "Media de 2025 + 2026": lo que dice cada hoja. */
  texto: string;
  opciones: OpcionDePeriodo[];
  elegir: (clave: string) => void;
  rows: DataRow[];
  procedencia: Origen[] | null;
  /** Los filtros globales sobre estas filas (el de año no: lo decide el período). */
  pasaFiltros: (indice: number) => boolean;
  /** El mismo jugador en las filas de la base, para abrir su ficha (-1 si no está). */
  alBase: (indice: number) => number;
  /** El período se está calculando: mientras, se sigue con el anterior. */
  pendiente: boolean;
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
  /** Cuándo se cargaron sus datos (milisegundos), o null si no hay base. Lo firma el pie del PDF. */
  cargadaEl: number | null;
  /** Liga y año de cada fila, alineado con `rows`. */
  procedencia: Array<{ ligas: string[]; anios: number[]; claves: string[] }> | null;
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
  /** Solo los que describen al jugador: puesto, pasaporte y edad. Lo usa la
   *  pantalla de carreras, que la liga y el club ya los decide ella. */
  pasaFiltrosDeJugador: (indice: number) => boolean;
  /** Cuántos de esos tres están puestos. */
  filtrosDeJugador: number;
  /** Los índices que pasan, calculados una vez. */
  indicesVisibles: number[];
  /** La base con un período elegido, para las listas. */
  vista: VistaDelPeriodo;
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
  cargadaEl: null,
  procedencia: null,
  competiciones: [],
  filtros: FILTROS_VACIOS,
  cambiarFiltros: () => {},
  limpiarFiltros: () => {},
  filtrosActivos: 0,
  opciones: { ligas: [], anios: [], equipos: [], pasaportes: [] },
  pasaFiltros: () => true,
  pasaFiltrosDeJugador: () => true,
  filtrosDeJugador: 0,
  indicesVisibles: [],
  vista: {
    periodo: { modo: "una", anios: [] }, clave: "", texto: "", opciones: [], elegir: () => {},
    rows: [], procedencia: null, pasaFiltros: () => true, alBase: (indice) => indice, pendiente: false,
  },
};

const claveDeFila = (fila: DataRow | undefined) => `${String(fila?.Player ?? "")}|${String(fila?.["Birth date"] ?? "")}`;


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
  activas,
  conVista = false,
}: {
  rows: DataRow[];
  datasets: SourceDataset[];
  /** Las bases encendidas (sin las apagadas): con ellas se rehace el período. */
  activas?: SourceDataset[];
  /** Si alguna lista está abierta: el período solo se cruza entonces (es un cruce entero). */
  conVista?: boolean;
  nombre: string;
  /** El mínimo de minutos vive fuera porque la ficha ya lo tenía y varias
   *  pantallas lo escriben; aquí solo se refleja. */
  minutosMin: number;
  onMinutosMin: (minutos: number) => void;
}): BaseActiva {
  const [filtros, setFiltros] = useState<FiltrosGlobales>(FILTROS_VACIOS);

  const competiciones = useMemo(() => ligasDeBases(datasets), [datasets]);
  // La más antigua de las bases: es la fecha que limita lo que dicen los datos.
  const cargadaEl = useMemo(() => {
    const momentos = datasets.map((dataset) => dataset.cargadoEl).filter((momento): momento is number => Number.isFinite(momento));
    return momentos.length ? Math.min(...momentos) : null;
  }, [datasets]);
  const procedencia = useMemo(
    () => (competiciones.length ? origenPorFila(rows, competiciones) : null),
    [rows, competiciones],
  );

  const opciones = useMemo<OpcionesDeFiltro>(() => {
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
    return {
      ligas: [...new Set(competiciones.map((c) => c.liga))].sort((a, b) => a.localeCompare(b, "es")),
      anios: [...new Set(competiciones.map((c) => c.anio).filter(Boolean))].sort(),
      equipos: [...equipos].sort((a, b) => a.localeCompare(b, "es")),
      pasaportes: [...pasaportes.values()].sort((a, b) => a.localeCompare(b, "es")),
    };
  }, [rows, competiciones]);

  const resumen = useMemo(() => resumirFilas(rows), [rows]);

  const pasaFiltros = useCallback(
    (indice: number) => pasaLosFiltros(resumen[indice], procedencia?.[indice], { ...filtros, minutosMin }),
    [resumen, procedencia, filtros, minutosMin],
  );

  const pasaFiltrosDeJugador = useCallback(
    (indice: number) => pasaLosFiltrosDeJugador(resumen[indice], { ...filtros, minutosMin }),
    [resumen, filtros, minutosMin],
  );
  const filtrosDeJugador = useMemo(() => cuantosFiltrosDeJugador(filtros), [filtros]);

  const indicesVisibles = useMemo(() => {
    const salida: number[] = [];
    for (let i = 0; i < rows.length; i += 1) if (pasaFiltros(i)) salida.push(i);
    return salida;
  }, [rows.length, pasaFiltros]);

  const filtrosActivos = useMemo(() => cuantosFiltrosActivos(filtros), [filtros]);

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
    // Por el traductor: esta cadena acaba impresa en la ficha, y en inglés
    // tiene que decir "competitions", no "competiciones".
    const cuantas = ligas.length === 1
      ? tf("{n} competición", { n: ligas.length })
      : tf("{n} competiciones", { n: ligas.length });
    return [cuantas, temporada].filter(Boolean).join(" · ");
  }, [competiciones, nombre]);

  // ---- La vista por período, para las listas ----
  const encendidas = activas ?? datasets;
  /*
   * Las temporadas se cuentan por el año con que se cruzan las bases: el
   * final (una 2025/2026 es 2026, como una 2026). El chip dice cómo las
   * escribe cada archivo. Por defecto, el año con más competiciones: con
   * todas las ligas cargadas, el de la temporada en curso.
   */
  const deLasTemporadas = useMemo(() => opcionesDePeriodo(encendidas), [encendidas]);
  const [claveDePeriodo, setClaveDePeriodo] = useState("");
  const opcionElegida = deLasTemporadas.opciones.find((opcion) => opcion.clave === claveDePeriodo)
    ?? deLasTemporadas.opciones.find((opcion) => opcion.clave === deLasTemporadas.porDefecto)
    ?? deLasTemporadas.opciones[0] ?? null;
  // Si el período cubre todo lo cargado, sirven las filas de la base; si no, se cruza.
  const cubreTodo = !opcionElegida || deLasTemporadas.anios.every((anio) => opcionElegida.periodo.anios.includes(anio));
  const claveDelCruce = conVista && opcionElegida && !cubreTodo ? [...opcionElegida.periodo.anios].sort((a, b) => b - a).join(",") : "";
  const cruce = useCruceDeAnios(encendidas, claveDelCruce);
  const filasNuevas = cubreTodo ? rows : cruce;
  // Mientras se rehace, se sigue con el último período listo: volver un
  // momento a "todo junto" haría bailar la lista.
  const [anterior, setAnterior] = useState<DataRow[] | null>(null);
  if (filasNuevas && filasNuevas !== anterior) setAnterior(filasNuevas);
  const filasDeVista = filasNuevas ?? anterior ?? rows;
  const procedenciaDeVista = useMemo(
    () => (filasDeVista === rows ? procedencia : competiciones.length ? origenPorFila(filasDeVista, competiciones) : null),
    [filasDeVista, rows, procedencia, competiciones],
  );
  const resumenDeVista = useMemo(() => (filasDeVista === rows ? resumen : resumirFilas(filasDeVista)), [filasDeVista, rows, resumen]);
  const pasaFiltrosDeVista = useCallback(
    (indice: number) => pasaLosFiltros(resumenDeVista[indice], procedenciaDeVista?.[indice], { ...filtros, anio: 0, minutosMin }),
    [resumenDeVista, procedenciaDeVista, filtros, minutosMin],
  );
  const indicePorClave = useMemo(() => {
    const mapa = new Map<string, number>();
    rows.forEach((fila, indice) => { const clave = claveDeFila(fila); if (!mapa.has(clave)) mapa.set(clave, indice); });
    return mapa;
  }, [rows]);
  const alBase = useCallback(
    (indice: number) => (filasDeVista === rows ? indice : indicePorClave.get(claveDeFila(filasDeVista[indice])) ?? -1),
    [filasDeVista, rows, indicePorClave],
  );
  const vista = useMemo<VistaDelPeriodo>(() => ({
    periodo: opcionElegida?.periodo ?? { modo: "una", anios: [] },
    clave: opcionElegida?.clave ?? "",
    texto: opcionElegida?.texto ?? "",
    opciones: deLasTemporadas.opciones,
    elegir: setClaveDePeriodo,
    rows: filasDeVista,
    procedencia: procedenciaDeVista,
    pasaFiltros: pasaFiltrosDeVista,
    alBase,
    pendiente: Boolean(claveDelCruce) && !cruce,
  }), [opcionElegida, deLasTemporadas.opciones, filasDeVista, procedenciaDeVista, pasaFiltrosDeVista, alBase, claveDelCruce, cruce]);

  return useMemo<BaseActiva>(() => ({
    rows,
    datasets,
    nombre,
    descripcion,
    cargadaEl,
    procedencia,
    competiciones,
    filtros: { ...filtros, minutosMin },
    cambiarFiltros,
    limpiarFiltros,
    filtrosActivos,
    opciones,
    pasaFiltros,
    pasaFiltrosDeJugador,
    filtrosDeJugador,
    indicesVisibles,
    vista,
  }), [rows, datasets, nombre, descripcion, cargadaEl, procedencia, competiciones, filtros, minutosMin, cambiarFiltros, limpiarFiltros, filtrosActivos, opciones, pasaFiltros, pasaFiltrosDeJugador, filtrosDeJugador, indicesVisibles, vista]);
}

/** Reparte a las pantallas el estado que ya calculó `useEstadoDeBase`. */
export function ProveedorDeBase({ valor, children }: { valor: BaseActiva; children: ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
