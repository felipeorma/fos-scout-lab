/**
 * Lógica de la mesa de detección de Maldonado.
 *
 * Vive fuera del componente porque es lo que hay que poder probar sin
 * navegador: reconocer a qué liga pertenece un archivo, descontar por nivel de
 * competición, armar el once y comparar el mes contra el anterior. El
 * componente solo dibuja lo que sale de aquí.
 */

/**
 * Mapa de posiciones de Maldonado. Distingue lado —lo que la cohorte de
 * métricas no hace— porque para ellos un lateral izquierdo y uno derecho son
 * puestos distintos a la hora de buscar.
 *
 * Ojo con la separación: se AGRUPA por este mapa, pero el índice se sigue
 * calculando contra la cohorte de métricas. Comparar a un lateral izquierdo
 * solo contra los ocho de la base daría percentiles sin valor; contra todos
 * los laterales, sí.
 */
export const MAPA_MALDONADO: Record<string, string> = {
  GK: "Arquero",
  LB: "Lateral Izquierdo", LWB: "Lateral Izquierdo", RB: "Lateral Derecho", RWB: "Lateral Derecho",
  LCB: "Defensor Central Izquierdo", CB: "Defensor Central", RCB: "Defensor Central Derecho",
  CM: "Contensión", CMF: "Contensión", DMF: "Contensión", CDM: "Contensión", DM: "Contensión",
  LDMF: "Contensión", RDMF: "Contensión",
  LCMF: "Interior Izquierdo", RCMF: "Interior Derecho",
  AMF: "Enganche", CAM: "Enganche", AM: "Enganche", MEDIAPUNTA: "Enganche",
  LM: "Extremo Izquierdo", RM: "Extremo Derecho", LW: "Extremo Izquierdo", LWF: "Extremo Izquierdo",
  RW: "Extremo Derecho", RWF: "Extremo Derecho",
  LAMF: "Interior Izquierdo", RAMF: "Interior Derecho",
  CF: "Delantero",
  // Añadidos al mapa original: Wyscout y StatsBomb marcan al delantero por
  // lado y el mapa de Maldonado no los contempla. Todos son el mismo puesto.
  RCF: "Delantero", LCF: "Delantero", ST: "Delantero", SS: "Delantero", CFW: "Delantero",
};

/** Orden de lectura de una alineación: portería, defensa, medio, ataque. */
export const ORDEN_MALDONADO = [
  "Arquero", "Defensor Central Izquierdo", "Defensor Central", "Defensor Central Derecho",
  "Lateral Izquierdo", "Lateral Derecho", "Contensión", "Interior Izquierdo", "Interior Derecho",
  "Enganche", "Extremo Izquierdo", "Extremo Derecho", "Delantero",
];

export function puestoMaldonado(posicion: unknown) {
  const bruta = String(posicion ?? "").split(",")[0].trim().toUpperCase();
  if (!bruta) return "";
  return MAPA_MALDONADO[bruta] ?? MAPA_MALDONADO[bruta.replace(/[^A-Z]/g, "")] ?? "";
}

export type Ficha = {
  indice: number;
  jugador: string;
  equipo: string;
  edad: number;
  minutos: number;
  perfil: string;
  puesto: string;
  puntuacion: number;
  /** Índice tras el descuento por nivel de liga; igual a puntuacion en la vista de una sola liga. */
  ajustada: number;
  liga: LigaId | "";
  destacadas: Array<{ label: string; percentile: number }>;
  fila: number;
};

// ---------------------------------------------------------------------------
// 1. Detección de liga por nombre de archivo
// ---------------------------------------------------------------------------

export type LigaId =
  | "uruguay-primera"
  | "uruguay-segunda"
  | "argentina-metropolitana"
  | "argentina-nacional"
  | "argentina-primera"
  | "argentina-reserva";

export type LigaMaldonado = {
  id: LigaId;
  nombre: string;
  pais: string;
  /**
   * Cómo se llama la liga en el feed de Opta Power Rankings. `null` significa
   * que Opta no la publica: nunca se inventa un rating, se avisa en pantalla.
   */
  opta: { leagueName: string; countryName: string } | null;
};

/** Las seis ligas del encargo mensual, en orden de nivel esperado. */
export const LIGAS_MALDONADO: LigaMaldonado[] = [
  { id: "argentina-primera", nombre: "Primera División Argentina", pais: "Argentina", opta: { leagueName: "Liga Profesional Argentina", countryName: "Argentina" } },
  { id: "uruguay-primera", nombre: "Primera División Uruguay", pais: "Uruguay", opta: { leagueName: "Uruguay Liga AUF", countryName: "Uruguay" } },
  { id: "argentina-nacional", nombre: "Primera Nacional Argentina", pais: "Argentina", opta: { leagueName: "Argentina Primera Nacional", countryName: "Argentina" } },
  { id: "uruguay-segunda", nombre: "Segunda División Uruguay", pais: "Uruguay", opta: { leagueName: "Segunda División", countryName: "Uruguay" } },
  { id: "argentina-metropolitana", nombre: "Primera B Metropolitana", pais: "Argentina", opta: { leagueName: "Argentina Primera B (Metropolitana)", countryName: "Argentina" } },
  // Opta no rankea torneos de reserva: no hay rating y así se dice en la
  // interfaz, en vez de asignarle uno inventado.
  { id: "argentina-reserva", nombre: "Reserva Argentina", pais: "Argentina", opta: null },
];

export function ligaPorId(id: string | null | undefined): LigaMaldonado | null {
  return LIGAS_MALDONADO.find((liga) => liga.id === id) ?? null;
}

/** Sin extensión, sin acentos, minúsculas y con separadores convertidos en espacios. */
export function normalizarNombreArchivo(nombre: string): string {
  return String(nombre ?? "")
    .replace(/\.(xlsx|xls|csv|json)$/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Reconoce la liga por palabras clave, no por texto exacto: los archivos que
 * llegan cada mes nunca se llaman igual ("Primera Division Uruguay 2026.xlsx",
 * "Argentina - Primera Nacional.xlsx", "wyscout_reserva_arg.xlsx").
 *
 * El ORDEN de las reglas es la regla: "Primera Nacional Argentina" contiene
 * "argentina" y "primera", así que la nacional tiene que resolverse antes que
 * la primera argentina o todo caería en el mismo cajón. Lo mismo con reserva.
 */
export function detectarLiga(nombreArchivo: string): LigaId | null {
  const texto = normalizarNombreArchivo(nombreArchivo);
  if (!texto) return null;
  const tiene = (palabra: string) => new RegExp(`\\b${palabra}\\b`).test(texto);

  if (tiene("uruguay") && tiene("primera")) return "uruguay-primera";
  if (tiene("uruguay") && tiene("segunda")) return "uruguay-segunda";
  if (tiene("metropolitana") || /\bprimera b\b/.test(texto)) return "argentina-metropolitana";
  if (tiene("nacional")) return "argentina-nacional";
  if (tiene("reserva") || tiene("reservas")) return "argentina-reserva";
  if (tiene("argentina") && tiene("primera")) return "argentina-primera";
  return null;
}

/** Clave de localStorage: elecciones manuales archivo → liga, para el mes siguiente. */
export const CLAVE_LIGAS_MANUALES = "fos.maldonado.ligas";
/** Clave de localStorage: escudos subidos por liga, como data URI. */
export const CLAVE_ESCUDOS = "fos.maldonado.escudos";

/**
 * Palabras que cambian de un mes a otro sin cambiar de qué liga se trata.
 * Se quitan de la clave de memoria para que "liga uruguaya julio 2026" y
 * "liga uruguaya agosto 2026" sean el mismo archivo a ojos de la memoria.
 */
const PALABRAS_DE_FECHA = new Set([
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "setiembre", "octubre", "noviembre", "diciembre",
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
  "ene", "feb", "mar", "abr", "jun", "jul", "ago", "sep", "sept", "oct", "nov", "dic",
  "temporada", "season", "export", "wyscout", "copia", "copy", "final", "v",
]);

/**
 * La elección manual se recuerda por el nombre normalizado sin números ni
 * palabras de fecha: el mismo archivo vuelve el mes siguiente con otra fecha o
 * temporada en el nombre y debe seguir reconociéndose ("liga uruguaya julio
 * 2026" → "liga uruguaya"). Si se guardara el nombre entero, la memoria
 * caducaría cada mes y habría que volver a elegir la liga a mano.
 */
export function claveMemoriaArchivo(nombreArchivo: string): string {
  return normalizarNombreArchivo(nombreArchivo)
    .split(" ")
    .filter((palabra) => palabra && !/^\d+$/.test(palabra) && !PALABRAS_DE_FECHA.has(palabra))
    .join(" ");
}

export function detectarLigaConMemoria(nombreArchivo: string, memoria: Record<string, string>): LigaId | null {
  const automatica = detectarLiga(nombreArchivo);
  if (automatica) return automatica;
  const recordada = memoria[claveMemoriaArchivo(nombreArchivo)];
  return ligaPorId(recordada)?.id ?? null;
}

// ---------------------------------------------------------------------------
// 2. Descuento por nivel de liga (Opta Power Rankings)
// ---------------------------------------------------------------------------

export const OPTA_URL = "https://dataviz.theanalyst.com/opta-power-rankings/league-meta.json";

export type OptaLiga = { leagueName?: string; countryName?: string; seasonAverageRating?: number };

/**
 * Respaldo: lectura real del feed el 2026-08-23 (última modificación del
 * archivo: 2026-08-21). No es un valor inventado sino una copia fechada, y la
 * interfaz avisa cuando se está usando esta copia en vez del feed en vivo.
 */
export const RATINGS_RESPALDO: Record<string, number> = {
  "argentina-primera": 81.3712323109,
  "uruguay-primera": 77.0088208728,
  "argentina-nacional": 74.6425263995,
  "uruguay-segunda": 64.1312662509,
  "argentina-metropolitana": 58.9181256166,
};
export const FECHA_RATINGS_RESPALDO = "2026-08-21";

const sinAcentos = (valor: string) => String(valor ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Busca el rating de una liga en el feed. El nombre solo no basta: "Segunda
 * División" aparece tres veces en el feed (Uruguay, y dos países más), así que
 * se exige también el país.
 */
export function ratingOpta(meta: OptaLiga[], liga: LigaMaldonado): number | null {
  if (!liga.opta) return null;
  const objetivoLiga = sinAcentos(liga.opta.leagueName);
  const objetivoPais = sinAcentos(liga.opta.countryName);
  const encontrada = meta.find((entrada) => (
    sinAcentos(entrada.leagueName ?? "") === objetivoLiga
    && sinAcentos(entrada.countryName ?? "") === objetivoPais
  ));
  const rating = Number(encontrada?.seasonAverageRating);
  return Number.isFinite(rating) && rating > 0 ? rating : null;
}

export function ratingsDesdeOpta(meta: OptaLiga[]): Record<string, number | null> {
  const salida: Record<string, number | null> = {};
  for (const liga of LIGAS_MALDONADO) salida[liga.id] = ratingOpta(meta, liga);
  return salida;
}

/**
 * Factor de descuento por liga: el rating de cada una dividido por el de la
 * mejor liga presente en la carga. Un 70 en la Primera B no vale lo mismo que
 * un 70 en Primera Argentina, y sin esto el combinado premiaría a quien juega
 * contra rivales más débiles.
 *
 * Solo entran al cálculo las ligas realmente cargadas: si el mes trae Uruguay
 * Segunda y Primera B, la referencia es la mejor de esas dos, no una liga que
 * no está en la mesa.
 */
export function factoresDeLiga(
  ratings: Record<string, number | null>,
  ligasPresentes: string[],
): Record<string, number> {
  const conRating = ligasPresentes.filter((id) => Number.isFinite(ratings[id] as number) && (ratings[id] as number) > 0);
  const maximo = Math.max(0, ...conRating.map((id) => ratings[id] as number));
  const factores: Record<string, number> = {};
  if (!maximo) return factores;
  for (const id of conRating) factores[id] = (ratings[id] as number) / maximo;
  return factores;
}

/** Ligas cargadas que Opta no publica: se nombran en pantalla, no se rellenan. */
export function ligasSinRating(ratings: Record<string, number | null>, ligasPresentes: string[]): string[] {
  return ligasPresentes.filter((id) => !Number.isFinite(ratings[id] as number) || (ratings[id] as number) <= 0);
}

export function indiceAjustado(indice: number, factor: number | undefined): number {
  if (!Number.isFinite(indice)) return 0;
  if (!Number.isFinite(factor as number) || !factor) return Math.round(indice);
  return Math.round(indice * (factor as number));
}

// ---------------------------------------------------------------------------
// 3. Once ideal en 4-1-2-1-2
// ---------------------------------------------------------------------------

export type PuestoOnce = {
  id: string;
  /** Etiqueta corta para el campo. */
  sigla: string;
  nombre: string;
  /** Puestos del mapa de Maldonado de los que se surte este hueco. */
  fuentes: string[];
  /** Posición sobre el campo, en porcentaje (0-100). El arco propio abajo. */
  x: number;
  y: number;
};

/**
 * 4-1-2-1-2 con el arquero incluido: el enunciado enumera los diez de campo
 * (cuatro atrás, contensión, dos interiores, enganche, dos delanteros), y sin
 * arquero no son once. Los dos centrales y los dos delanteros se surten de un
 * mismo grupo de puestos, y por eso el reparto de candidatos tiene que evitar
 * que el mismo jugador salga en los dos huecos.
 */
export const FORMACION_41212: PuestoOnce[] = [
  { id: "ARQ", sigla: "ARQ", nombre: "Arquero", fuentes: ["Arquero"], x: 50, y: 90 },
  { id: "LI", sigla: "LI", nombre: "Lateral Izquierdo", fuentes: ["Lateral Izquierdo"], x: 14, y: 76 },
  { id: "DFI", sigla: "DFC", nombre: "Defensor Central Izquierdo", fuentes: ["Defensor Central Izquierdo", "Defensor Central", "Defensor Central Derecho"], x: 36, y: 79 },
  { id: "DFD", sigla: "DFC", nombre: "Defensor Central Derecho", fuentes: ["Defensor Central Derecho", "Defensor Central", "Defensor Central Izquierdo"], x: 64, y: 79 },
  { id: "LD", sigla: "LD", nombre: "Lateral Derecho", fuentes: ["Lateral Derecho"], x: 86, y: 76 },
  { id: "CTN", sigla: "CTN", nombre: "Contensión", fuentes: ["Contensión"], x: 50, y: 60 },
  { id: "INI", sigla: "INT", nombre: "Interior Izquierdo", fuentes: ["Interior Izquierdo"], x: 24, y: 48 },
  { id: "IND", sigla: "INT", nombre: "Interior Derecho", fuentes: ["Interior Derecho"], x: 76, y: 48 },
  { id: "ENG", sigla: "ENG", nombre: "Enganche", fuentes: ["Enganche"], x: 50, y: 34 },
  { id: "DL1", sigla: "DEL", nombre: "Delantero", fuentes: ["Delantero"], x: 34, y: 17 },
  { id: "DL2", sigla: "DEL", nombre: "Delantero", fuentes: ["Delantero"], x: 66, y: 17 },
];

export type HuecoOnce = { puesto: PuestoOnce; candidatos: Ficha[] };

/**
 * Arma el once. Cada hueco muestra dos o tres candidatos ordenados por índice.
 *
 * Los huecos que comparten origen (los dos centrales, los dos delanteros) se
 * reparten el mismo grupo por turnos —el mejor al primero, el segundo al
 * segundo, el tercero otra vez al primero— para que ningún jugador aparezca
 * dos veces en el campo y ambos huecos queden con candidatos de nivel parejo.
 *
 * Un central "izquierdo" puede cubrir el hueco derecho si no hay nadie mejor
 * marcado por lado: `fuentes` está ordenado por preferencia y el desempate lo
 * pone el índice, no la etiqueta del export.
 */
export function armarOnce(fichas: Ficha[], porPuesto = 3, usarAjustada = false): HuecoOnce[] {
  const valor = (ficha: Ficha) => (usarAjustada ? ficha.ajustada : ficha.puntuacion);
  const porGrupo = new Map<string, Ficha[]>();
  for (const ficha of fichas) {
    if (!ficha.puesto) continue;
    porGrupo.set(ficha.puesto, [...(porGrupo.get(ficha.puesto) ?? []), ficha]);
  }

  // Huecos que beben del mismo grupo de puestos: se agrupan por su lista de
  // fuentes para poder repartirlos por turnos sin repetir jugador.
  const claveFuentes = (puesto: PuestoOnce) => [...puesto.fuentes].sort().join("|");
  const familias = new Map<string, PuestoOnce[]>();
  for (const puesto of FORMACION_41212) {
    const clave = claveFuentes(puesto);
    familias.set(clave, [...(familias.get(clave) ?? []), puesto]);
  }

  const resultado = new Map<string, Ficha[]>();
  const yaUsados = new Set<number>();
  for (const [, huecos] of familias) {
    const candidatos = huecos[0].fuentes
      .flatMap((fuente) => porGrupo.get(fuente) ?? [])
      .filter((ficha) => !yaUsados.has(ficha.indice))
      .sort((a, b) => valor(b) - valor(a))
      .slice(0, huecos.length * porPuesto);
    for (const ficha of candidatos) yaUsados.add(ficha.indice);
    huecos.forEach((hueco, posicion) => {
      const suyos: Ficha[] = [];
      for (let salto = posicion; salto < candidatos.length; salto += huecos.length) suyos.push(candidatos[salto]);
      resultado.set(hueco.id, suyos.slice(0, porPuesto));
    });
  }

  return FORMACION_41212.map((puesto) => ({ puesto, candidatos: resultado.get(puesto.id) ?? [] }));
}

// ---------------------------------------------------------------------------
// 4. Fotos mensuales y variación
// ---------------------------------------------------------------------------

/**
 * La foto es autosuficiente a propósito: lleva mes, liga y todo lo que
 * identifica al jugador, para que mañana pueda moverse a un repositorio
 * privado sin depender de la base que la generó.
 */
export type FotoJugador = {
  nombre: string;
  club: string;
  puesto: string;
  edad: number | null;
  minutos: number;
  indice: number;
  destacadas: Array<{ metrica: string; percentil: number }>;
};

export type FotoMensual = {
  version: 1;
  mes: string;
  liga: string;
  ligaNombre: string;
  generado: string;
  minutosMin: number;
  jugadores: FotoJugador[];
};

export function fichaAFoto(ficha: Ficha): FotoJugador {
  return {
    nombre: ficha.jugador,
    club: ficha.equipo,
    puesto: ficha.puesto,
    edad: Number.isFinite(ficha.edad) ? ficha.edad : null,
    minutos: Math.round(ficha.minutos),
    indice: ficha.puntuacion,
    destacadas: ficha.destacadas.map((metrica) => ({ metrica: metrica.label, percentil: metrica.percentile })),
  };
}

export function construirFoto(args: {
  mes: string; liga: string; ligaNombre: string; minutosMin: number; fichas: Ficha[];
}): FotoMensual {
  return {
    version: 1,
    mes: args.mes,
    liga: args.liga,
    ligaNombre: args.ligaNombre,
    generado: new Date().toISOString(),
    minutosMin: args.minutosMin,
    jugadores: [...args.fichas].sort((a, b) => b.puntuacion - a.puntuacion).map(fichaAFoto),
  };
}

export type Variacion = {
  nombre: string;
  club: string;
  puesto: string;
  indice: number;
  anterior: number;
  delta: number;
};

export type ComparacionFotos = {
  suben: Variacion[];
  bajan: Variacion[];
  nuevos: FotoJugador[];
  salen: FotoJugador[];
  estables: number;
};

const claveJugador = (nombre: string) => sinAcentos(nombre).replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Lo más valioso del encargo: qué cambió respecto al mes anterior. Un jugador
 * que pasa de 55 a 72 importa más que uno estable en 70.
 *
 * Se cruza por nombre, no por nombre+club: un jugador que cambió de club en el
 * mercado sigue siendo el mismo y no puede leerse como "nuevo". Cuando dos
 * jugadores comparten nombre, el club desempata.
 *
 * `umbral` filtra el ruido: por debajo de 3 puntos de percentil, el movimiento
 * es del tamaño de la muestra, no del jugador.
 */
export function compararFotos(anterior: FotoMensual, actual: FotoMensual, umbral = 3): ComparacionFotos {
  const previos = new Map<string, FotoJugador[]>();
  for (const jugador of anterior.jugadores) {
    const clave = claveJugador(jugador.nombre);
    previos.set(clave, [...(previos.get(clave) ?? []), jugador]);
  }
  const emparejados = new Set<FotoJugador>();
  const suben: Variacion[] = [];
  const bajan: Variacion[] = [];
  const nuevos: FotoJugador[] = [];
  let estables = 0;

  for (const jugador of actual.jugadores) {
    const posibles = previos.get(claveJugador(jugador.nombre)) ?? [];
    const disponibles = posibles.filter((candidato) => !emparejados.has(candidato));
    const previo = disponibles.find((candidato) => claveJugador(candidato.club) === claveJugador(jugador.club))
      ?? disponibles[0];
    if (!previo) {
      nuevos.push(jugador);
      continue;
    }
    emparejados.add(previo);
    const delta = jugador.indice - previo.indice;
    const variacion: Variacion = {
      nombre: jugador.nombre, club: jugador.club, puesto: jugador.puesto,
      indice: jugador.indice, anterior: previo.indice, delta,
    };
    if (delta >= umbral) suben.push(variacion);
    else if (delta <= -umbral) bajan.push(variacion);
    else estables += 1;
  }

  const salen = anterior.jugadores.filter((jugador) => !emparejados.has(jugador));
  suben.sort((a, b) => b.delta - a.delta);
  bajan.sort((a, b) => a.delta - b.delta);
  nuevos.sort((a, b) => b.indice - a.indice);
  salen.sort((a, b) => b.indice - a.indice);
  return { suben, bajan, nuevos, salen, estables };
}

/** Mes en formato AAAA-MM, el que usan los nombres de las fotos. */
export function mesActual(fecha = new Date()): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}
