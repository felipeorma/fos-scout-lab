import { extractSeason, type SourceDataset } from "./scouting.ts";
import { ligaYAnioDe } from "./procedencia.ts";

/**
 * Liga y temporada de una base cargada desde un archivo, escritas a mano.
 *
 * De una base todo se deduce de su nombre de archivo: la liga es el nombre
 * sin el año del final y la temporada ese año (ver ligaYAnioDe). Con la API
 * el nombre lo pone la app ("StatsBomb · Canadian Premier League 2026"), pero
 * un Excel de Wyscout se llama "Search results (3).xlsx", y eso era lo que
 * salía como liga y como temporada en la ficha, los filtros y el panel.
 *
 * Nombrarla es reescribir ese nombre ("Primera División 2026") y su año:
 * así todo lo que se deduce de él se recalcula solo y queda coherente. Y
 * con un año, dos Excel que antes se fundían en una "temporada sin fecha"
 * pasan a ser dos temporadas.
 */

export type NombreDeBase = { liga: string; temporada: string };

const EXTENSION = /\.(xlsx|xls|csv)$/i;

/** "2026", "2025/2026" o "2025/26"; vacía también vale (sin temporada). */
export function temporadaValida(texto: string) {
  const limpio = texto.trim();
  return !limpio || /^\d{4}(\s*\/\s*\d{2}(\d{2})?)?$/.test(limpio);
}

/** Lo que la app deduce hoy de una base, para empezar a editar desde ahí. */
export function nombreActual(dataset: SourceDataset): NombreDeBase {
  const { liga, temporada } = ligaYAnioDe(dataset.fileName.replace(EXTENSION, ""));
  return { liga, temporada };
}

/** La base con su nombre nuevo. Recuerda el original: es su identidad. */
export function aplicarNombre(dataset: SourceDataset, nombre: NombreDeBase): SourceDataset {
  const liga = nombre.liga.trim().replace(/\s+/g, " ");
  const temporada = nombre.temporada.trim().replace(/\s+/g, "");
  if (!liga) return dataset;
  const fileName = temporada ? `${liga} ${temporada}` : liga;
  return { ...dataset, fileName, season: extractSeason(fileName), nombreOriginal: dataset.nombreOriginal ?? dataset.fileName };
}

/**
 * Lo que identifica a una base aunque se haya renombrado.
 *
 * Un archivo es su nombre original Y su contenido: Wyscout llama "Search
 * results" a casi todo, y dos temporadas distintas con el mismo nombre se
 * tomaban por la misma base y una pisaba a la otra al añadir la anterior.
 * Dos copias del mismo archivo siguen siendo una. Las de la API son su
 * competición: una recarga con datos más nuevos sustituye a la vieja en vez
 * de sumarse a ella.
 */
export const identidadDeBase = (dataset: SourceDataset) => (dataset.provider === "statsbomb" || dataset.provider === "skillcorner"
  ? dataset.fileName
  : `${dataset.nombreOriginal ?? dataset.fileName}#${firmaDeBase(dataset)}`);

/**
 * La temporada anterior a una escrita a mano, en el mismo formato: "2026" →
 * "2025", "2025/2026" → "2024/2025", "2025/26" → "2024/25". Vacía si no se
 * puede deducir.
 */
export function temporadaAnteriorDe(temporada: string) {
  const limpia = temporada.trim().replace(/\s+/g, "");
  const cruzada = limpia.match(/^(\d{4})\/(\d{2}|\d{4})$/);
  if (cruzada) {
    const inicio = Number(cruzada[1]) - 1;
    const fin = cruzada[2].length === 4 ? String(Number(cruzada[2]) - 1) : String(Number(cruzada[2]) - 1).padStart(2, "0").slice(-2);
    return `${inicio}/${fin}`;
  }
  return /^\d{4}$/.test(limpia) ? String(Number(limpia) - 1) : "";
}

/**
 * La firma de un archivo: su contenido. Sirve para reconocerlo al volver a
 * subirlo y ponerle el nombre que ya se le dio. El nombre del archivo no
 * vale —Wyscout llama "Search results" a todo—, y los clubes tampoco: dos
 * temporadas de la misma liga pueden tener exactamente los mismos, y así una
 * pisaba el nombre de la otra y al recargar las dos se fundían en una. Se
 * firma cada fila (jugador, club, minutos y partidos), sin importar el orden:
 * el mismo Excel vuelve con su nombre; otra temporada u otra descarga con los
 * minutos al día no se confunde con él, y como mucho hay que nombrarla.
 */
export function firmaDeBase(dataset: SourceDataset) {
  const columna = (patron: RegExp) => dataset.headers.find((cabecera) => patron.test(cabecera.trim())) ?? "";
  const jugador = columna(/^(player|jugador|player name)$/i);
  const club = columna(/^(team|equipo|club)$/i);
  const minutos = columna(/^(minutes played|minutes|minutos jugados|minutos)$/i);
  const partidos = columna(/^(matches played|matches|partidos jugados|partidos)$/i);
  const filas = dataset.rows
    .map((fila) => [jugador, club, minutos, partidos].map((c) => (c ? String(fila[c] ?? "").trim().toLowerCase() : "")).join("¦"))
    .sort();
  const texto = filas.length ? filas.join("\n") : dataset.fileName.toLowerCase();
  let a = 5381, b = 52711;
  for (let i = 0; i < texto.length; i += 1) {
    const codigo = texto.charCodeAt(i);
    a = ((a * 33) ^ codigo) >>> 0;
    b = ((b * 31) + codigo) >>> 0;
  }
  return `${filas.length}-${a.toString(36)}${b.toString(36)}`;
}

// ---- Recordarlos entre sesiones (navegador) ---------------------------------

const CLAVE = "fos-nombres-de-base-v2";

export function leerNombresGuardados(): Record<string, NombreDeBase> {
  try {
    const guardado = window.localStorage.getItem(CLAVE);
    return guardado ? JSON.parse(guardado) as Record<string, NombreDeBase> : {};
  } catch {
    return {};
  }
}

export function guardarNombre(dataset: SourceDataset, nombre: NombreDeBase) {
  try {
    const todos = leerNombresGuardados();
    todos[firmaDeBase(dataset)] = { liga: nombre.liga.trim(), temporada: nombre.temporada.trim() };
    window.localStorage.setItem(CLAVE, JSON.stringify(todos));
  } catch { /* Sin almacenamiento, el nombre vale solo esta sesión. */ }
}

/** Al cargar archivos: los que ya se nombraron otra vez vuelven con su nombre. */
export function conNombresGuardados(datasets: SourceDataset[], guardados = leerNombresGuardados()) {
  return datasets.map((dataset) => {
    const nombre = guardados[firmaDeBase(dataset)];
    return nombre?.liga ? aplicarNombre(dataset, nombre) : dataset;
  });
}
