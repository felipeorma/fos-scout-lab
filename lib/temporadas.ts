/**
 * Qué temporada de cada competición entra en la base.
 *
 * Vive aparte de la capa que habla con las APIs porque no es transporte: es
 * una regla de calendario, la única de la aplicación que decide qué datos son
 * los de "ahora". Aparte también se puede probar sin levantar nada.
 */

/** Lo mínimo que hace falta saber de una competición para elegir su curso. */
export type CompeticionElegible = {
  name: string;
  season: string;
  country?: string;
  /** Si el proveedor ya publicó partidos. Solo StatsBomb lo informa; cuando
   *  viene indefinido se asume que la temporada sirve. */
  hasMatches?: boolean;
};

/**
 * La temporada de cada competición que de verdad sirve hoy.
 *
 * Elegir por el año del calendario parece suficiente hasta que una liga no
 * empieza cuando el año. La NCAA D1 Big Ten es el caso: su curso 2026 figura
 * en el catálogo desde septiembre pero StatsBomb aún no ha publicado un solo
 * partido, así que entraba en la base con cero jugadores y en silencio. Quien
 * la cargaba creía tener fútbol universitario y no tenía nada —justo la liga
 * donde están los canadienses de 18 a 23 años—.
 *
 * La regla: de cada competición, las temporadas del año en curso que tengan
 * partidos publicados; si ninguna los tiene, la más reciente que sí. Se
 * conservan las dos temporadas de las ligas de año cruzado, porque en
 * septiembre la 2025/2026 acaba de terminar y la 2026/2027 lleva tres
 * jornadas: las dos dicen algo.
 */
export function temporadasUtiles<T extends CompeticionElegible>(competiciones: T[]) {
  const anio = String(new Date().getFullYear());
  const grupos = new Map<string, T[]>();
  for (const competicion of competiciones) {
    const clave = `${competicion.name}·${competicion.country ?? ""}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), competicion]);
  }

  const elegidas: T[] = [];
  /** Las que no pudieron dar su temporada en curso, para poder decirlo. */
  const rezagadas: T[] = [];
  for (const entradas of grupos.values()) {
    const jugables = entradas.filter((competicion) => competicion.hasMatches !== false);
    if (!jugables.length) continue;
    const enCurso = jugables.filter((competicion) => String(competicion.season ?? "").includes(anio));
    if (enCurso.length) {
      elegidas.push(...enCurso);
      continue;
    }
    const masReciente = [...jugables].sort(
      (a, b) => String(b.season).localeCompare(String(a.season), "en", { numeric: true }),
    )[0];
    elegidas.push(masReciente);
    rezagadas.push(masReciente);
  }
  return { elegidas, rezagadas };
}

/** El año en que arranca una temporada: 2025 tanto en "2025" como en "2025/2026". */
const anioDeInicio = (temporada: string) => Number(String(temporada ?? "").match(/\d{4}/)?.[0] ?? 0);

/**
 * La temporada que sirve hoy y la anterior, de cada competición.
 *
 * La ficha mide a un jugador con sus dos últimas temporadas cuando existen:
 * en abril, con cinco jornadas jugadas, la temporada en curso sola dice muy
 * poco, y la pasada completa la muestra. Se parte de `temporadasUtiles` y,
 * donde dio una sola, se añade la anterior con partidos. Las ligas de año
 * cruzado que ya entran con dos (en septiembre, la 2025/2026 que acaba de
 * terminar y la 2026/2027 que empieza) no suman una tercera.
 */
export function dosTemporadas<T extends CompeticionElegible>(competiciones: T[]) {
  const { elegidas, rezagadas } = temporadasUtiles(competiciones);
  const clave = (competicion: T) => `${competicion.name}·${competicion.country ?? ""}`;
  const porCompeticion = new Map<string, T[]>();
  for (const competicion of elegidas) porCompeticion.set(clave(competicion), [...(porCompeticion.get(clave(competicion)) ?? []), competicion]);
  const anteriores: T[] = [];
  for (const suyas of porCompeticion.values()) {
    if (suyas.length >= 2) continue;
    const anterior = temporadaAnterior(competiciones, suyas[0]);
    if (anterior) anteriores.push(anterior);
  }
  return { elegidas: [...elegidas, ...anteriores], rezagadas };
}

/** Las temporadas con partidos que arrancan en un año: "2025" trae la 2025 y la 2025/2026. */
export function temporadasDelAnio<T extends CompeticionElegible>(competiciones: T[], anio: string | number) {
  return competiciones.filter((competicion) => competicion.hasMatches !== false && anioDeInicio(competicion.season) === Number(anio));
}

/**
 * La temporada anterior de una competición concreta, si tiene partidos.
 * Para "Añadir una competición": con la temporada elegida entra también la
 * de antes.
 */
export function temporadaAnterior<T extends CompeticionElegible>(competiciones: T[], elegida: T): T | undefined {
  const desde = anioDeInicio(elegida.season);
  return competiciones
    .filter((competicion) => competicion.name === elegida.name && (competicion.country ?? "") === (elegida.country ?? "")
      && competicion.hasMatches !== false && anioDeInicio(competicion.season) < desde)
    .sort((a, b) => String(b.season).localeCompare(String(a.season), "en", { numeric: true }))[0];
}
