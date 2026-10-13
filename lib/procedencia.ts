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
    /** La temporada tal como la escribe el archivo: "2026" o "2025/2026"; vacía si no la dice. */
    temporada: temporada ? temporada[0].replace(/\s+/g, "") : "",
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

const NOMBRE_DE_PLATAFORMA: Record<string, string> = { statsbomb: "StatsBomb", skillcorner: "SkillCorner", wyscout: "Wyscout" };
const sinExtension = (archivo: string) => archivo.replace(/\.(xlsx|xls|csv|tsv|txt)$/i, "");

/** De qué plataforma es un archivo, por cómo se llama. Un Excel subido es Wyscout. */
export function plataformaDe(nombreArchivo: string) {
  const prefijo = nombreArchivo.match(PROVEEDOR)?.[1]?.toLowerCase();
  return prefijo === "statsbomb" || prefijo === "skillcorner" ? prefijo : "wyscout";
}

/**
 * Las bases que alimentan el radar de UN jugador, dichas en una línea.
 *
 * La ficha rotulaba "bases analizadas" con todo lo que había cargado: con las
 * dieciséis ligas dentro, un extremo de la CPL salía firmado como "16
 * competiciones · 2025–2026", que describe el fondo contra el que se le mide,
 * no de dónde salen sus números. Aquí se nombran solo los archivos de los que
 * procede su fila, y de esos solo los de las plataformas que el radar está
 * dibujando: si la capa de SkillCorner está enlazada pero el perfil no enseña
 * ninguna métrica física, no se la cuenta como base analizada.
 *
 * @param fuentes la columna "Data sources" de la fila.
 * @param plataformasDelRadar las `source` de las métricas dibujadas. Vacío =
 *   no hay radar: se nombran todas las bases de la fila.
 */
export function basesDelRadar(fuentes: string, bases: SourceDataset[], plataformasDelRadar: Iterable<string> = []) {
  const dibujadas = new Set(plataformasDelRadar);
  const suyas = bases
    .map((base) => base.fileName)
    .filter((archivo, indice, todos) => todos.indexOf(archivo) === indice)
    .filter((archivo) => fuentes.includes(sinExtension(archivo)));
  const delRadar = suyas.filter((archivo) => !dibujadas.size || dibujadas.has(plataformaDe(archivo)));
  const archivos = delRadar.length ? delRadar : suyas;

  // Liga → temporadas, en el orden en que aparecen. La capa física cae en la
  // misma liga que su base, así que no abre una entrada aparte. La temporada
  // se escribe como la escribe la liga: "2026", o "2025/26" si cruza de año.
  const porLiga = new Map<string, Array<{ anio: number; texto: string }>>();
  for (const archivo of archivos) {
    const nombre = sinExtension(archivo);
    const { liga, anio } = ligaYAnioDe(nombre);
    const cruzada = nombre.match(/(\d{4})\s*\/\s*(\d{2,4})$/);
    const texto = cruzada ? `${cruzada[1]}/${cruzada[2].slice(-2)}` : (anio ? String(anio) : "");
    const temporadas = porLiga.get(liga) ?? [];
    if (texto && !temporadas.some((t) => t.texto === texto)) temporadas.push({ anio, texto });
    porLiga.set(liga, temporadas);
  }
  const rango = (temporadas: Array<{ anio: number; texto: string }>) => (
    [...temporadas].sort((a, b) => a.anio - b.anio).map((t) => t.texto).join(" + ")
  );
  const ligas = [...porLiga.entries()];
  const plataformas = [...new Set(archivos.map(plataformaDe))]
    .sort((a, b) => Object.keys(NOMBRE_DE_PLATAFORMA).indexOf(a) - Object.keys(NOMBRE_DE_PLATAFORMA).indexOf(b))
    .map((plataforma) => NOMBRE_DE_PLATAFORMA[plataforma]);
  return {
    /** Los archivos, tal como se cargaron. */
    archivos,
    /** Liga y temporada de cada una, ya agrupadas: lo que la ficha escribe. */
    ligas: ligas.map(([liga, temporadas]) => ({ liga, temporada: rango(temporadas) })),
    plataformas,
  };
}
