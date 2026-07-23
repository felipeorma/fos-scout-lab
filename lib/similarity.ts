import {
  buildPlayerReport,
  cohortOf,
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
  primaryPositionRole,
  type PlayerPosition,
} from "./positions.ts";
import { t, tf } from "./i18n.ts";

export type SimilarityFilters = {
  query: string;
  ageMin: number | null;
  ageMax: number | null;
  minimumMinutes: number;
  passport: string;
  position: string;
};

export type SimilarityMetricComparison = {
  key: string;
  label: string;
  group: number;
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

function percentileRank(value: number, population: number[]) {
  if (!Number.isFinite(value) || !population.length) return null;
  const below = population.filter((candidate) => candidate < value).length;
  const equal = population.filter((candidate) => candidate === value).length;
  return Math.round(((below + equal * 0.5) / population.length) * 100);
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
    positions: POSITION_ROLES.filter((role) => rows.some((row) => positionRoles(text(row, positionColumn, "")).includes(role))),
    passports: [...new Map(
      rows
        .flatMap((row) => playerPassports(text(row, passportColumn, "")))
        .map((passport) => [normalizeSearch(passport), passport] as const),
    ).values()].sort(collator.compare),
  };
}

function metricWeight(key: string, weights: SimilarityMetricWeights) {
  const value = weights[key];
  return Number.isFinite(value) ? Math.max(0, Math.min(3, value)) : 1;
}

export function buildSimilaritySearch(rows: DataRow[], targetIndex: number, filters: SimilarityFilters, metricWeights: SimilarityMetricWeights = {}): SimilaritySearchResult | null {
  const target = buildPlayerReport(rows, targetIndex, 0, "AUTO");
  const targetRow = rows[targetIndex];
  if (!target || !targetRow || !target.metrics.length) return null;

  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const core = detectCoreColumns(headers);
  const playerColumn = core.player || findColumn(headers, PLAYER_ALIASES);
  const teamColumn = findColumn(headers, TEAM_ALIASES);
  const positionColumn = findColumn(headers, POSITION_ALIASES);
  const passportColumn = findColumn(headers, PASSPORT_ALIASES);
  const ageColumn = findColumn(headers, AGE_ALIASES);
  const metricPopulations = new Map(target.metrics.map((metric) => [
    metric.key,
    rows.map((row) => numeric(row[metric.key])).filter(Number.isFinite),
  ]));
  const targetRanks = new Map(target.metrics.flatMap((metric) => {
    const rank = percentileRank(numeric(targetRow[metric.key]), metricPopulations.get(metric.key) ?? []);
    return rank === null ? [] : [[metric.key, rank] as const];
  }));
  const normalizedQuery = normalizeSearch(filters.query);
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
    if (filters.position && !roles.includes(filters.position as (typeof POSITION_ROLES)[number])) return [];
    if (normalizedQuery && !normalizeSearch(`${name} ${team}`).includes(normalizedQuery)) return [];

    const metrics = target.metrics.flatMap((metric) => {
      const candidateValue = numeric(row[metric.key]);
      const targetPercentile = targetRanks.get(metric.key);
      const candidatePercentile = percentileRank(candidateValue, metricPopulations.get(metric.key) ?? []);
      if (targetPercentile === undefined || candidatePercentile === null) return [];
      return [{
        key: metric.key,
        label: metric.label,
        group: metric.group,
        weight: metricWeight(metric.key, metricWeights),
        targetValue: metric.value,
        candidateValue,
        targetPercentile,
        candidatePercentile,
        difference: Math.abs(targetPercentile - candidatePercentile),
      } satisfies SimilarityMetricComparison];
    });
    if (metrics.length < Math.min(3, target.metrics.length)) return [];

    const targetVector = metrics.map((metric) => (metric.targetPercentile - 50) / 50);
    const candidateVector = metrics.map((metric) => (metric.candidatePercentile - 50) / 50);
    const configuredWeights = metrics.map((metric) => metric.weight);
    const hasWeightedMetrics = configuredWeights.some((weight) => weight > 0);
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
