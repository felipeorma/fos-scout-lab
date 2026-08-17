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
  /** Plataforma de origen; los minutos no se suman entre proveedores distintos. */
  provider?: MetricSource;
};

export type AggregationResult = {
  rows: DataRow[];
  headers: string[];
  playerColumn: string;
  minutesColumn: string;
  matchesColumn: string;
  warnings: string[];
};

export type MetricColorGroup = "finishing" | "creating" | "passing" | "defending" | "goalkeeper" | "physical";

export type MetricSource = "wyscout" | "statsbomb" | "skillcorner";

export type RadarMetric = {
  key: string;
  label: string;
  value: number;
  percentile: number;
  group: number;
  colorGroup?: MetricColorGroup;
  inverse?: boolean;
  source?: MetricSource;
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

function maxPerProvider(entries: Array<{ row: DataRow; provider: MetricSource }>, pick: (row: DataRow) => number) {
  const perProvider = new Map<string, number>();
  for (const entry of entries) {
    perProvider.set(entry.provider, (perProvider.get(entry.provider) ?? 0) + pick(entry.row));
  }
  return Math.max(0, ...perProvider.values());
}

// ---- Equivalencia y canonización de nombres de club ----
// Los exports escriben el mismo club de formas distintas ("Cavalry FC",
// "Cavalry", "Vancouver Football Club"). Se agrupan para que el desplegable
// de equipos muestre una sola entrada por club.
const CLUB_STOPWORDS = new Set(["fc", "cf", "sc", "afc", "cd", "ac", "fk", "sk", "club", "football", "futbol", "soccer", "de", "du", "des", "the"]);
const CLUB_ALIAS_GROUPS = [["york united", "inter toronto"]];
const clubTokens = (value: string) => value.split(" ").filter((token) => token && !CLUB_STOPWORDS.has(token));

export function clubsMatch(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  const listA = clubTokens(a);
  const listB = clubTokens(b);
  const ta = new Set(listA);
  const tb = new Set(listB);
  // El token distintivo va primero ("Inter Toronto" ≠ "Toronto FC"), así que
  // un subconjunto solo vale si ambos nombres arrancan por la misma palabra:
  // "Vancouver FC" ≡ "Vancouver Football Club", "FC Supra" ≡ "FC Supra du
  // Québec", pero clubes distintos de la misma ciudad no se confunden.
  if (listA[0] === listB[0] && ([...ta].every((token) => tb.has(token)) || [...tb].every((token) => ta.has(token)))) return true;
  return CLUB_ALIAS_GROUPS.some((group) => {
    const inA = group.find((alias) => a.includes(alias));
    const inB = group.find((alias) => b.includes(alias));
    return Boolean(inA && inB && inA !== inB);
  });
}

/**
 * Mapa "nombre tal como viene" → "nombre que se muestra". Agrupa las variantes
 * equivalentes y elige como etiqueta la más frecuente; a igualdad, la más
 * completa ("Vancouver Football Club" antes que "Vancouver"), y a igualdad de
 * longitud, la primera por orden alfabético para que el resultado no dependa
 * del orden en que se cargaron los archivos.
 */
export function canonicalTeamNames(counts: Map<string, number>): Map<string, string> {
  const variants = [...counts.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));
  const clusters: Array<{ identity: string; names: string[] }> = [];
  for (const name of variants) {
    const identity = normalizeIdentityText(name);
    if (!identity) continue;
    const cluster = clusters.find((candidate) => candidate.names.some((other) => clubsMatch(identity, normalizeIdentityText(other))));
    if (cluster) cluster.names.push(name);
    else clusters.push({ identity, names: [name] });
  }
  const mapping = new Map<string, string>();
  for (const cluster of clusters) {
    const label = [...cluster.names].sort((a, b) => {
      const byCount = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
      if (byCount) return byCount;
      const byTokens = clubTokens(normalizeIdentityText(b)).length - clubTokens(normalizeIdentityText(a)).length;
      if (byTokens) return byTokens;
      // A igualdad, gana la grafía acentuada: "Atlético Ottawa", no "Atletico".
      const accents = (value: string) => (/[^\u0000-\u007F]/.test(value) ? 1 : 0);
      const byAccents = accents(b) - accents(a);
      if (byAccents) return byAccents;
      return a.localeCompare(b, "es");
    })[0];
    for (const name of cluster.names) mapping.set(name, label);
  }
  return mapping;
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
  const rawTeam = (row: DataRow) => {
    for (const column of teamColumns) {
      // Los espacios dobles o finales del export no deben abrir una entrada
      // aparte en el desplegable de equipos.
      const value = String(row[column] ?? "").trim().replace(/\s+/g, " ");
      if (value && value.toLowerCase() !== "nan") return value;
    }
    return "";
  };
  // La etiqueta visible sale de la base (Wyscout/StatsBomb): SkillCorner aporta
  // sus variantes al grupo pero no las impone, porque puede arrastrar nombres
  // viejos tras un rebranding.
  const teamCounts = new Map<string, number>();
  for (const dataset of datasets) {
    const weight = dataset.provider === "skillcorner" ? 0 : 1;
    for (const row of dataset.rows) {
      const name = rawTeam(row);
      if (name) teamCounts.set(name, (teamCounts.get(name) ?? 0) + weight);
    }
  }
  const teamLabels = canonicalTeamNames(teamCounts);
  const rowTeam = (row: DataRow) => {
    const name = rawTeam(row);
    return teamLabels.get(name) ?? name;
  };

  const birthColumn = findColumn(allHeaders, ["birth date", "fecha de nacimiento", "date of birth", "birthday"]);
  const birthIdentity = (row: DataRow) => {
    if (!birthColumn) return "";
    const match = String(row[birthColumn] ?? "").match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : "";
  };

  const combined = datasets.flatMap((dataset, sourceIndex) => dataset.rows.map((row) => ({
    row,
    season: dataset.season,
    sourceIndex,
    source: dataset.fileName.replace(/\.(xlsx|xls|csv)$/i, ""),
    provider: dataset.provider ?? "wyscout" as MetricSource,
    player: String(row[core.player] ?? "").trim(),
    ageIdentity: normalizeIdentityAge(ageColumn ? row[ageColumn] : ""),
    clubIdentity: normalizeIdentityText(rowTeam(row)),
    birthIdentity: birthIdentity(row),
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

  // Fusión de nombres abreviados entre plataformas: "S. Dewaele" (Wyscout) y
  // "Sébastien Dewaele" (StatsBomb) son el mismo jugador si comparten club,
  // apellido e inicial, con edad compatible. Solo se fusiona cuando el
  // candidato es único, para no mezclar homónimos.
  const nameTokens = (value: string) => normalizeIdentityText(value).split(" ").filter(Boolean);
  const isAbbreviated = (value: string) => {
    const tokens = nameTokens(value);
    return tokens.length >= 2 && tokens[0].length === 1;
  };
  // Los clubes no se escriben igual entre plataformas ("Vancouver FC" vs
  // "Vancouver Football Club", "FC Supra" vs "FC Supra du Québec"): se
  // comparan por tokens significativos (subconjunto) más alias explícitos
  // para rebrandings ("York United" pasó a ser "Inter Toronto" en 2026).
  const compatible = (a: typeof combined, b: typeof combined) => {
    const ta = nameTokens(a[0].player);
    const tb = nameTokens(b[0].player);
    if (!ta.length || !tb.length) return false;
    if (ta[ta.length - 1] !== tb[tb.length - 1]) return false;
    if (ta[0][0] !== tb[0][0]) return false;
    const clubsA = [...new Set(a.map((entry) => entry.clubIdentity).filter(Boolean))];
    const clubsB = [...new Set(b.map((entry) => entry.clubIdentity).filter(Boolean))];
    if (!clubsA.some((clubA) => clubsB.some((clubB) => clubsMatch(clubA, clubB)))) return false;
    const agesA = a.map((entry) => Number(entry.ageIdentity)).filter(Number.isFinite);
    const agesB = b.map((entry) => Number(entry.ageIdentity)).filter(Number.isFinite);
    if (!agesA.length || !agesB.length) return true;
    return agesA.some((x) => agesB.some((y) => Math.abs(x - y) <= 1));
  };
  for (let shortIndex = mergedGroups.length - 1; shortIndex >= 0; shortIndex -= 1) {
    const group = mergedGroups[shortIndex];
    if (!isAbbreviated(group[0].player)) continue;
    const candidates = mergedGroups.filter((other) => other !== group && !isAbbreviated(other[0].player) && compatible(group, other));
    if (candidates.length === 1) {
      candidates[0].push(...group);
      mergedGroups.splice(shortIndex, 1);
    }
  }

  // Fusión por fecha de nacimiento: "Ballou Tabla" (SkillCorner) y "Ballou
  // Jean-Yves Tabla" (StatsBomb) comparten cumpleaños exacto, apellido e
  // inicial aunque el nombre y el club no coincidan textualmente. Solo se
  // fusiona con candidato único y nunca dentro del mismo archivo.
  for (let index = mergedGroups.length - 1; index >= 0; index -= 1) {
    const group = mergedGroups[index];
    const births = new Set(group.map((entry) => entry.birthIdentity).filter(Boolean));
    if (!births.size) continue;
    const tokens = nameTokens(group[0].player);
    if (!tokens.length) continue;
    const surname = tokens[tokens.length - 1];
    const initial = tokens[0][0];
    const sources = new Set(group.map((entry) => entry.sourceIndex));
    const clubs = [...new Set(group.map((entry) => entry.clubIdentity).filter(Boolean))];
    const candidates = mergedGroups.filter((other) => {
      if (other === group) return false;
      if (other.some((entry) => sources.has(entry.sourceIndex))) return false;
      const otherTokens = nameTokens(other[0].player);
      if (!otherTokens.length || otherTokens[otherTokens.length - 1] !== surname) return false;
      if (otherTokens[0][0] !== initial) return false;
      if (!other.some((entry) => births.has(entry.birthIdentity))) return false;
      // El cumpleaños exacto es una señal fuerte, pero no basta sola: dos
      // jugadores distintos pueden compartir apellido, inicial y fecha.
      const otherClubs = [...new Set(other.map((entry) => entry.clubIdentity).filter(Boolean))];
      if (!clubs.length || !otherClubs.length) return true;
      return clubs.some((club) => otherClubs.some((otherClub) => clubsMatch(club, otherClub)));
    });
    if (candidates.length === 1) {
      candidates[0].push(...group);
      mergedGroups.splice(index, 1);
    }
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
    // SkillCorner es una capa física sobre la base, nunca la fuente de la
    // identidad: nombre, club, posición y edad salen de Wyscout/StatsBomb
    // (su club puede estar desactualizado — "York United" por "Inter Toronto").
    const identitySorted = sorted.filter((entry) => entry.provider !== "skillcorner");
    const latest = (identitySorted.length ? identitySorted : sorted).at(-1)!;
    const seasons = uniqueText(sorted.map(({ season }) => season || ""));
    const output: DataRow = {
      Player: latest.player,
      "Data sources": uniqueText(sorted.map(({ source }) => source)),
      // Dentro de un proveedor las temporadas se suman; entre proveedores se
      // toma el máximo (Wyscout y StatsBomb describen los mismos minutos).
      [core.matches]: maxPerProvider(sorted, (row) => numeric(row[core.matches]) || 0),
      [core.minutes]: maxPerProvider(sorted, (row) => numeric(row[core.minutes]) || 0),
    };
    if (seasons) output.Seasons = seasons;

    if (teamColumn) output.Team = rowTeam(latest.row);
    if (positionColumn) output.Position = mergePlayerPositions([...(identitySorted.length ? identitySorted : sorted)].reverse().map(({ row }) => row[positionColumn]));
    if (passportColumn) output["Passport country"] = uniqueText(sorted.map(({ row }) => row[passportColumn]));
    if (currentTeamColumn) output["Current Team"] = latest.row[currentTeamColumn] ?? "";
    if (contractColumn) output["Contract expires"] = latest.row[contractColumn] ?? "";
    if (ageColumn) output.Age = latest.row[ageColumn] ?? "";

    for (const header of cumulativeHeaders) {
      const values = sorted.map(({ row }) => numeric(row[header])).filter(Number.isFinite);
      // Igual que minutos y partidos: se suman las temporadas dentro de un
      // proveedor, pero entre proveedores se toma el máximo — Wyscout y
      // StatsBomb describen los mismos goles de la misma temporada.
      output[header] = values.length ? maxPerProvider(sorted, (row) => numeric(row[header]) || 0) : Number.NaN;
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

type MetricDefinition = { label: string; aliases: string[]; group: number; colorGroup: MetricColorGroup; inverse?: boolean; source?: MetricSource };

// Sets de métricas por rol según la especificación del cuaderno de análisis.
// `colorGroup` fija el color del anillo del radar; para Wingers, Forwards y
// Attack Midfielders los duelos aéreos cuentan como señal ofensiva.
export const METRICS: Record<string, MetricDefinition[]> = {
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
// La hoja de perfiles separa el extremo asociativo del extremo directo: misma
// base Wyscout (copia, no alias) y distinto bloque de plataforma más abajo.
METRICS.DWING = [...METRICS.WING];

// Cohortes que comparten grupo de referencia: "Extremos directos" es otra
// lente de métricas sobre los mismos extremos, no otra población.
const PEER_COHORTS: Record<string, string> = { DWING: "WING" };
export function peerCohort(cohort: string) {
  return PEER_COHORTS[cohort] ?? cohort;
}

// ---- Métricas de plataformas conectadas por API ----
// Solo aparecen en el radar cuando la base cargada trae sus columnas (es
// decir, cuando se añadió StatsBomb o SkillCorner desde "Conectar API").
// Perfiles posicionales definidos por dirección de scouting (agosto 2026):
// StatsBomb aporta el bloque técnico-táctico y SkillCorner el bloque de
// game intelligence + físico (siempre en verde y como porción "salida").
function sbMetric(label: string, aliases: string[], group: number, colorGroup: MetricColorGroup, inverse = false): MetricDefinition {
  return { label, aliases, group, colorGroup, inverse, source: "statsbomb" };
}
function scMetric(label: string, aliases: string[], inverse = false): MetricDefinition {
  return { label, aliases, group: 2, colorGroup: "physical", inverse, source: "skillcorner" };
}

const SB = {
  carries: sbMetric("Conducciones (SB)", ["carries sb"], 1, "creating"),
  deepProg: sbMetric("Progresiones profundas (SB)", ["deep progressions sb"], 2, "passing"),
  obvDribbleCarry: sbMetric("OBV regate y conducción (SB)", ["dribble carry obv sb"], 1, "creating"),
  obvDefensive: sbMetric("OBV defensivo (SB)", ["defensive action obv sb"], 0, "defending"),
  obvPass: sbMetric("OBV pase (SB)", ["pass obv sb"], 2, "passing"),
  ballRecoveries: sbMetric("Recuperaciones (SB)", ["ball recoveries sb"], 0, "defending"),
  counterpressures: sbMetric("Contrapresiones (SB)", ["counterpressures sb"], 0, "defending"),
  challenge: sbMetric("Entradas ganadas % (SB)", ["tackle dribbled past % sb"], 0, "defending"),
  deepCompletions: sbMetric("Pases profundos completados (SB)", ["deep completions sb"], 2, "passing"),
  tacklesInterceptions: sbMetric("Entradas + intercepciones (SB)", ["tackles interceptions sb"], 0, "defending"),
  opKeyPasses: sbMetric("Pases clave JA (SB)", ["op key passes sb"], 1, "creating"),
  opPassesIntoBox: sbMetric("Pases al área JA (SB)", ["op passes into box sb"], 1, "creating"),
  opXa: sbMetric("xG asistido JA (SB)", ["op xg assisted sb"], 1, "creating"),
  passingPct: sbMetric("Precisión de pase % (SB)", ["passing % sb"], 2, "passing"),
  longBallPct: sbMetric("Precisión balón largo % (SB)", ["long ball % sb"], 2, "passing"),
  longBalls: sbMetric("Balones largos (SB)", ["long balls sb"], 2, "passing"),
  aerialWinPct: sbMetric("Aéreos ganados % (SB)", ["aerial win % sb"], 0, "defending"),
  aerialWinPctAtt: sbMetric("Aéreos ganados % (SB)", ["aerial win % sb"], 0, "finishing"),
  aerialWins: sbMetric("Aéreos ganados (SB)", ["aerial wins sb"], 0, "defending"),
  aerialWinsAtt: sbMetric("Aéreos ganados (SB)", ["aerial wins sb"], 0, "finishing"),
  tackles: sbMetric("Entradas (SB)", ["tackles sb"], 0, "defending"),
  interceptions: sbMetric("Intercepciones (SB)", ["interceptions sb"], 0, "defending"),
  blocksPerShot: sbMetric("Bloqueos por remate (SB)", ["blocks per shot sb"], 0, "defending"),
  pressuredPassPct: sbMetric("Precisión bajo presión % (SB)", ["pressured pass % sb"], 2, "passing"),
  opPasses: sbMetric("Pases JA (SB)", ["op passes sb"], 2, "passing"),
  shots: sbMetric("Remates (SB)", ["np shots sb"], 0, "finishing"),
  xg: sbMetric("xG (SB)", ["xg sb"], 0, "finishing"),
  throughBalls: sbMetric("Pases filtrados (SB)", ["through balls sb"], 1, "creating"),
  dribbles: sbMetric("Regates exitosos (SB)", ["successful dribbles sb"], 1, "creating"),
  touchesBox: sbMetric("Toques en el área (SB)", ["touches in box sb"], 0, "finishing"),
  goalConversion: sbMetric("Conversión de gol % (SB)", ["goal conversion % sb"], 0, "finishing"),
  goals: sbMetric("Goles /90 (SB)", ["goals per 90 sb"], 0, "finishing"),
  npPsxg: sbMetric("PSxG sin penales (SB)", ["np psxg sb"], 0, "finishing"),
  foulsWon: sbMetric("Faltas recibidas (SB)", ["fouls won sb"], 1, "creating"),
  penaltyWins: sbMetric("Penales ganados (SB)", ["penalty wins sb"], 1, "creating"),
  boxCross: sbMetric("Centros al área % (SB)", ["box cross % sb"], 1, "creating"),
};

// Los volúmenes van normalizados a 30 minutos con balón del equipo; esa base
// se explica una vez en el pie del informe en lugar de arrastrar "P30" en cada
// etiqueta. Los acrónimos de la plataforma (PSV-99, HSR, xPass, COD) se
// escriben con palabras para que se lean sin diccionario.
const SC = {
  passCompletion: scMetric("Pases completados % (SC)", ["pass completion % sc"]),
  linebreakPasses: scMetric("Pases rompe-líneas (SC)", ["linebreak passes p30 sc"]),
  // El valor crudo es la probabilidad de completar el pase: cuanto más bajo,
  // más difícil es lo que intenta. Se invierte para que el percentil alto
  // signifique "arriesga más", que es la lectura útil para el scout.
  avgXPass: scMetric("Dificultad de pase (SC)", ["avg xpass attempted sc"], true),
  passesToRuns: scMetric("Pases a desmarques (SC)", ["passes to runs p30 sc"]),
  wideOptions: scMetric("Opciones en banda (SC)", ["wide options p30 sc"]),
  linebreakOptions: scMetric("Opciones rompe-líneas (SC)", ["linebreak options p30 sc"]),
  boxOptions: scMetric("Opciones en el área (SC)", ["box options p30 sc"]),
  retention: scMetric("Retención bajo presión % (SC)", ["retention under pressure % sc"]),
  forwardCarries: scMetric("Conducciones que ganan campo (SC)", ["forward long carries p30 sc"]),
  directRegain: scMetric("Recuperación directa en duelo % (SC)", ["direct regain % sc"]),
  beaten: scMetric("Superado en duelo % (SC)", ["beaten in duel % sc"], true),
  overlapRuns: scMetric("Desmarques por fuera y por dentro (SC)", ["overlap underlap runs p30 sc"]),
  offBallRuns: scMetric("Desmarques totales (SC)", ["off ball runs p30 sc"]),
  pullingWideRuns: scMetric("Desmarques abriendo el campo (SC)", ["pulling wide runs p30 sc"]),
  runsInBehind: scMetric("Rupturas a la espalda (SC)", ["runs in behind p30 sc"]),
  dangerousRuns: scMetric("Rupturas peligrosas (SC)", ["dangerous runs behind p30 sc"]),
  runsReceived: scMetric("Desmarques atendidos (SC)", ["runs received p30 sc"]),
  psv99: scMetric("Velocidad punta km/h (SC)", ["psv 99 sc", "psv99 sc"]),
  hsr: scMetric("Distancia a alta velocidad (SC)", ["hsr distance sc"]),
  metersPerMinute: scMetric("Metros por minuto (SC)", ["meters per minute sc"]),
  timeToSprint: scMetric("Reacción al sprint tras giro (SC)", ["time to sprint post cod sc"], true),
};

METRICS.GK.push(
  sbMetric("OBV portero (SB)", ["gk obv sb"], 0, "goalkeeper"),
  sbMetric("Precisión balón largo % (SB)", ["long ball % sb"], 0, "goalkeeper"),
  sbMetric("Atajadas % (SB)", ["shot stopping % sb"], 0, "goalkeeper"),
  sbMetric("PSxG en contra (SB)", ["opp np psxg faced sb"], 0, "goalkeeper", true),
  sbMetric("OBV pase (SB)", ["pass obv sb"], 0, "goalkeeper"),
  sbMetric("Distancia de intervención (SB)", ["gk aggressive distance sb"], 0, "goalkeeper"),
  sbMetric("Longitud de pase (SB)", ["pass length sb"], 0, "goalkeeper"),
  SC.passCompletion, SC.linebreakPasses, SC.avgXPass,
);
METRICS.CB.push(
  SB.passingPct, SB.obvPass, SB.deepProg, SB.longBallPct, SB.longBalls, SB.obvDribbleCarry,
  SB.aerialWinPct, SB.aerialWins, SB.obvDefensive, SB.tackles, SB.interceptions, SB.blocksPerShot, SB.challenge,
  SC.directRegain, SC.beaten, SC.linebreakPasses, SC.psv99,
);
METRICS.FB.push(
  SB.carries, SB.deepProg, SB.obvDribbleCarry, SB.obvDefensive, SB.obvPass, SB.ballRecoveries,
  SB.counterpressures, SB.challenge, SB.deepCompletions, SB.tacklesInterceptions, SB.opKeyPasses,
  SB.opPassesIntoBox, SB.opXa,
  SC.overlapRuns, SC.directRegain, SC.hsr, SC.psv99,
);
METRICS.DMF.push(
  SB.passingPct, SB.pressuredPassPct, SB.opPasses, SB.longBallPct, SB.longBalls, SB.deepProg,
  SB.obvPass, SB.obvDribbleCarry, SB.obvDefensive, SB.tacklesInterceptions, SB.ballRecoveries,
  SB.counterpressures, SB.challenge,
  SC.retention, SC.linebreakPasses, SC.directRegain,
);
METRICS.B2B.push(
  SB.shots, SB.xg, SB.opXa, SB.opKeyPasses, SB.obvPass, SB.deepProg, SB.opPasses, SB.longBalls,
  SB.carries, SB.obvDribbleCarry, SB.obvDefensive, SB.tacklesInterceptions, SB.counterpressures,
  SC.offBallRuns, SC.passesToRuns, SC.retention, SC.metersPerMinute,
);
METRICS.AM.push(
  SB.xg, SB.opXa, SB.touchesBox, SB.obvDribbleCarry, SB.throughBalls, SB.opKeyPasses, SB.dribbles,
  SB.carries, SB.opPassesIntoBox, SB.deepProg, SB.deepCompletions, SB.obvPass,
  SC.linebreakOptions, SC.passesToRuns, SC.retention,
);
METRICS.CF.push(
  SB.goalConversion, SB.shots, SB.goals, SB.xg, SB.npPsxg, SB.touchesBox, SB.aerialWinPctAtt,
  SB.aerialWinsAtt, SB.foulsWon, SB.penaltyWins, SB.obvDribbleCarry, SB.counterpressures,
  SC.runsInBehind, SC.dangerousRuns, SC.runsReceived, SC.boxOptions,
);
// Extremo asociativo: recibe entre líneas, asocia y habilita al que rompe.
METRICS.WING.push(
  SB.shots, SB.xg, SB.opXa, SB.opKeyPasses, SB.throughBalls, SB.dribbles, SB.carries, SB.deepProg,
  SB.deepCompletions, SB.obvPass, SB.obvDribbleCarry, SB.obvDefensive,
  SC.pullingWideRuns, SC.wideOptions, SC.passesToRuns, SC.retention,
);
// Extremo directo: ataca el espacio, conduce y centra; se mide contra los
// mismos extremos de la base, pero con la lente de la velocidad pura.
METRICS.DWING.push(
  SB.boxCross, SB.carries, SB.deepProg, SB.touchesBox, SB.obvDribbleCarry, SB.ballRecoveries,
  SB.counterpressures, SB.opKeyPasses, SB.opPassesIntoBox, SB.opXa, SB.shots, SB.xg, SB.dribbles,
  SC.runsInBehind, SC.forwardCarries, SC.psv99, SC.timeToSprint,
);


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
  const rules = TACTICAL_PROFILES[cohort] ?? TACTICAL_PROFILES[peerCohort(cohort)] ?? TACTICAL_PROFILES.OTHER;
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

/**
 * Métricas que la base cargada permite dibujar: toda definición conocida —de
 * cualquier perfil— cuya columna exista en los datos. Es el universo que se
 * ofrece para añadir o quitar del radar; el set por defecto sigue siendo el
 * del perfil del jugador.
 */
export type CatalogueMetric = MetricDefinition & { key: string };

export function metricCatalogue(rows: DataRow[], cohort = "OTHER"): CatalogueMetric[] {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const seen = new Set<string>();
  const catalogue: CatalogueMetric[] = [];
  // Una misma etiqueta puede estar definida en varios perfiles con distinto
  // grupo de color (OBV de pase es "pase" para un lateral y "portería" para un
  // portero). Manda la definición del perfil activo.
  const ordenadas = [...(METRICS[cohort] ?? []), ...Object.values(METRICS).flat()];
  for (const definition of ordenadas) {
    if (seen.has(definition.label)) continue;
    // La columna real es la que decide el grupo de color: clasificar por la
    // etiqueta manda métricas al bloque equivocado ("Pass OBV" a portería).
    const key = findColumn(headers, definition.aliases);
    if (!key) continue;
    seen.add(definition.label);
    catalogue.push({ ...definition, key });
  }
  const rank = new Map(SIMILARITY_METRIC_GROUPS.map((group, index) => [group.id, index] as const));
  return catalogue.sort((a, b) => {
    const byGroup = (rank.get(similarityMetricGroup(a, cohort).id) ?? 99) - (rank.get(similarityMetricGroup(b, cohort).id) ?? 99);
    return byGroup || a.label.localeCompare(b.label, "es");
  });
}

/** Métricas que trae por defecto un perfil, en su orden de definición. */
export function defaultMetricLabels(cohort: string): string[] {
  return (METRICS[cohort] ?? METRICS.OTHER).map((definition) => definition.label);
}

export function buildPlayerReport(rows: DataRow[], selectedIndex: number, minimumMinutes: number, forcedCohort = "AUTO", selectedMetricLabels?: string[] | null): PlayerReport | null {
  const row = rows[selectedIndex];
  if (!row) return null;
  const headers = [...new Set(rows.flatMap((item) => Object.keys(item)))];
  const core = detectCoreColumns(headers);
  const positionColumn = findColumn(headers, POSITION_ALIASES);
  const sourceCohort = cohortOf(positionColumn ? row[positionColumn] : "");
  const cohort = forcedCohort === "AUTO" ? sourceCohort : forcedCohort;
  // Con una selección propia se respeta su orden y puede traer métricas de
  // otros perfiles; sin ella, el set del perfil. El grupo de referencia y el
  // cálculo del percentil no cambian en ningún caso.
  const byLabel = new Map(Object.values(METRICS).flat().map((definition) => [definition.label, definition] as const));
  const definitions = selectedMetricLabels?.length
    ? selectedMetricLabels.map((label) => byLabel.get(label)).filter((definition): definition is MetricDefinition => Boolean(definition))
    : METRICS[cohort] ?? METRICS.OTHER;
  // El grupo de referencia son siempre los jugadores de una posición dentro de
  // la base cargada, nunca la base entera. Al forzar una cohorte se cambian a
  // la vez la lente de métricas y los pares: mirar a un portero "como delantero"
  // solo significa algo si se le compara contra delanteros.
  const peerGroup = peerCohort(cohort);
  const peers = rows.filter((candidate) => (
    cohortOf(positionColumn ? candidate[positionColumn] : "") === peerGroup
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
    return [{ key, label: definition.label, value, percentile: percentile(value, peerValues, definition.inverse), group: definition.group, colorGroup: definition.colorGroup, inverse: definition.inverse, source: definition.source ?? "wyscout", sample: peerValues.length }];
  });
  // El radar se lee por bloques: las métricas salen agrupadas por categoría
  // (finalización → creación → pase → defensa → portero → físico) para que
  // cada color forme un solo arco continuo en vez de repartirse por todo el
  // círculo. Dentro de cada categoría se respeta el orden de la definición.
  const groupRank = new Map(SIMILARITY_METRIC_GROUPS.map((group, index) => [group.id, index] as const));
  metrics.sort((a, b) => {
    const rankA = groupRank.get(similarityMetricGroup(a, cohort).id) ?? SIMILARITY_METRIC_GROUPS.length;
    const rankB = groupRank.get(similarityMetricGroup(b, cohort).id) ?? SIMILARITY_METRIC_GROUPS.length;
    return rankA - rankB;
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
