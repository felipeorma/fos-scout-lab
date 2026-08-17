import {
  buildPlayerReport,
  cohortOf,
  peerCohort,
  detectCoreColumns,
  findColumn,
  numeric,
  type DataRow,
  type PlayerReport,
} from "./scouting.ts";
import {
  POSITION_ROLES,
  formatPlayerPositions,
  playerPositions,
  positionRoles,
  positionSides,
  primaryPositionRole,
  roleCohort,
  type PlayerPosition,
} from "./positions.ts";
import { t, tf } from "./i18n.ts";

export type SimilarityFilters = {
  query: string;
  ageMin: number | null;
  ageMax: number | null;
  minimumMinutes: number;
  passport: string;
  /** Rol principal (primera posición del jugador) */
  position: string;
  /** Rol secundario: debe aparecer entre las posiciones no principales */
  secondaryRole?: string;
  /** Lado del campo según el prefijo del código Wyscout (L/R) */
  side?: "" | "left" | "right";
};

export type SimilarityMetricComparison = {
  key: string;
  label: string;
  group: number;
  colorGroup?: string;
  weight: number;
  targetValue: number;
  candidateValue: number;
  targetPercentile: number;
  candidatePercentile: number;
  difference: number;
};

export type SimilarityPlayer = {
  index: number;
  name: string;
  team: string;
  position: string;
  positions: PlayerPosition[];
  cohort: string;
  age: number | null;
  passport: string;
  minutes: number;
  similarity: number;
  metricSimilarity: number;
  contextSimilarity: number;
  coverage: number;
  metrics: SimilarityMetricComparison[];
};

export type SimilaritySearchResult = {
  target: PlayerReport;
  candidates: SimilarityPlayer[];
};

export type SimilarityOptions = {
  passports: string[];
  positions: string[];
};

export type SimilarityMetricWeights = Record<string, number>;

const PLAYER_ALIASES = ["player", "jugador", "player name", "nombre jugador"];
const TEAM_ALIASES = ["team within selected timeframe", "equipo durante el periodo seleccionado", "team", "equipo"];
const POSITION_ALIASES = ["position", "posicion especifica", "posicion"];
const PASSPORT_ALIASES = ["passport country", "birth country", "pais de pasaporte", "pais de nacimiento", "nacionalidad"];
const AGE_ALIASES = ["age", "edad"];

const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

function text(row: DataRow, column: string, fallback: string) {
  return String(column ? row[column] ?? "" : "").trim() || fallback;
}

function optionalNumber(value: unknown) {
  const parsed = numeric(value as DataRow[string]);
  return Number.isFinite(parsed) ? parsed : null;
}

// La población llega ORDENADA ascendente: dos búsquedas binarias reemplazan
// los dos recorridos completos y el rank respeta las métricas invertidas
// (goles concedidos, xG en contra), igual que la ficha de la Página 1.
function lowerBound(sorted: number[], value: number) {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle] < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBound(sorted: number[], value: number) {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle] <= value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function percentileRank(value: number, sortedPopulation: number[], inverse = false) {
  if (!Number.isFinite(value) || !sortedPopulation.length) return null;
  const below = lowerBound(sortedPopulation, value);
  const equal = upperBound(sortedPopulation, value) - below;
  const rank = Math.round(((below + equal * 0.5) / sortedPopulation.length) * 100);
  return inverse ? 100 - rank : rank;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
}

export function playerPassports(value: unknown) {
  const unique = new Map<string, string>();
  String(value ?? "")
    .split(/\s*(?:,|;|\/|\||\n)\s*/)
    .map((passport) => passport.trim())
    .filter(Boolean)
    .forEach((passport) => {
      const key = normalizeSearch(passport);
      if (key && !unique.has(key)) unique.set(key, passport);
    });
  return [...unique.values()];
}

export function similarityOptions(rows: DataRow[]): SimilarityOptions {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const positionColumn = findColumn(headers, POSITION_ALIASES);
  const passportColumn = findColumn(headers, PASSPORT_ALIASES);
  return {
    positions: POSITION_ROLES.filter((role) => rows.some((row) => primaryPositionRole(text(row, positionColumn, "")) === role)),
    passports: [...new Map(
      rows
        .flatMap((row) => playerPassports(text(row, passportColumn, "")))
        .map((passport) => [normalizeSearch(passport), passport] as const),
    ).values()].sort(collator.compare),
  };
}

/**
 * Roles secundarios disponibles tras aplicar el filtro de rol principal:
 * roles que aparecen en posiciones no principales de esos jugadores.
 */
export function secondaryRoleOptions(rows: DataRow[], primaryRole: string): string[] {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const positionColumn = findColumn(headers, POSITION_ALIASES);
  const available = new Set<string>();
  for (const row of rows) {
    const raw = text(row, positionColumn, "");
    const primary = primaryPositionRole(raw);
    if (primaryRole && primary !== primaryRole) continue;
    for (const role of positionRoles(raw)) {
      if (role !== primary) available.add(role);
    }
  }
  return POSITION_ROLES.filter((role) => available.has(role));
}

function metricWeight(key: string, weights: SimilarityMetricWeights) {
  const value = weights[key];
  return Number.isFinite(value) ? Math.max(0, Math.min(3, value)) : 1;
}

export function buildSimilaritySearch(rows: DataRow[], targetIndex: number, filters: SimilarityFilters, metricWeights: SimilarityMetricWeights = {}, reportCohort = "AUTO", selectedMetricLabels?: string[] | null): SimilaritySearchResult | null {
  // Si el usuario filtra por un rol, la comparación usa el set de métricas de
  // ese rol (p. ej. filtrar por Delanteros compara con métricas de CF aunque
  // el jugador objetivo sea extremo). Sin filtro, se usa su cohorte natural.
  // El filtro de rol manda; si no hay, se respeta el conjunto de métricas que
  // el usuario asignó en la ficha de la Página 1 para que ambas páginas
  // describan al jugador con el mismo rol.
  const filteredRole = POSITION_ROLES.find((role) => role === filters.position) ?? null;
  const forcedCohort = filteredRole ? roleCohort(filteredRole) : reportCohort;
  // La selección de métricas de la Página 1 manda también aquí: una sola
  // elección describe al jugador en las dos hojas. Con un filtro de rol activo
  // se ignora, porque entonces el set es el de ese rol.
  const target = buildPlayerReport(rows, targetIndex, filters.minimumMinutes, forcedCohort, filters.position ? null : selectedMetricLabels);
  const targetRow = rows[targetIndex];
  if (!target || !targetRow || !target.metrics.length) return null;

  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const core = detectCoreColumns(headers);
  const playerColumn = core.player || findColumn(headers, PLAYER_ALIASES);
  const teamColumn = findColumn(headers, TEAM_ALIASES);
  const positionColumn = findColumn(headers, POSITION_ALIASES);
  const passportColumn = findColumn(headers, PASSPORT_ALIASES);
  const ageColumn = findColumn(headers, AGE_ALIASES);
  // El grupo de referencia de los percentiles es el mismo que usa la ficha:
  // los jugadores de la cohorte del reporte con el piso de minutos del filtro.
  // Nunca toda la base — un portero no se mide contra jugadores de campo.
  const cohortPeers = rows.filter((row) => (
    cohortOf(positionColumn ? row[positionColumn] : "") === peerCohort(target.cohort)
    && (filters.minimumMinutes <= 0 || numeric(row[core.minutes]) >= filters.minimumMinutes)
  ));
  const metricInverse = new Map(target.metrics.map((metric) => [metric.key, Boolean(metric.inverse)] as const));
  const metricPopulations = new Map(target.metrics.map((metric) => [
    metric.key,
    cohortPeers.map((row) => numeric(row[metric.key])).filter(Number.isFinite).sort((a, b) => a - b),
  ]));
  const targetRanks = new Map(target.metrics.flatMap((metric) => {
    const rank = percentileRank(numeric(targetRow[metric.key]), metricPopulations.get(metric.key) ?? [], metricInverse.get(metric.key));
    return rank === null ? [] : [[metric.key, rank] as const];
  }));
  const normalizedQuery = normalizeSearch(filters.query);
  // Si la configuración global de pesos deja alguna métrica con peso > 0, un
  // candidato sin datos en NINGUNA de esas métricas queda fuera del ranking:
  // antes heredaba la similitud de contexto y podía aparecer al 100%.
  const anyWeightConfigured = target.metrics.some((metric) => metricWeight(metric.key, metricWeights) > 0);
  const targetAge = optionalNumber(ageColumn ? targetRow[ageColumn] : null);
  const targetPosition = text(targetRow, positionColumn, target.position);
  const targetRoles = positionRoles(targetPosition);
  const targetPrimaryRole = primaryPositionRole(targetPosition);
  const targetCohort = cohortOf(targetPosition);

  const candidates = rows.flatMap((row, index) => {
    if (index === targetIndex) return [];
    const name = text(row, playerColumn, tf("Jugador {n}", { n: index + 1 }));
    const team = text(row, teamColumn, t("Equipo no disponible"));
    const rawPosition = text(row, positionColumn, "—");
    const positions = playerPositions(rawPosition);
    const roles = positionRoles(rawPosition);
    const passport = text(row, passportColumn, "—");
    const age = optionalNumber(ageColumn ? row[ageColumn] : null);
    const minutes = optionalNumber(core.minutes ? row[core.minutes] : null) ?? 0;
    if (minutes < filters.minimumMinutes) return [];
    if (filters.ageMin !== null && (age === null || age < filters.ageMin)) return [];
    if (filters.ageMax !== null && (age === null || age > filters.ageMax)) return [];
    if (filters.passport && !playerPassports(passport).some((item) => normalizeSearch(item) === normalizeSearch(filters.passport))) return [];
    const candidatePrimary = primaryPositionRole(rawPosition);
    if (filters.position && candidatePrimary !== filters.position) return [];
    if (filters.secondaryRole && !roles.some((role) => role !== candidatePrimary && role === filters.secondaryRole)) return [];
    if (filters.side && !positionSides(rawPosition).includes(filters.side)) return [];
    if (normalizedQuery && !normalizeSearch(`${name} ${team}`).includes(normalizedQuery)) return [];

    const metrics = target.metrics.flatMap((metric) => {
      const candidateValue = numeric(row[metric.key]);
      const targetPercentile = targetRanks.get(metric.key);
      const candidatePercentile = percentileRank(candidateValue, metricPopulations.get(metric.key) ?? [], metricInverse.get(metric.key));
      if (targetPercentile === undefined || candidatePercentile === null) return [];
      return [{
        key: metric.key,
        label: metric.label,
        group: metric.group,
        colorGroup: metric.colorGroup,
        weight: metricWeight(metric.key, metricWeights),
        targetValue: metric.value,
        candidateValue,
        targetPercentile,
        candidatePercentile,
        difference: Math.abs(targetPercentile - candidatePercentile),
      } satisfies SimilarityMetricComparison];
    });
    // Un candidato con datos a medias no puede encabezar el ranking: con 4 de
    // 16 métricas es fácil parecerse "un 78%" y desplazar a uno comparado con
    // las 16. Además la hoja mostraría solo ese puñado de métricas, dando la
    // impresión de que faltan las de una plataforma.
    const minimoComparable = Math.max(Math.min(3, target.metrics.length), Math.ceil(target.metrics.length * 0.6));
    if (metrics.length < minimoComparable) return [];

    const targetVector = metrics.map((metric) => (metric.targetPercentile - 50) / 50);
    const candidateVector = metrics.map((metric) => (metric.candidatePercentile - 50) / 50);
    const configuredWeights = metrics.map((metric) => metric.weight);
    const hasWeightedMetrics = configuredWeights.some((weight) => weight > 0);
    if (anyWeightConfigured && !hasWeightedMetrics) return [];
    const effectiveWeights = hasWeightedMetrics ? configuredWeights : configuredWeights.map(() => 1);
    const totalWeight = effectiveWeights.reduce((sum, weight) => sum + weight, 0);
    const dot = targetVector.reduce((sum, value, metricIndex) => sum + effectiveWeights[metricIndex] * value * candidateVector[metricIndex], 0);
    const targetNorm = Math.sqrt(targetVector.reduce((sum, value, metricIndex) => sum + effectiveWeights[metricIndex] * value ** 2, 0));
    const candidateNorm = Math.sqrt(candidateVector.reduce((sum, value, metricIndex) => sum + effectiveWeights[metricIndex] * value ** 2, 0));
    const cosine = targetNorm && candidateNorm ? dot / (targetNorm * candidateNorm) : 0;
    const cosineSimilarity = (cosine + 1) / 2;
    const rmsDistance = Math.sqrt(targetVector.reduce((sum, value, metricIndex) => sum + effectiveWeights[metricIndex] * (value - candidateVector[metricIndex]) ** 2, 0) / totalWeight);
    const distanceSimilarity = 1 - clamp01(rmsDistance / 2);
    let metricSimilarity = clamp01(cosineSimilarity * 0.42 + distanceSimilarity * 0.58);

    const candidateCohort = cohortOf(rawPosition);
    const candidatePrimaryRole = primaryPositionRole(rawPosition);
    const sharesRole = roles.some((role) => targetRoles.includes(role));
    const positionSimilarity = candidatePrimaryRole && candidatePrimaryRole === targetPrimaryRole ? 1 : sharesRole ? 0.9 : candidateCohort === targetCohort ? 0.84 : 0.35;
    const ageSimilarity = targetAge !== null && age !== null ? 1 - clamp01(Math.abs(targetAge - age) / 12) : 0.5;
    const contextSimilarity = clamp01(positionSimilarity * 0.76 + ageSimilarity * 0.24);
    if (!hasWeightedMetrics) metricSimilarity = contextSimilarity;
    const similarity = clamp01(metricSimilarity * 0.86 + contextSimilarity * 0.14);

    return [{
      index,
      name,
      team,
      position: formatPlayerPositions(rawPosition),
      positions,
      cohort: candidateCohort,
      age,
      passport,
      minutes,
      similarity: Math.round(similarity * 100),
      metricSimilarity: Math.round(metricSimilarity * 100),
      contextSimilarity: Math.round(contextSimilarity * 100),
      coverage: Math.round(metrics.length / target.metrics.length * 100),
      metrics,
    } satisfies SimilarityPlayer];
  }).sort((a, b) => b.similarity - a.similarity || b.coverage - a.coverage || collator.compare(a.name, b.name));

  return { target, candidates };
}
