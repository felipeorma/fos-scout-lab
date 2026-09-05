import { cohortOf, findColumn, numeric, percentile, type DataRow } from "@/lib/scouting";
import { playerPassports } from "@/lib/similarity";

/**
 * Arquetipos por posición, al modo de la serie "Smarter Scouting · Profiling
 * Players Beyond the Position Group" de SkillCorner.
 *
 * La idea del artículo: dentro de una misma posición conviven jugadores que
 * no compiten por el mismo puesto. Un central con salida y un central de
 * duelo son buenos en cosas distintas, y ordenarlos en una sola lista los
 * mezcla. Así que en vez de un ranking por posición hay varios, uno por
 * arquetipo, cada uno con sus métricas.
 *
 * Las columnas se leen crudas de la base, como hace el catálogo de contexto,
 * y no del set de métricas del radar: son treinta y tantas y saturarían el
 * selector de métricas del informe sin que nadie las quiera allí.
 *
 * Cuando el artículo nombra una métrica que SkillCorner no expone en nuestro
 * plan —"possessions in build-up", "pass through first line", "recovery press
 * engagements"— se usa la más cercana disponible. La ficha dice siempre qué
 * métricas entraron, para que nadie lea el ranking creyendo que es idéntico
 * al del artículo.
 */

export type MetricaArquetipo = {
  /** Columna tal como la escribe el puente en la base. */
  columna: string;
  etiqueta: string;
  /** Peso dentro del arquetipo. Por defecto 1. */
  peso?: number;
  /** Cuando el valor bajo es el bueno (tiempo de reacción, ser superado). */
  invertida?: boolean;
};

export type Arquetipo = {
  id: string;
  nombre: string;
  /** Qué jugador es este, en lenguaje de entrenador. */
  resumen: string;
  metricas: MetricaArquetipo[];
};

export type GrupoArquetipos = {
  cohortes: string[];
  titulo: string;
  articulo: string;
  arquetipos: Arquetipo[];
};

const m = (columna: string, etiqueta: string, peso?: number, invertida?: boolean): MetricaArquetipo =>
  ({ columna, etiqueta, peso, invertida });

export const ARQUETIPOS: GrupoArquetipos[] = [
  {
    cohortes: ["CB"],
    titulo: "Centrales",
    articulo: "Smarter Scouting · Centre-Backs",
    arquetipos: [
      {
        id: "cb-salida",
        nombre: "Central con salida",
        resumen: "Organiza desde atrás: se ofrece, rompe la primera línea y no pierde el balón cuando le aprietan.",
        metricas: [
          m("Linebreak passes P30 (SC)", "Pases rompe-líneas", 1.4),
          m("Linebreak pass opportunities P30 (SC)", "Ocasiones de romper línea"),
          m("Retention under pressure % (SC)", "Retención bajo presión", 1.2),
          m("Dropping off runs P30 (SC)", "Descuelgues"),
          m("Support runs P30 (SC)", "Apoyos"),
          m("Avg xPass attempted (SC)", "Riesgo del pase", 1, true),
        ],
      },
      {
        id: "cb-duelo",
        nombre: "Central físico y agresivo",
        resumen: "Gana la espalda y el duelo: sale a por el delantero, corrige en carrera y apaga el peligro antes de que crezca.",
        metricas: [
          m("Danger mitigated % (SC)", "Peligro mitigado", 1.4),
          m("Direct regain % (SC)", "Recuperación directa", 1.2),
          m("PSV-99 (SC)", "Velocidad punta"),
          m("Time to sprint (SC)", "Reacción al sprint", 1, true),
          m("Explosive accels to sprint (SC)", "Aceleraciones explosivas"),
          m("Intense duels P30 (SC)", "Duelos intensos"),
        ],
      },
      {
        id: "cb-lector",
        nombre: "Central de anticipación",
        resumen: "Defiende leyendo: obliga al rival hacia atrás y corta la jugada en origen en vez de correr hacia su portería.",
        metricas: [
          m("Forced backward % (SC)", "Obliga a jugar atrás", 1.4),
          m("Linebreak affected % (SC)", "Interviene en rompe-líneas", 1.2),
          m("Defensive duels P30 (SC)", "Duelos defensivos"),
          m("Dangerous situations P30 (SC)", "Situaciones de peligro"),
          m("Pressing chain P30 (SC)", "Cadena de presión"),
        ],
      },
    ],
  },
  {
    cohortes: ["FB"],
    titulo: "Laterales",
    articulo: "Smarter Scouting · Full-Backs",
    arquetipos: [
      {
        id: "fb-flyer",
        nombre: "Lateral de recorrido",
        resumen: "Vive la banda de punta a punta: desdobla, llega al fondo y repite el esfuerzo. El perfil que más kilómetros pide.",
        metricas: [
          m("Overlap underlap runs P30 (SC)", "Desdobles", 1.4),
          m("Ahead of ball runs P30 (SC)", "Carreras por delante del balón", 1.2),
          m("HSR distance (SC)", "Distancia a alta velocidad"),
          m("Sprints (SC)", "Sprints"),
          m("High intensity runs P30 (SC)", "Carreras de alta intensidad"),
        ],
      },
      {
        id: "fb-creador",
        nombre: "Lateral creador",
        resumen: "Su argumento es el último pase: busca al rematador y encuentra al compañero en carrera.",
        metricas: [
          m("Passes to runs P30 (SC)", "Pases a desmarques", 1.4),
          m("Cross receiver runs P30 (SC)", "Llegadas a rematar el centro"),
          m("Dangerous passes P30 (SC)", "Pases peligrosos", 1.2),
          m("Passes to shot within 10s P30 (SC)", "Pases que acaban en remate"),
          m("Half-space runs P30 (SC)", "Carreras al carril interior"),
        ],
      },
      {
        id: "fb-defensivo",
        nombre: "Lateral defensivo",
        resumen: "Primero cierra: gana el uno contra uno en su banda y apaga el peligro sin necesitar ayuda.",
        metricas: [
          m("Danger mitigated % (SC)", "Peligro mitigado", 1.4),
          m("Direct regain % (SC)", "Recuperación directa", 1.2),
          m("Beaten in duel % (SC)", "Superado en duelo", 1, true),
          m("Defensive duels P30 (SC)", "Duelos defensivos"),
          m("Forced backward % (SC)", "Obliga a jugar atrás"),
        ],
      },
    ],
  },
  {
    cohortes: ["DMF", "B2B"],
    titulo: "Mediocentros",
    articulo: "Smarter Scouting · Midfielders",
    arquetipos: [
      {
        id: "mid-organizador",
        nombre: "Organizador",
        resumen: "Da salida limpia bajo presión: pide el balón donde otros no lo piden y mantiene el ritmo de circulación.",
        metricas: [
          m("Linebreak passes P30 (SC)", "Pases rompe-líneas", 1.3),
          m("Retention under pressure % (SC)", "Retención bajo presión", 1.3),
          m("Escaped pressure P30 (SC)", "Escapa de la presión"),
          m("Linebreak options P30 (SC)", "Opciones rompe-líneas"),
          m("Avg xPass attempted (SC)", "Riesgo del pase", 1, true),
        ],
      },
      {
        id: "mid-recuperador",
        nombre: "Recuperador",
        resumen: "Corta antes de que llegue a la zaga: aprieta, gana el duelo y devuelve el balón al equipo.",
        metricas: [
          m("Direct regain % (SC)", "Recuperación directa", 1.4),
          m("Defensive duels P30 (SC)", "Duelos defensivos", 1.2),
          m("Intense duels P30 (SC)", "Duelos intensos"),
          m("Pressing chain P30 (SC)", "Cadena de presión"),
          m("Danger mitigated % (SC)", "Peligro mitigado"),
        ],
      },
      {
        id: "mid-conector",
        nombre: "Conector que progresa",
        resumen: "Gana metros con el balón y conecta líneas: conduce cuando hay campo y suelta cuando toca.",
        metricas: [
          m("Forward long carries P30 (SC)", "Conducciones que ganan campo", 1.3),
          m("Long carries P30 (SC)", "Conducciones largas"),
          m("Long carry retention % (SC)", "Retención al conducir"),
          m("Progressive under pressure P30 (SC)", "Progresa bajo presión", 1.2),
          m("Give and go P30 (SC)", "Pared y devolución"),
        ],
      },
    ],
  },
  {
    cohortes: ["WING", "DWING", "AM"],
    titulo: "Extremos y mediapuntas",
    articulo: "Smarter Scouting · Wingers",
    arquetipos: [
      {
        id: "w-uno-contra-uno",
        nombre: "Uno contra uno",
        resumen: "Encara y pasa: su valor está en romper la línea con el balón controlado, no en el pase.",
        metricas: [
          m("Forward long carries P30 (SC)", "Conducciones que ganan campo", 1.4),
          m("Long carries P30 (SC)", "Conducciones largas", 1.2),
          m("Long carry retention % (SC)", "Retención al conducir"),
          m("Drawing pressure retained % (SC)", "Atrae presión y retiene"),
          m("PSV-99 (SC)", "Velocidad punta"),
        ],
      },
      {
        id: "w-interior",
        nombre: "Interior con gol",
        resumen: "Ataca el área por dentro: se descuelga al carril interior y aparece en zona de remate.",
        metricas: [
          m("Half-space runs P30 (SC)", "Carreras al carril interior", 1.3),
          m("Runs in behind P30 (SC)", "Rupturas a la espalda", 1.3),
          m("Dangerous runs behind P30 (SC)", "Rupturas peligrosas"),
          m("Box options P30 (SC)", "Opciones en el área"),
          m("Receptions in space P30 (SC)", "Recibe en espacio"),
        ],
      },
      {
        id: "w-creador",
        nombre: "Creador",
        resumen: "Hace mejores a los demás: encuentra al compañero en carrera y genera la ocasión desde fuera.",
        metricas: [
          m("Passes to runs P30 (SC)", "Pases a desmarques", 1.4),
          m("Dangerous passes P30 (SC)", "Pases peligrosos", 1.2),
          m("Passes to shot within 10s P30 (SC)", "Pases que acaban en remate"),
          m("Dangerous pass opportunities P30 (SC)", "Ocasiones de pase peligroso"),
          m("Dangerous under pressure P30 (SC)", "Peligro bajo presión"),
        ],
      },
    ],
  },
  {
    cohortes: ["CF"],
    titulo: "Delanteros",
    articulo: "Smarter Scouting · Strikers",
    arquetipos: [
      {
        id: "cf-ruptura",
        nombre: "Delantero de ruptura",
        resumen: "Ataca el espacio a la espalda: su peligro nace del desmarque, no de la asociación.",
        metricas: [
          m("Runs in behind P30 (SC)", "Rupturas a la espalda", 1.4),
          m("Dangerous runs behind P30 (SC)", "Rupturas peligrosas", 1.3),
          m("PSV-99 (SC)", "Velocidad punta"),
          m("High intensity runs P30 (SC)", "Carreras de alta intensidad"),
          m("Runs received P30 (SC)", "Desmarques atendidos"),
        ],
      },
      {
        id: "cf-asociativo",
        nombre: "Delantero asociativo",
        resumen: "Sale de la zona de definición para combinar: retiene de espaldas y libera espacio a las llegadas.",
        metricas: [
          m("Retention under pressure % (SC)", "Retención bajo presión", 1.4),
          m("Passes to runs P30 (SC)", "Pases a desmarques", 1.2),
          m("Give and go P30 (SC)", "Pared y devolución"),
          m("Drawing pressure retained % (SC)", "Atrae presión y retiene"),
          m("Dropping off runs P30 (SC)", "Descuelgues"),
        ],
      },
      {
        id: "cf-area",
        nombre: "Nueve de área",
        resumen: "Vive dentro del área: pisa zona de remate y termina la jugada que otros construyen.",
        metricas: [
          m("Box options P30 (SC)", "Opciones en el área", 1.4),
          m("Cross receiver runs P30 (SC)", "Llegadas a rematar el centro", 1.2),
          m("Receptions in space P30 (SC)", "Recibe en espacio"),
          m("Dangerous under pressure P30 (SC)", "Peligro bajo presión"),
          m("Ahead of ball runs P30 (SC)", "Carreras por delante del balón"),
        ],
      },
    ],
  },
];

/** El grupo de arquetipos que responde a una cohorte, si lo hay. */
export function grupoDeCohorte(cohorte: string): GrupoArquetipos | null {
  return ARQUETIPOS.find((grupo) => grupo.cohortes.includes(cohorte)) ?? null;
}

export type JugadorArquetipo = {
  indice: number;
  nombre: string;
  equipo: string;
  edad: number;
  /** Todos sus pasaportes: un doble nacional cuenta por los dos. */
  pasaportes: string[];
  /** Percentil medio ponderado en las métricas del arquetipo. */
  ajuste: number;
  /** Percentil por métrica, para explicar de dónde sale el ajuste. */
  detalle: Array<{ etiqueta: string; percentil: number }>;
};

export type RankingArquetipo = {
  arquetipo: Arquetipo;
  /** Métricas que la base sí trae; las demás no puntúan a nadie. */
  disponibles: string[];
  faltantes: string[];
  jugadores: JugadorArquetipo[];
};

/**
 * Ranking por arquetipo dentro de una cohorte.
 *
 * El ajuste es la media ponderada de los percentiles del jugador en las
 * métricas del arquetipo, calculados contra los jugadores de su misma
 * posición en la base cargada —no contra la base entera—, igual que el resto
 * de percentiles de la app.
 *
 * Un arquetipo con menos de la mitad de sus métricas en la base no se
 * publica: sería un ranking de otra cosa con el nombre equivocado. Lo mismo
 * con un jugador al que le faltan la mitad de los datos.
 */
export function rankingPorArquetipo(
  rows: DataRow[],
  cohorte: string,
  minutosMin: number,
  minimoCobertura = 0.5,
): RankingArquetipo[] {
  const grupo = grupoDeCohorte(cohorte);
  if (!grupo) return [];

  const headers = [...new Set(rows.flatMap((fila) => Object.keys(fila)))];
  const columnaPosicion = findColumn(headers, ["position", "posicion especifica", "posicion"]);
  const columnaMinutos = findColumn(headers, ["minutes played", "minutes", "minutos jugados", "minutos"]);
  const columnaPasaporte = findColumn(headers, ["passport country", "birth country", "pais de pasaporte", "pais de nacimiento", "nacionalidad"]);

  // El grupo de referencia son los jugadores de la misma posición que pasan
  // el mínimo de minutos: los mismos pares que usa el radar.
  const pares: number[] = [];
  for (let indice = 0; indice < rows.length; indice += 1) {
    const fila = rows[indice];
    if (cohortOf(columnaPosicion ? fila[columnaPosicion] : "") !== cohorte) continue;
    if (minutosMin > 0 && columnaMinutos) {
      const minutos = numeric(fila[columnaMinutos]);
      if (Number.isFinite(minutos) && minutos < minutosMin) continue;
    }
    pares.push(indice);
  }
  if (pares.length < 4) return [];

  const salida: RankingArquetipo[] = [];
  for (const arquetipo of grupo.arquetipos) {
    // Una columna cuenta como presente solo si alguien de la cohorte tiene un
    // número en ella: que exista la cabecera y venga vacía no sirve de nada.
    const disponibles = arquetipo.metricas.filter((metrica) => (
      headers.includes(metrica.columna)
      && pares.some((indice) => Number.isFinite(numeric(rows[indice][metrica.columna])))
    ));
    const faltantes = arquetipo.metricas.filter((metrica) => !disponibles.includes(metrica));
    if (disponibles.length < Math.ceil(arquetipo.metricas.length * minimoCobertura)) continue;

    // Los valores de la cohorte por columna, una sola vez: recalcularlos por
    // jugador multiplicaría el trabajo por el tamaño del plantel.
    const valoresPorColumna = new Map<string, number[]>();
    for (const metrica of disponibles) {
      valoresPorColumna.set(
        metrica.columna,
        pares.map((indice) => numeric(rows[indice][metrica.columna])).filter(Number.isFinite),
      );
    }

    const jugadores: JugadorArquetipo[] = [];
    for (const indice of pares) {
      const fila = rows[indice];
      let suma = 0;
      let pesos = 0;
      const detalle: Array<{ etiqueta: string; percentil: number }> = [];
      for (const metrica of disponibles) {
        const valor = numeric(fila[metrica.columna]);
        if (!Number.isFinite(valor)) continue;
        const percentil = percentile(valor, valoresPorColumna.get(metrica.columna) ?? [], metrica.invertida);
        const peso = metrica.peso ?? 1;
        suma += percentil * peso;
        pesos += peso;
        detalle.push({ etiqueta: metrica.etiqueta, percentil });
      }
      if (!pesos || detalle.length < Math.ceil(disponibles.length * minimoCobertura)) continue;
      jugadores.push({
        indice,
        nombre: String(fila.Player ?? ""),
        equipo: String(fila.Team ?? ""),
        edad: numeric(fila.Age),
        pasaportes: playerPassports(columnaPasaporte ? fila[columnaPasaporte] : ""),
        ajuste: Math.round(suma / pesos),
        detalle: detalle.sort((a, b) => b.percentil - a.percentil),
      });
    }
    jugadores.sort((a, b) => b.ajuste - a.ajuste);
    salida.push({
      arquetipo,
      disponibles: disponibles.map((metrica) => metrica.etiqueta),
      faltantes: faltantes.map((metrica) => metrica.etiqueta),
      jugadores,
    });
  }
  return salida;
}
