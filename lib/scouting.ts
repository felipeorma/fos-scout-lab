import { formatPlayerPositions, mergePlayerPositions, primaryPositionRole, roleCohort } from "./positions.ts";
import { numberLocale, t, tf } from "./i18n.ts";
import { SIMILARITY_METRIC_GROUPS, similarityMetricGroup } from "./similarityMetricGroups.ts";

export type CellValue = string | number | boolean | Date | null | undefined;
export type DataRow = Record<string, CellValue>;

export type SourceDataset = {
  fileName: string;
  season: number;
  headers: string[];
  rows: DataRow[];
};

export type AggregationResult = {
  rows: DataRow[];
  headers: string[];
  playerColumn: string;
  minutesColumn: string;
  matchesColumn: string;
  warnings: string[];
};

export type MetricColorGroup = "finishing" | "creating" | "passing" | "defending" | "goalkeeper";

export type RadarMetric = {
  key: string;
  label: string;
  value: number;
  percentile: number;
  group: number;
  colorGroup?: MetricColorGroup;
  inverse?: boolean;
  /** Nº de valores reales de la cohorte contra los que se calculó el percentil */
  sample?: number;
};

export type PlayerReport = {
  player: string;
  team: string;
  position: string;
  cohort: string;
  age: string;
  foot: string;
  passport: string;
  marketValue: string;
  contract: string;
  matches: number;
  minutes: number;
  goals: number;
  assists: number;
  cohortSize: number;
  score: number;
  metrics: RadarMetric[];
  reading: string;
};

const PLAYER_ALIASES = ["player", "jugador", "player name", "nombre jugador"];
const MINUTES_ALIASES = ["minutes played", "minutes", "mins", "minutos jugados", "minutos"];
const MATCHES_ALIASES = ["matches played", "matches", "apps", "appearances", "partidos jugados", "partidos"];
const AGE_ALIASES = ["age", "edad"];
const POSITION_ALIASES = ["position", "posicion especifica", "posicion"];
const TEAM_ALIASES = ["team within selected timeframe", "equipo durante el periodo seleccionado", "team", "equipo"];

export function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

export function extractSeason(fileName: string) {
  // Preferir siempre el último año de 4 dígitos ("U23 2026.xlsx" → 2026, no
  // 2023); solo si no existe, aceptar un número de 2 dígitos aislado.
  const fullYears = fileName.match(/\b(?:19|20)\d{2}\b/g);
  if (fullYears?.length) return Number(fullYears[fullYears.length - 1]);
  const shortYears = fileName.match(/\b\d{2}\b/g);
  if (shortYears?.length) return 2000 + Number(shortYears[shortYears.length - 1]);
  return 0;
}

export function numeric(value: CellValue): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  if (value === null || value === undefined || value === "") return Number.NaN;
  const raw = String(value).trim().replace(/%$/, "").replace(/\s/g, "");
  // "2,340" / "2.340" / "1,234,567" son números con separador de miles, no
  // decimales: grupos de exactamente 3 dígitos tras el primer separador.
  if (/^[+-]?\d{1,3}([.,]\d{3})+$/.test(raw)) {
    return Number(raw.replace(/[.,]/g, ""));
  }
  const normalized = raw.includes(",") && raw.includes(".")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeIdentityText(value: CellValue) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeIdentityAge(value: CellValue) {
  const age = numeric(value);
  return Number.isFinite(age) ? String(age) : normalizeIdentityText(value);
}

export function findColumn(headers: string[], aliases: string[], contains = false) {
  const normalized = headers.map((header) => [header, normalizeHeader(header)] as const);
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    const match = normalized.find(([, header]) => contains ? header.includes(target) : header === target);
    if (match) return match[0];
  }
  return "";
}

export function detectCoreColumns(headers: string[]) {
  const player = findColumn(headers, PLAYER_ALIASES) || findColumn(headers, ["player", "jugador"], true);
  const minutes = findColumn(headers, MINUTES_ALIASES);
  const matches = findColumn(headers, MATCHES_ALIASES);
  return { player, minutes, matches };
}

function uniqueText(values: CellValue[]) {
  const seen = new Set<string>();
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && text.toLowerCase() !== "nan") seen.add(text);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "es")).join(", ");
}

function isPer90(header: string) {
  return /(^|\s)(per\s*90|per90|90)(\s|$)/i.test(normalizeHeader(header)) || /\/\s*90/i.test(header);
}

function isPercentage(header: string) {
  const h = normalizeHeader(header);
  return header.includes("%") || /\b(pct|percentage|accuracy|precision|success|successful|won)\b/i.test(h);
}

function findDenominatorHeader(percentHeader: string, headers: string[]) {
  const p = normalizeHeader(percentHeader);
  const rules: Array<[RegExp, string[]]> = [
    [/defensive duels won|duelos defensivos ganados/, ["defensive duels per 90", "duelos defensivos 90"]],
    [/aerial duels won|duelos aereos ganados/, ["aerial duels per 90", "duelos aereos 90"]],
    [/offensive duels won|duelos ofensivos ganados/, ["offensive duels per 90", "duelos ofensivos 90"]],
    [/duels won|duelos ganados/, ["duels per 90", "duelos 90"]],
    [/shots on target|tiros a la porteria|remates a puerta/, ["shots per 90", "shots", "remates 90", "remates"]],
    [/goal conversion|conversion de gol/, ["shots per 90", "shots", "remates 90", "remates"]],
    [/cross/, ["crosses per 90", "crosses attempted", "centros 90"]],
    [/dribbl|regates/, ["dribbles per 90", "dribbles attempted", "regates 90"]],
    [/forward pass|pases hacia adelante/, ["forward passes per 90", "pases hacia adelante 90"]],
    [/back pass|pases hacia atras/, ["back passes per 90", "pases hacia atras 90"]],
    [/lateral pass|pases laterales/, ["lateral passes per 90", "pases laterales 90"]],
    [/long pass|pases largos/, ["long passes per 90", "pases largos 90"]],
    [/progressive pass|pases progresivos/, ["progressive passes per 90", "pases progresivos 90"]],
    [/final third|ultimo tercio/, ["passes to final third per 90", "pases al ultimo tercio 90"]],
    [/penalty area|area de penalti/, ["passes to penalty area per 90", "pases al area de penalti 90"]],
    [/smart pass|pases inteligentes/, ["smart passes per 90", "pases inteligentes 90"]],
    [/through pass|pases filtrados/, ["through passes per 90", "pases filtrados 90"]],
    [/pass completion|accurate passes|precision pases/, ["passes per 90", "passes attempted", "pases 90"]],
  ];
  const rule = rules.find(([pattern]) => pattern.test(p));
  return rule ? findColumn(headers, rule[1]) : "";
}

function denominatorWeight(row: DataRow, denominator: string, minutesColumn: string) {
  const den = numeric(row[denominator]);
  if (!Number.isFinite(den)) return Number.NaN;
  if (isPer90(denominator)) {
    const mins = numeric(row[minutesColumn]);
    return Number.isFinite(mins) ? den * mins / 90 : Number.NaN;
  }
  return den;
}

function average(values: number[]) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : Number.NaN;
}

function weightedAverage(entries: Array<{ value: number; weight: number }>) {
  const valid = entries.filter(({ value, weight }) => Number.isFinite(value) && Number.isFinite(weight) && weight > 0);
  const weight = valid.reduce((sum, entry) => sum + entry.weight, 0);
  return weight ? valid.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / weight : Number.NaN;
}

export function aggregateDatasets(datasets: SourceDataset[]): AggregationResult {
  if (datasets.length < 1) throw new Error(t("Selecciona al menos un archivo de datos."));
  const allHeaders = [...new Set(datasets.flatMap((dataset) => dataset.headers))];
  const core = detectCoreColumns(allHeaders);
  if (!core.player) throw new Error(t("No se encontró una columna de jugador (Player/Jugador)."));
  if (!core.minutes) throw new Error(t("No se encontró la columna de minutos jugados."));
  if (!core.matches) throw new Error(t("No se encontró la columna de partidos jugados."));
  const ageColumn = findColumn(allHeaders, AGE_ALIASES);
  const teamColumn = findColumn(allHeaders, TEAM_ALIASES);
  // Cada export puede traer el club en una columna distinta ("Team within
  // selected timeframe" o "Team"); se resuelve por fila con fallback para que
  // ninguna base quede con equipo vacío al combinar.
  const teamColumns = TEAM_ALIASES.map((alias) => findColumn(allHeaders, [alias])).filter(Boolean);
  const rowTeam = (row: DataRow) => {
    for (const column of teamColumns) {
      const value = String(row[column] ?? "").trim();
      if (value && value.toLowerCase() !== "nan") return value;
    }
    return "";
  };

  const combined = datasets.flatMap((dataset, sourceIndex) => dataset.rows.map((row) => ({
    row,
    season: dataset.season,
    sourceIndex,
    source: dataset.fileName.replace(/\.(xlsx|xls|csv)$/i, ""),
    player: String(row[core.player] ?? "").trim(),
    ageIdentity: normalizeIdentityAge(ageColumn ? row[ageColumn] : ""),
    clubIdentity: normalizeIdentityText(rowTeam(row)),
  }))).filter((entry) => entry.player);

  const grouped = new Map<string, typeof combined>();
  for (const entry of combined) {
    const key = [
      normalizeIdentityText(entry.player),
      entry.ageIdentity,
      entry.clubIdentity,
    ].join("::");
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }

  // Fusión entre temporadas: la clave nombre+edad+club separa al mismo jugador
  // cuando cumple años o cambia de club entre archivos. Se fusionan grupos con
  // el mismo nombre cuya edad difiere en ≤1 (o falta), salvo que compartan
  // archivo de origen — dos filas del mismo archivo son homónimos reales.
  const byName = new Map<string, Array<typeof combined>>();
  for (const entries of grouped.values()) {
    const name = normalizeIdentityText(entries[0].player);
    byName.set(name, [...(byName.get(name) ?? []), entries]);
  }
  const mergedGroups: Array<typeof combined> = [];
  for (const groups of byName.values()) {
    const clusters: Array<typeof combined> = [];
    for (const group of groups) {
      const groupSources = new Set(group.map((entry) => entry.sourceIndex));
      const groupAges = group.map((entry) => Number(entry.ageIdentity)).filter(Number.isFinite);
      const target = clusters.find((cluster) => {
        if (cluster.some((entry) => groupSources.has(entry.sourceIndex))) return false;
        const clusterAges = cluster.map((entry) => Number(entry.ageIdentity)).filter(Number.isFinite);
        if (!groupAges.length || !clusterAges.length) return true;
        return groupAges.some((a) => clusterAges.some((b) => Math.abs(a - b) <= 1));
      });
      if (target) target.push(...group);
      else clusters.push([...group]);
    }
    mergedGroups.push(...clusters);
  }

  const positionColumn = findColumn(allHeaders, ["position", "posicion", "posicion especifica"]);
  const passportColumn = findColumn(allHeaders, ["passport country", "pais de pasaporte", "nacionalidad"]);
  const currentTeamColumn = findColumn(allHeaders, ["current team", "equipo actual"]);
  const contractColumn = findColumn(allHeaders, ["contract expires", "vencimiento contrato"]);
  const idColumn = findColumn(allHeaders, ["id", "player id", "wyid"]);

  const excluded = new Set([core.minutes, core.matches]);
  if (ageColumn) excluded.add(ageColumn);
  // Las columnas de metadatos (contrato, club, posición, id…) nunca deben
  // entrar al bucle numérico: "Contract expires" = 2027 y 2020 se convertía
  // en 2023.5 al promediarse.
  for (const column of [positionColumn, passportColumn, currentTeamColumn, contractColumn, idColumn, ...teamColumns]) {
    if (column) excluded.add(column);
  }
  const numericHeaders = allHeaders.filter((header) => {
    if (!header || header === core.player || excluded.has(header)) return false;
    // Basta con que exista algún valor: las columnas específicas de rol
    // (atajadas, goles evitados, salidas…) solo traen datos para los porteros
    // y un umbral de cobertura las eliminaría del combinado.
    const values = combined.map(({ row }) => numeric(row[header])).filter(Number.isFinite);
    return values.length > 0;
  });
  const per90Headers = numericHeaders.filter(isPer90);
  const percentHeaders = numericHeaders.filter((header) => !per90Headers.includes(header) && isPercentage(header));
  const totalHeaders = numericHeaders.filter((header) => !per90Headers.includes(header) && !percentHeaders.includes(header));
  // Conteos acumulativos (goles, asistencias, tarjetas…) se SUMAN entre
  // archivos, igual que partidos y minutos; el resto de totales (altura,
  // peso, valor de mercado…) se promedia.
  const CUMULATIVE_HEADERS = new Set([
    "goals", "non penalty goals", "assists", "xg", "xa", "shots", "shots against",
    "head goals", "conceded goals", "prevented goals", "clean sheets",
    "yellow cards", "red cards", "penalties taken", "xg against",
    "second assists", "third assists",
  ]);
  const cumulativeHeaders = totalHeaders.filter((header) => CUMULATIVE_HEADERS.has(normalizeHeader(header)));
  const averagedHeaders = totalHeaders.filter((header) => !cumulativeHeaders.includes(header));

  const rows = mergedGroups.map((entries) => {
    // Un archivo sin año en el nombre (season 0) es un export actual, no el
    // más antiguo: se ordena como el más reciente.
    const seasonOrder = (season: number) => season || Number.MAX_SAFE_INTEGER;
    const sorted = [...entries].sort((a, b) => (seasonOrder(a.season) - seasonOrder(b.season)) || (a.sourceIndex - b.sourceIndex));
    const latest = sorted.at(-1)!;
    const seasons = uniqueText(sorted.map(({ season }) => season || ""));
    const output: DataRow = {
      Player: latest.player,
      "Data sources": uniqueText(sorted.map(({ source }) => source)),
      [core.matches]: sorted.reduce((sum, { row }) => sum + (numeric(row[core.matches]) || 0), 0),
      [core.minutes]: sorted.reduce((sum, { row }) => sum + (numeric(row[core.minutes]) || 0), 0),
    };
    if (seasons) output.Seasons = seasons;

    if (teamColumn) output.Team = rowTeam(latest.row);
    if (positionColumn) output.Position = mergePlayerPositions([...sorted].reverse().map(({ row }) => row[positionColumn]));
    if (passportColumn) output["Passport country"] = uniqueText(sorted.map(({ row }) => row[passportColumn]));
    if (currentTeamColumn) output["Current Team"] = latest.row[currentTeamColumn] ?? "";
    if (contractColumn) output["Contract expires"] = latest.row[contractColumn] ?? "";
    if (ageColumn) output.Age = latest.row[ageColumn] ?? "";

    for (const header of cumulativeHeaders) {
      const values = sorted.map(({ row }) => numeric(row[header])).filter(Number.isFinite);
      output[header] = values.length ? values.reduce((sum, value) => sum + value, 0) : Number.NaN;
    }
    for (const header of averagedHeaders) output[header] = average(sorted.map(({ row }) => numeric(row[header])));
    for (const header of per90Headers) {
      output[header] = weightedAverage(sorted.map(({ row }) => ({
        value: numeric(row[header]),
        weight: numeric(row[core.minutes]),
      })));
    }
    for (const header of percentHeaders) {
      const denominator = findDenominatorHeader(header, allHeaders);
      output[header] = weightedAverage(sorted.map(({ row }) => ({
        value: numeric(row[header]),
        weight: denominator ? denominatorWeight(row, denominator, core.minutes) : numeric(row[core.minutes]),
      })));
    }
    return output;
  }).sort((a, b) => numeric(b[core.minutes]) - numeric(a[core.minutes]));

  const leading = ["Player", "Data sources", "Seasons", "Team", "Position", "Passport country", "Current Team", "Contract expires", "Age", core.matches, core.minutes];
  const headers = [...new Set([...leading.filter((header) => rows.some((row) => row[header] !== undefined)), ...totalHeaders, ...per90Headers, ...percentHeaders])];
  const warnings = [
    ...(!ageColumn ? [t("No se encontró una columna de edad; la clave de identidad usó nombre y club.")] : []),
    ...(!teamColumn ? [t("No se encontró una columna de club; la clave de identidad usó nombre y edad.")] : []),
  ];
  return { rows, headers, playerColumn: core.player, minutesColumn: core.minutes, matchesColumn: core.matches, warnings };
}

export function cohortOf(value: CellValue) {
  return roleCohort(primaryPositionRole(value));
}

type MetricDefinition = { label: string; aliases: string[]; group: number; colorGroup: MetricColorGroup; inverse?: boolean };

// Sets de métricas por rol según la especificación del cuaderno de análisis.
// `colorGroup` fija el color del anillo del radar; para Wingers, Forwards y
// Attack Midfielders los duelos aéreos cuentan como señal ofensiva.
const METRICS: Record<string, MetricDefinition[]> = {
  GK: [
    { label: "Pases precisos, %", aliases: ["accurate passes %", "precision pases %", "pases precisos %"], group: 2, colorGroup: "passing" },
    { label: "Pases largos precisos, %", aliases: ["accurate long passes %", "precision pases largos %", "pases largos precisos %"], group: 2, colorGroup: "passing" },
    { label: "Duelos aéreos /90", aliases: ["aerial duels per 90", "duelos aereos 90"], group: 1, colorGroup: "goalkeeper" },
    { label: "Porcentaje de atajadas, %", aliases: ["save rate %", "paradas %", "porcentaje de atajadas %"], group: 0, colorGroup: "goalkeeper" },
    { label: "Goles evitados /90", aliases: ["prevented goals per 90", "goles evitados 90"], group: 0, colorGroup: "goalkeeper" },
    { label: "Goles concedidos /90", aliases: ["conceded goals per 90", "goles recibidos 90", "goles concedidos 90"], group: 0, colorGroup: "goalkeeper", inverse: true },
    { label: "xG en contra /90", aliases: ["xg against per 90", "xg en contra 90"], group: 0, colorGroup: "goalkeeper", inverse: true },
    { label: "Salidas /90", aliases: ["exits per 90", "salidas 90"], group: 1, colorGroup: "goalkeeper" },
  ],
  CB: [
    { label: "xG /90", aliases: ["xg per 90", "xg 90"], group: 0, colorGroup: "finishing" },
    { label: "Pases precisos, %", aliases: ["accurate passes %", "precision pases %", "pases precisos %"], group: 2, colorGroup: "passing" },
    { label: "Pases largos precisos, %", aliases: ["accurate long passes %", "precision pases largos %", "pases largos precisos %"], group: 2, colorGroup: "passing" },
    { label: "Pases /90", aliases: ["passes per 90", "pases 90"], group: 2, colorGroup: "passing" },
    { label: "Pases recibidos /90", aliases: ["received passes per 90", "pases recibidos 90"], group: 2, colorGroup: "passing" },
    { label: "Duelos aéreos ganados, %", aliases: ["aerial duels won %", "duelos aereos ganados %"], group: 0, colorGroup: "defending" },
    { label: "Duelos defensivos ganados, %", aliases: ["defensive duels won %", "duelos defensivos ganados %"], group: 0, colorGroup: "defending" },
    { label: "Entradas deslizantes PAdj", aliases: ["padj sliding tackles", "entradas padj", "entradas deslizantes padj", "sliding tackles padj"], group: 0, colorGroup: "defending" },
    { label: "Intercepciones /90", aliases: ["interceptions per 90", "interceptaciones 90", "intercepciones 90"], group: 1, colorGroup: "defending" },
    { label: "Acciones defensivas exitosas /90", aliases: ["successful defensive actions per 90", "acciones defensivas realizadas 90", "acciones defensivas exitosas 90"], group: 1, colorGroup: "defending" },
  ],
  FB: [
    { label: "xG /90", aliases: ["xg per 90", "xg 90"], group: 2, colorGroup: "finishing" },
    { label: "Regates exitosos, %", aliases: ["successful dribbles %", "regates realizados %", "regates exitosos %"], group: 2, colorGroup: "creating" },
    { label: "Duelos ofensivos /90", aliases: ["offensive duels per 90", "duelos ofensivos 90", "duelos atacantes 90"], group: 2, colorGroup: "creating" },
    { label: "Duelos ofensivos ganados, %", aliases: ["offensive duels won %", "duelos ofensivos ganados %", "duelos atacantes ganados %"], group: 2, colorGroup: "creating" },
    { label: "Carreras progresivas /90", aliases: ["progressive runs per 90", "carreras en progresion 90"], group: 2, colorGroup: "creating" },
    { label: "xA /90", aliases: ["xa per 90", "xa 90"], group: 2, colorGroup: "creating" },
    { label: "Asistencias /90", aliases: ["assists per 90", "asistencias 90"], group: 2, colorGroup: "creating" },
    { label: "Centros /90", aliases: ["crosses per 90", "centros 90"], group: 1, colorGroup: "creating" },
    { label: "Centros precisos, %", aliases: ["accurate crosses %", "precision centros %", "centros precisos %"], group: 1, colorGroup: "creating" },
    { label: "Pases precisos, %", aliases: ["accurate passes %", "precision pases %", "pases precisos %"], group: 1, colorGroup: "passing" },
    { label: "Pases largos precisos, %", aliases: ["accurate long passes %", "precision pases largos %", "pases largos precisos %"], group: 1, colorGroup: "passing" },
    { label: "Duelos defensivos /90", aliases: ["defensive duels per 90", "duelos defensivos 90"], group: 0, colorGroup: "defending" },
    { label: "Duelos defensivos ganados, %", aliases: ["defensive duels won %", "duelos defensivos ganados %"], group: 0, colorGroup: "defending" },
    { label: "Intercepciones /90", aliases: ["interceptions per 90", "interceptaciones 90", "intercepciones 90"], group: 0, colorGroup: "defending" },
  ],
  DMF: [
    { label: "xG /90", aliases: ["xg per 90", "xg 90"], group: 0, colorGroup: "finishing" },
    { label: "Pases precisos, %", aliases: ["accurate passes %", "precision pases %", "pases precisos %"], group: 1, colorGroup: "passing" },
    { label: "Pases /90", aliases: ["passes per 90", "pases 90"], group: 1, colorGroup: "passing" },
    { label: "Pases recibidos /90", aliases: ["received passes per 90", "pases recibidos 90"], group: 1, colorGroup: "passing" },
    { label: "Pases largos precisos, %", aliases: ["accurate long passes %", "precision pases largos %", "pases largos precisos %"], group: 1, colorGroup: "passing" },
    { label: "Pases progresivos /90", aliases: ["progressive passes per 90", "pases progresivos 90"], group: 1, colorGroup: "passing" },
    { label: "Pases progresivos precisos, %", aliases: ["accurate progressive passes %", "precision pases progresivos %", "pases progresivos precisos %"], group: 1, colorGroup: "passing" },
    { label: "Pases clave /90", aliases: ["key passes per 90", "jugadas claves 90", "pases clave 90"], group: 2, colorGroup: "creating" },
    { label: "Duelos defensivos /90", aliases: ["defensive duels per 90", "duelos defensivos 90"], group: 0, colorGroup: "defending" },
    { label: "Duelos defensivos ganados, %", aliases: ["defensive duels won %", "duelos defensivos ganados %"], group: 0, colorGroup: "defending" },
    { label: "Intercepciones /90", aliases: ["interceptions per 90", "interceptaciones 90", "intercepciones 90"], group: 0, colorGroup: "defending" },
    { label: "Entradas deslizantes PAdj", aliases: ["padj sliding tackles", "entradas padj", "entradas deslizantes padj", "sliding tackles padj"], group: 0, colorGroup: "defending" },
    { label: "Acciones defensivas exitosas /90", aliases: ["successful defensive actions per 90", "acciones defensivas realizadas 90", "acciones defensivas exitosas 90"], group: 0, colorGroup: "defending" },
    { label: "Duelos aéreos ganados, %", aliases: ["aerial duels won %", "duelos aereos ganados %"], group: 0, colorGroup: "defending" },
    { label: "Duelos ganados, %", aliases: ["duels won %", "duelos ganados %"], group: 0, colorGroup: "defending" },
  ],
  B2B: [
    { label: "Goles /90", aliases: ["goals per 90", "goles 90"], group: 0, colorGroup: "finishing" },
    { label: "xG /90", aliases: ["xg per 90", "xg 90"], group: 0, colorGroup: "finishing" },
    { label: "Toques en el área /90", aliases: ["touches in box per 90", "toques en el area de penalti 90"], group: 0, colorGroup: "finishing" },
    { label: "Regates exitosos, %", aliases: ["successful dribbles %", "regates realizados %", "regates exitosos %"], group: 0, colorGroup: "creating" },
    { label: "Carreras progresivas /90", aliases: ["progressive runs per 90", "carreras en progresion 90"], group: 0, colorGroup: "creating" },
    { label: "Asistencias /90", aliases: ["assists per 90", "asistencias 90"], group: 1, colorGroup: "creating" },
    { label: "xA /90", aliases: ["xa per 90", "xa 90"], group: 1, colorGroup: "creating" },
    { label: "Pases precisos, %", aliases: ["accurate passes %", "precision pases %", "pases precisos %"], group: 1, colorGroup: "passing" },
    { label: "Pases /90", aliases: ["passes per 90", "pases 90"], group: 1, colorGroup: "passing" },
    { label: "Pases recibidos /90", aliases: ["received passes per 90", "pases recibidos 90"], group: 1, colorGroup: "passing" },
    { label: "Pases progresivos /90", aliases: ["progressive passes per 90", "pases progresivos 90"], group: 1, colorGroup: "passing" },
    { label: "Pases progresivos precisos, %", aliases: ["accurate progressive passes %", "precision pases progresivos %", "pases progresivos precisos %"], group: 1, colorGroup: "passing" },
    { label: "Duelos defensivos /90", aliases: ["defensive duels per 90", "duelos defensivos 90"], group: 2, colorGroup: "defending" },
    { label: "Intercepciones /90", aliases: ["interceptions per 90", "interceptaciones 90", "intercepciones 90"], group: 2, colorGroup: "defending" },
    { label: "Duelos ganados, %", aliases: ["duels won %", "duelos ganados %"], group: 2, colorGroup: "defending" },
    { label: "Duelos aéreos ganados, %", aliases: ["aerial duels won %", "duelos aereos ganados %"], group: 2, colorGroup: "defending" },
  ],
  AM: [
    { label: "Goles /90", aliases: ["goals per 90", "goles 90"], group: 0, colorGroup: "finishing" },
    { label: "xG /90", aliases: ["xg per 90", "xg 90"], group: 0, colorGroup: "finishing" },
    { label: "Tiros al arco, %", aliases: ["shots on target %", "tiros a la porteria %", "tiros al arco %", "remates a puerta %"], group: 0, colorGroup: "finishing" },
    { label: "Toques en el área /90", aliases: ["touches in box per 90", "toques en el area de penalti 90"], group: 0, colorGroup: "finishing" },
    { label: "Regates exitosos, %", aliases: ["successful dribbles %", "regates realizados %", "regates exitosos %"], group: 2, colorGroup: "creating" },
    { label: "Duelos ofensivos /90", aliases: ["offensive duels per 90", "duelos ofensivos 90", "duelos atacantes 90"], group: 2, colorGroup: "creating" },
    { label: "Duelos ofensivos ganados, %", aliases: ["offensive duels won %", "duelos ofensivos ganados %", "duelos atacantes ganados %"], group: 2, colorGroup: "creating" },
    { label: "Carreras progresivas /90", aliases: ["progressive runs per 90", "carreras en progresion 90"], group: 2, colorGroup: "creating" },
    { label: "Asistencias /90", aliases: ["assists per 90", "asistencias 90"], group: 1, colorGroup: "creating" },
    { label: "Pases clave /90", aliases: ["key passes per 90", "jugadas claves 90", "pases clave 90"], group: 1, colorGroup: "creating" },
    { label: "Pases recibidos /90", aliases: ["received passes per 90", "pases recibidos 90"], group: 1, colorGroup: "passing" },
    { label: "Pases precisos, %", aliases: ["accurate passes %", "precision pases %", "pases precisos %"], group: 1, colorGroup: "passing" },
    { label: "Pases progresivos precisos, %", aliases: ["accurate progressive passes %", "precision pases progresivos %", "pases progresivos precisos %"], group: 1, colorGroup: "passing" },
    { label: "Pases largos precisos, %", aliases: ["accurate long passes %", "precision pases largos %", "pases largos precisos %"], group: 1, colorGroup: "passing" },
  ],
  WING: [
    { label: "Goles /90", aliases: ["goals per 90", "goles 90"], group: 0, colorGroup: "finishing" },
    { label: "xG /90", aliases: ["xg per 90", "xg 90"], group: 0, colorGroup: "finishing" },
    { label: "Tiros al arco, %", aliases: ["shots on target %", "tiros a la porteria %", "tiros al arco %", "remates a puerta %"], group: 0, colorGroup: "finishing" },
    { label: "Toques en el área /90", aliases: ["touches in box per 90", "toques en el area de penalti 90"], group: 0, colorGroup: "finishing" },
    { label: "Regates exitosos, %", aliases: ["successful dribbles %", "regates realizados %", "regates exitosos %"], group: 2, colorGroup: "creating" },
    { label: "Duelos ofensivos /90", aliases: ["offensive duels per 90", "duelos ofensivos 90", "duelos atacantes 90"], group: 2, colorGroup: "creating" },
    { label: "Duelos ofensivos ganados, %", aliases: ["offensive duels won %", "duelos ofensivos ganados %", "duelos atacantes ganados %"], group: 2, colorGroup: "creating" },
    { label: "Carreras progresivas /90", aliases: ["progressive runs per 90", "carreras en progresion 90"], group: 2, colorGroup: "creating" },
    { label: "xA /90", aliases: ["xa per 90", "xa 90"], group: 1, colorGroup: "creating" },
    { label: "Asistencias /90", aliases: ["assists per 90", "asistencias 90"], group: 1, colorGroup: "creating" },
    { label: "Centros /90", aliases: ["crosses per 90", "centros 90"], group: 1, colorGroup: "creating" },
    { label: "Centros precisos, %", aliases: ["accurate crosses %", "precision centros %", "centros precisos %"], group: 1, colorGroup: "creating" },
    { label: "Pases clave /90", aliases: ["key passes per 90", "jugadas claves 90", "pases clave 90"], group: 1, colorGroup: "creating" },
    { label: "Duelos defensivos ganados, %", aliases: ["defensive duels won %", "duelos defensivos ganados %"], group: 0, colorGroup: "defending" },
  ],
  CF: [
    { label: "Goles /90", aliases: ["goals per 90", "goles 90"], group: 0, colorGroup: "finishing" },
    { label: "xG /90", aliases: ["xg per 90", "xg 90"], group: 0, colorGroup: "finishing" },
    { label: "Tiros al arco, %", aliases: ["shots on target %", "tiros a la porteria %", "tiros al arco %", "remates a puerta %"], group: 0, colorGroup: "finishing" },
    { label: "Duelos ofensivos /90", aliases: ["offensive duels per 90", "duelos ofensivos 90", "duelos atacantes 90"], group: 1, colorGroup: "finishing" },
    { label: "Duelos ofensivos ganados, %", aliases: ["offensive duels won %", "duelos ofensivos ganados %", "duelos atacantes ganados %"], group: 1, colorGroup: "finishing" },
    { label: "Toques en el área /90", aliases: ["touches in box per 90", "toques en el area de penalti 90"], group: 0, colorGroup: "finishing" },
    { label: "Duelos aéreos ganados, %", aliases: ["aerial duels won %", "duelos aereos ganados %"], group: 1, colorGroup: "finishing" },
    { label: "Regates exitosos, %", aliases: ["successful dribbles %", "regates realizados %", "regates exitosos %"], group: 2, colorGroup: "creating" },
    { label: "Carreras progresivas /90", aliases: ["progressive runs per 90", "carreras en progresion 90"], group: 2, colorGroup: "creating" },
    { label: "xA /90", aliases: ["xa per 90", "xa 90"], group: 2, colorGroup: "creating" },
    { label: "Asistencias /90", aliases: ["assists per 90", "asistencias 90"], group: 2, colorGroup: "creating" },
    { label: "Pases recibidos /90", aliases: ["received passes per 90", "pases recibidos 90"], group: 2, colorGroup: "passing" },
    { label: "Pases precisos, %", aliases: ["accurate passes %", "precision pases %", "pases precisos %"], group: 2, colorGroup: "passing" },
  ],
};

METRICS.MID = METRICS.DMF;
METRICS.OTHER = METRICS.WING;

function percentile(value: number, values: number[], inverse = false) {
  const valid = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length || !Number.isFinite(value)) return 0;
  const below = valid.filter((candidate) => candidate < value).length;
  const equal = valid.filter((candidate) => candidate === value).length;
  const rank = Math.round(((below + equal * 0.5) / valid.length) * 100);
  return inverse ? 100 - rank : rank;
}

function field(row: DataRow, headers: string[], aliases: string[]) {
  const header = findColumn(headers, aliases);
  return header ? row[header] : "";
}

// Lectura táctica estilo dirección de scouting: cada cohorte tiene perfiles
// (nueve referencia, falso nueve, central con toque, rústico…) y se elige el
// que mejor respaldan los percentiles. `lows` marca métricas que deben ser
// bajas para que el perfil gane fuerza (p. ej. poco juego aéreo en un nueve
// de espacio).
type TacticalRule = { labels: string[]; lows?: string[]; text: string; role: string };

const TACTICAL_PROFILES: Record<string, TacticalRule[]> = {
  GK: [
    { labels: ["Porcentaje de atajadas, %", "Goles evitados /90"], text: "Detiene más de lo que le corresponde: evita goles que, por la calidad del remate rival, normalmente terminarían dentro.", role: "portero de reflejos (shot-stopper)" },
    { labels: ["Salidas /90", "Duelos aéreos /90"], text: "Gobierna su área: sale a cortar centros y gana el duelo aéreo con regularidad, una garantía en balón parado defensivo.", role: "portero dominador del área" },
    { labels: ["Pases largos precisos, %", "Pases precisos, %"], text: "Con el pie es fiable: mantiene la calma en salida corta y también encuentra al compañero con el envío largo.", role: "portero iniciador" },
  ],
  CB: [
    { labels: ["Pases precisos, %", "Pases largos precisos, %", "Pases /90"], text: "Su diferencial es la salida limpia: encuentra pases por dentro que saltan la primera presión rival sin arriesgar la pérdida.", role: "central con salida de balón (ball-playing)" },
    { labels: ["Duelos defensivos ganados, %", "Duelos aéreos ganados, %", "Entradas deslizantes PAdj"], lows: ["Pases /90"], text: "Su valor está en el duelo: gana lo físico y lo aéreo con regularidad; con el balón aporta menos, conviene rodearlo de buen pie.", role: "central de área y duelos" },
    { labels: ["Intercepciones /90", "Acciones defensivas exitosas /90"], text: "Defiende leyendo el juego: llega antes que el rival y corta la jugada en origen en lugar de corregir atrás.", role: "central de anticipación para línea adelantada" },
  ],
  FB: [
    { labels: ["Centros /90", "Centros precisos, %"], text: "Su argumento es el centro: llega a línea de fondo con frecuencia y el envío al área encuentra rematador más de lo habitual.", role: "lateral de amplitud y centro" },
    { labels: ["Carreras progresivas /90", "Regates exitosos, %"], text: "Gana metros con el balón controlado: conduce y encara para hacer avanzar al equipo por su banda.", role: "carrilero de conducción" },
    { labels: ["Duelos defensivos ganados, %", "Intercepciones /90"], text: "Primero defiende: el duelo y el corte son lo más sólido de su juego, con menos aporte en campo rival.", role: "lateral defensivo para bloque medio-bajo" },
  ],
  DMF: [
    { labels: ["Acciones defensivas exitosas /90", "Intercepciones /90", "Entradas deslizantes PAdj"], text: "Corta el juego rival antes de que llegue a la zaga: recupera, intercepta y entra bien, con volumen alto y pocas fallas.", role: "pivote de contención delante de la zaga" },
    { labels: ["Pases progresivos /90", "Pases /90", "Pases precisos, %"], text: "Da salida limpia bajo presión: pide el balón, lo cuida y mantiene el ritmo de circulación aunque lo aprieten.", role: "pivote organizador de la salida" },
    { labels: ["Pases clave /90", "Pases progresivos precisos, %"], text: "Desde zonas profundas encuentra el pase que rompe líneas y deja a un compañero de cara al arco.", role: "mediocentro con último pase" },
  ],
  B2B: [
    { labels: ["Goles /90", "Toques en el área /90", "xG /90"], text: "Llega al área sin balón: aparece en zona de remate en el momento justo y convierte esas llegadas en gol.", role: "interior llegador (box-to-box ofensivo)" },
    { labels: ["Pases progresivos /90", "Pases precisos, %", "xA /90"], text: "Conecta defensa y ataque con el pase: progresa con criterio y casi no pierde balones en la construcción.", role: "interior conector entre líneas" },
    { labels: ["Duelos defensivos /90", "Intercepciones /90", "Duelos ganados, %"], text: "Cubre los dos lados del juego: recupera en campo propio, gana duelos y reinicia el ataque de inmediato.", role: "mediocentro de ida y vuelta" },
  ],
  WING: [
    { labels: ["Regates exitosos, %", "Carreras progresivas /90", "Duelos ofensivos ganados, %"], text: "El uno contra uno es su argumento: encara, supera a su marcador y hace avanzar al equipo en campo abierto.", role: "extremo de transición y uno contra uno" },
    { labels: ["xG /90", "Toques en el área /90"], text: "Pisa el área con frecuencia: sus llegadas por dentro y sus desmarques a la espalda del lateral (runs in behind) terminan en ocasiones claras.", role: "extremo interior con gol (inside forward)" },
    { labels: ["xA /90", "Pases clave /90", "Centros precisos, %"], text: "Hace mejores a los demás: su último pase y su centro generan ocasiones claras partido tras partido.", role: "extremo creador" },
  ],
  AM: [
    { labels: ["Goles /90", "xG /90", "Toques en el área /90"], text: "Suma gol desde segunda línea: llega al área como un delantero más y sus remates valen puntos.", role: "mediapunta llegador (segundo delantero)" },
    { labels: ["Asistencias /90", "Pases clave /90"], text: "Su diferencial es el último pase: recibe entre líneas y deja a los delanteros de cara al gol con regularidad.", role: "enganche creador entre líneas" },
    { labels: ["Regates exitosos, %", "Carreras progresivas /90", "Duelos ofensivos ganados, %"], text: "Rompe líneas con el balón controlado: recibe de espaldas, gira y avanza donde otros necesitan dos pases.", role: "interior que progresa por conducción" },
  ],
  CF: [
    { labels: ["Duelos aéreos ganados, %", "Pases recibidos /90"], text: "Sostiene el juego de espaldas: gana el duelo aéreo, aguanta el balón y permite que el equipo suba en bloque.", role: "nueve de referencia (target man)" },
    { labels: ["Pases recibidos /90", "Asistencias /90", "Pases precisos, %"], lows: ["Duelos aéreos ganados, %"], text: "Asocia más de lo que remata: su mejor versión aparece saliendo de la zona de definición para combinar y liberar espacio a las llegadas.", role: "delantero asociativo (falso nueve)" },
    { labels: ["xG /90", "Toques en el área /90"], lows: ["Pases recibidos /90"], text: "Su peligro nace del desmarque: participa poco en la circulación, pero cada ataque al espacio a la espalda de la defensa (runs in behind) termina en remate.", role: "delantero de ruptura al espacio" },
  ],
};

TACTICAL_PROFILES.MID = TACTICAL_PROFILES.DMF;
TACTICAL_PROFILES.OTHER = TACTICAL_PROFILES.WING;

function tacticalNote(cohort: string, metrics: RadarMetric[]): TacticalRule | null {
  const percentileOf = (label: string) => metrics.find((metric) => metric.label === label)?.percentile;
  const rules = TACTICAL_PROFILES[cohort] ?? TACTICAL_PROFILES.OTHER;
  let best: TacticalRule | null = null;
  let bestScore = 0;
  for (const rule of rules) {
    const values = rule.labels.map(percentileOf).filter((value): value is number => value !== undefined);
    if (!values.length) continue;
    let score = average(values);
    const lows = (rule.lows ?? []).map(percentileOf).filter((value): value is number => value !== undefined);
    if (lows.length) score += (55 - average(lows)) * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = rule;
    }
  }
  return best && bestScore >= 58 ? best : null;
}

const FACET_PHRASES: Record<string, string> = {
  finishing: "la finalización",
  creating: "la creación de juego",
  passing: "el pase",
  defending: "el trabajo defensivo",
  goalkeeper: "el rendimiento bajo los palos",
};

function roleReading(cohort: string, metrics: RadarMetric[]) {
  if (!metrics.length) return "";
  // Informe corto en lenguaje llano: en qué se apoya su juego, qué muestra el
  // dato, en qué rol encajaría, dónde destaca y qué vigilar. Sin jerga.
  const facets = SIMILARITY_METRIC_GROUPS.map((group) => ({
    group,
    score: average(metrics.filter((metric) => similarityMetricGroup(metric, cohort).id === group.id).map((metric) => metric.percentile)),
  })).filter((facet) => Number.isFinite(facet.score)).sort((a, b) => b.score - a.score);
  const dominant = facets[0];
  const top = [...metrics].sort((a, b) => b.percentile - a.percentile).slice(0, 3);
  const weak = [...metrics].sort((a, b) => a.percentile - b.percentile)[0];
  const readable = (label: string) => t(label).replace(/\s*\/90/g, "").replace(/,\s*%$/, "").toLowerCase();
  const strengths = top.filter((metric) => metric.percentile >= 60).map((metric) => readable(metric.label));
  let text = dominant
    ? tf("Su juego se apoya en {facet}: ahí supera al {p}% de los jugadores de su posición.", { facet: t(FACET_PHRASES[dominant.group.id] ?? dominant.group.label), p: Math.round(dominant.score) })
    : "";
  const tactic = tacticalNote(cohort, metrics);
  if (tactic) {
    text += ` ${t(tactic.text)}`;
    text += tf(" Encajaría en un rol de {role}.", { role: t(tactic.role) });
  }
  if (strengths.length) text += tf(" Sus números más sólidos están en {list}.", { list: strengths.join(", ") });
  if (weak && weak.percentile < 35) text += tf(" El punto a vigilar es {metric}, hoy por debajo de lo esperado para su posición.", { metric: readable(weak.label) });
  return text.trim();
}

export function buildPlayerReport(rows: DataRow[], selectedIndex: number, minimumMinutes: number, forcedCohort = "AUTO"): PlayerReport | null {
  const row = rows[selectedIndex];
  if (!row) return null;
  const headers = [...new Set(rows.flatMap((item) => Object.keys(item)))];
  const core = detectCoreColumns(headers);
  const positionColumn = findColumn(headers, POSITION_ALIASES);
  const sourceCohort = cohortOf(positionColumn ? row[positionColumn] : "");
  const cohort = forcedCohort === "AUTO" ? sourceCohort : forcedCohort;
  const definitions = METRICS[cohort] ?? METRICS.OTHER;
  // La cohorte siempre son los jugadores de esa misma posición dentro de la
  // base cargada. Al forzar una cohorte se comparan las métricas de ese rol,
  // pero el grupo de referencia sigue siendo el de la posición seleccionada:
  // nunca todos los jugadores de la base.
  const peers = rows.filter((candidate) => (
    cohortOf(positionColumn ? candidate[positionColumn] : "") === cohort
    && (minimumMinutes <= 0 || numeric(candidate[core.minutes]) >= minimumMinutes)
  ));
  const metrics = !peers.length ? [] : definitions.flatMap((definition) => {
    const key = findColumn(headers, definition.aliases);
    if (!key) return [];
    const value = numeric(row[key]);
    if (!Number.isFinite(value)) return [];
    // Sin muestra real en la cohorte, el percentil no significa nada: la
    // métrica se omite en lugar de dibujarse contra un grupo vacío.
    const peerValues = peers.map((candidate) => numeric(candidate[key])).filter(Number.isFinite);
    if (!peerValues.length) return [];
    return [{ key, label: definition.label, value, percentile: percentile(value, peerValues, definition.inverse), group: definition.group, colorGroup: definition.colorGroup, inverse: definition.inverse, sample: peerValues.length }];
  });
  const score = metrics.length ? Math.round(average(metrics.map((metric) => metric.percentile))) : 0;
  const text = (aliases: string[]) => String(field(row, headers, aliases) ?? "").trim();
  const value = (aliases: string[]) => numeric(field(row, headers, aliases));
  return {
    player: text(PLAYER_ALIASES) || t("Jugador"),
    team: text(TEAM_ALIASES) || t("Equipo no disponible"),
    position: formatPlayerPositions(text(POSITION_ALIASES)),
    cohort,
    age: text(["age", "edad"]) || "—",
    foot: text(["foot", "pie"]) || "—",
    passport: text(["passport country", "birth country", "pais de pasaporte", "pais de nacimiento"]) || "—",
    marketValue: text(["market value", "valor de mercado"]) || "—",
    contract: text(["contract expires", "vencimiento contrato"]) || "—",
    matches: value(MATCHES_ALIASES) || 0,
    minutes: value(MINUTES_ALIASES) || 0,
    goals: value(["goals", "goles"]) || 0,
    assists: value(["assists", "asistencias"]) || 0,
    cohortSize: peers.length,
    score,
    metrics,
    reading: roleReading(cohort, metrics),
  };
}

export function formatCell(value: CellValue, digits = 2) {
  if (typeof value === "number") {
    return new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: digits }).format(value);
  }
  return String(value ?? "—");
}

export const DEMO_ROWS: DataRow[] = [
  { Player: "Mateo Silva", Team: "Pacific FC II", Position: "RWF", Age: 21, "Passport country": "Chile", Foot: "Left", "Contract expires": "2027-12-31", "Market value": 450000, "Matches played": 22, "Minutes played": 1714, Goals: 8, Assists: 6, "Goals per 90": 0.42, "xG per 90": 0.37, "Shots per 90": 2.9, "Touches in box per 90": 5.8, "xA per 90": 0.28, "Key passes per 90": 1.7, "Dribbles per 90": 6.3, "Successful dribbles, %": 61.2, "Progressive runs per 90": 4.8 },
  { Player: "Lucas Rojas", Team: "North City", Position: "LWF", Age: 22, "Passport country": "Colombia", Foot: "Right", "Matches played": 24, "Minutes played": 1840, Goals: 6, Assists: 4, "Goals per 90": 0.29, "xG per 90": 0.31, "Shots per 90": 2.5, "Touches in box per 90": 4.9, "xA per 90": 0.19, "Key passes per 90": 1.3, "Dribbles per 90": 5.2, "Successful dribbles, %": 54.1, "Progressive runs per 90": 3.7 },
  { Player: "Emilio Torres", Team: "Capital United", Position: "RWF", Age: 20, "Passport country": "México", Foot: "Right", "Matches played": 19, "Minutes played": 1335, Goals: 4, Assists: 7, "Goals per 90": 0.21, "xG per 90": 0.24, "Shots per 90": 2.1, "Touches in box per 90": 4.4, "xA per 90": 0.34, "Key passes per 90": 2.1, "Dribbles per 90": 7.1, "Successful dribbles, %": 58.7, "Progressive runs per 90": 5.1 },
  { Player: "Noah Williams", Team: "Atlantic Academy", Position: "LW", Age: 23, "Passport country": "Canada", Foot: "Right", "Matches played": 25, "Minutes played": 2010, Goals: 10, Assists: 5, "Goals per 90": 0.48, "xG per 90": 0.41, "Shots per 90": 3.2, "Touches in box per 90": 6.4, "xA per 90": 0.22, "Key passes per 90": 1.5, "Dribbles per 90": 4.8, "Successful dribbles, %": 51.6, "Progressive runs per 90": 3.9 },
  { Player: "Benjamín Arce", Team: "Valley SC", Position: "LAMF", Age: 21, "Passport country": "Argentina", Foot: "Right", "Matches played": 18, "Minutes played": 1192, Goals: 3, Assists: 3, "Goals per 90": 0.18, "xG per 90": 0.2, "Shots per 90": 1.8, "Touches in box per 90": 3.8, "xA per 90": 0.17, "Key passes per 90": 1.1, "Dribbles per 90": 5.8, "Successful dribbles, %": 49.5, "Progressive runs per 90": 4.2 },
];
