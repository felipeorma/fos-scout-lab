import type { DataRow, SourceDataset } from "./scouting.ts";

/**
 * De qué liga y de qué año viene cada jugador de una base cruzada.
 *
 * Al cruzar varias bases, cada fila conserva en "Data sources" el nombre de
 * los archivos de los que salió. Como sabemos con qué liga y qué temporada
 * entró cada archivo, basta buscar el nombre dentro de esa cadena. Se busca
 * por inclusión y no partiendo por comas: hay ligas con coma en el nombre y
 * partir ahí las rompería.
 *
 * Un jugador puede tener dos ligas —cambió de competición dentro del año, o
 * subió del filial— y en ese caso basta con que una coincida con el filtro.
 */

export type Procedencia = {
  /** La liga sin temporada: "Canadian Premier League". */
  liga: string;
  /** El año de arranque: 2025 tanto en "2025" como en "2025/2026". */
  anio: number;
  /** Los archivos que la representan; la capa de SkillCorner va con la suya. */
  archivos: string[];
};

const PROVEEDOR = /^(StatsBomb|SkillCorner|Wyscout)\s*·\s*/i;
const TEMPORADA_FINAL = /\s+(\d{4})(?:\s*\/\s*\d{2,4})?$/;

/**
 * La liga y el año detrás del nombre de un archivo.
 *
 * Los de la API se llaman "StatsBomb · Liga Temporada" y su capa física
 * "SkillCorner · Liga Temporada": quitado el proveedor, las dos caen en la
 * misma liga, que es lo correcto —la capa no es otra competición, es la misma
 * con más columnas—. Un Excel de Wyscout se queda con su nombre de archivo.
 */
export function ligaYAnioDe(nombreArchivo: string) {
  const sinProveedor = nombreArchivo.replace(PROVEEDOR, "").trim();
  const temporada = sinProveedor.match(TEMPORADA_FINAL);
  return {
    liga: (temporada ? sinProveedor.slice(0, temporada.index).trim() : sinProveedor) || nombreArchivo,
    anio: temporada ? Number(temporada[1]) : 0,
  };
}

/** Las ligas presentes en un conjunto de bases, ordenadas para un desplegable. */
export function ligasDeBases(bases: SourceDataset[]): Procedencia[] {
  const grupos = new Map<string, Procedencia>();
  for (const base of bases) {
    const { liga, anio } = ligaYAnioDe(base.fileName);
    const clave = `${liga}·${anio}`;
    const previa = grupos.get(clave);
    if (previa) previa.archivos.push(base.fileName);
    else grupos.set(clave, { liga, anio, archivos: [base.fileName] });
  }
  return [...grupos.values()].sort(
    (a, b) => a.liga.localeCompare(b.liga, "es") || a.anio - b.anio,
  );
}

/** Para cada fila, las ligas y los años de los que procede. */
export function origenPorFila(rows: DataRow[], procedencias: Procedencia[]) {
  return rows.map((fila) => {
    const fuentes = String(fila["Data sources"] ?? "");
    const ligas: string[] = [];
    const anios: number[] = [];
    /*
     * Las claves llevan liga Y año juntos, no por separado.
     *
     * Los filtros preguntan por una cosa o por la otra —"de la Eerste
     * Divisie", "de 2025"— y para eso valen las dos listas. Pero medir los
     * percentiles "contra los suyos" necesita el par exacto: con la Eerste
     * Divisie 2025 y la 2026 cargadas, agrupar solo por liga mete las dos
     * temporadas en el mismo saco, y entonces comparar a un jugador de 2025
     * con su versión de 2026 los mide contra la mezcla en vez de contra sus
     * respectivos rivales, que es justo lo que se quería evitar.
     */
    const claves: string[] = [];
    for (const procedencia of procedencias) {
      if (!procedencia.archivos.some((archivo) => fuentes.includes(archivo))) continue;
      if (!ligas.includes(procedencia.liga)) ligas.push(procedencia.liga);
      if (procedencia.anio && !anios.includes(procedencia.anio)) anios.push(procedencia.anio);
      const clave = procedencia.anio ? `${procedencia.liga} ${procedencia.anio}` : procedencia.liga;
      if (!claves.includes(clave)) claves.push(clave);
    }
    return { ligas, anios, claves };
  });
}
