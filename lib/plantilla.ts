import { clubsMatch, type DataRow } from "./scouting.ts";

/**
 * Casar los nombres que devuelve SkillCorner con las filas de la base activa.
 *
 * La pantalla de carreras es la única que no sale de la base cruzada: pide los
 * eventos a la API por edición y equipo, así que sus jugadores son nombres
 * sueltos, sin puesto, sin edad y sin pasaporte. Por eso era también la única
 * fuera de la barra de filtros, y preguntar ahí "los sub-23 canadienses de
 * este plantel" no se podía.
 *
 * Esto los enlaza. No hace falta la maquinaria del cruce entre plataformas:
 * ahí se comparan dos bases enteras y hay que temer a los homónimos de otra
 * liga. Aquí el universo es UN plantel de veinticinco nombres, así que basta
 * con el nombre normalizado y, si no, apellido más inicial.
 *
 * Lo que NO hace: inventar. Un jugador de la API que no tenga fila en la base
 * se queda sin puesto ni edad, y quien pregunte por edad tiene que saber que
 * ese se queda fuera, no que no existe.
 */

function normalizar(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const partes = (nombre: string) => normalizar(nombre).split(" ").filter(Boolean);

/** Apellido + inicial: "e bah" para "Elage Bah" y para "Thierno Elage Bah". */
function claveCorta(nombre: string): string {
  const tk = partes(nombre);
  if (tk.length < 2) return "";
  return `${tk[0][0]} ${tk[tk.length - 1]}`;
}

export type PlantillaCasada = {
  /** Índice en la base activa, o -1 si ese nombre no está. */
  indice: (nombre: string) => number;
  /** Cuántos nombres de la API no encontraron fila. */
  sinFicha: number;
  /** Los nombres que se quedaron sin casar, para poder decirlos. */
  nombresSinFicha: string[];
};

/**
 * Empareja los nombres de un plantel con las filas de la base.
 *
 * `equipo` acota el universo antes de comparar: sin él, "Smith" casa con
 * cualquier Smith de las dieciséis ligas cargadas. Cuando el equipo no está en
 * la base —se pidieron carreras de una liga que no se ha cargado— no se casa
 * nada, que es más honesto que casar por nombre a través de media Europa.
 */
export function casarPlantilla(rows: DataRow[], equipo: string, nombres: string[]): PlantillaCasada {
  const porNombre = new Map<string, number>();
  const porClave = new Map<string, number | null>();
  const equipoNormalizado = normalizar(equipo);

  if (equipoNormalizado) {
    for (let i = 0; i < rows.length; i += 1) {
      if (!clubsMatch(normalizar(rows[i].Team), equipoNormalizado)) continue;
      const nombre = normalizar(rows[i].Player);
      if (!nombre) continue;
      if (!porNombre.has(nombre)) porNombre.set(nombre, i);
      const corta = claveCorta(String(rows[i].Player ?? ""));
      if (!corta) continue;
      /* `null` marca ambiguo: dos jugadores del mismo club con el mismo
         apellido e inicial. Ahí la clave corta no puede decidir y se calla. */
      porClave.set(corta, porClave.has(corta) ? null : i);
    }
  }

  const cache = new Map<string, number>();
  const nombresSinFicha: string[] = [];
  const indice = (nombre: string) => {
    const recordado = cache.get(nombre);
    if (recordado !== undefined) return recordado;
    const exacto = porNombre.get(normalizar(nombre));
    let salida = exacto ?? -1;
    if (salida < 0) {
      const corta = claveCorta(nombre);
      const porCorta = corta ? porClave.get(corta) : undefined;
      if (typeof porCorta === "number") salida = porCorta;
    }
    cache.set(nombre, salida);
    return salida;
  };

  for (const nombre of nombres) if (indice(nombre) < 0) nombresSinFicha.push(nombre);
  return { indice, sinFicha: nombresSinFicha.length, nombresSinFicha };
}
