export type SimilarityMetricGroup = {
  id: "finishing" | "defending" | "creation" | "imbalance";
  label: string;
  color: string;
};

export const SIMILARITY_METRIC_GROUPS: SimilarityMetricGroup[] = [
  { id: "finishing", label: "Finalización", color: "#e95b3f" },
  { id: "defending", label: "Defensa", color: "#3f72d9" },
  { id: "creation", label: "Creación / progresión", color: "#d7a62c" },
  { id: "imbalance", label: "Desequilibrio / pase", color: "#43a8a0" },
];

const AERIAL_METRIC = /aerial|aereo|cabece|header/;
const DEFENSIVE_METRIC = /defens|intercep|duelo|parada|save|gol evitado|prevented|gol recibido|conceded|entrada|tackle|recupera|bloqueo|clearance/;
const ATTACKING_AERIAL_COHORTS = new Set(["WING", "AM", "CF", "OTHER"]);

export function similarityMetricGroup(metric: { key: string; label: string; group: number }, cohort = "") {
  const semanticName = `${metric.label} ${metric.key}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
  if (AERIAL_METRIC.test(semanticName)) {
    return ATTACKING_AERIAL_COHORTS.has(cohort.toUpperCase())
      ? SIMILARITY_METRIC_GROUPS[0]
      : SIMILARITY_METRIC_GROUPS[1];
  }
  if (DEFENSIVE_METRIC.test(semanticName)) return SIMILARITY_METRIC_GROUPS[1];
  if (metric.group === 1) return SIMILARITY_METRIC_GROUPS[2];
  if (metric.group === 2) return SIMILARITY_METRIC_GROUPS[3];
  return SIMILARITY_METRIC_GROUPS[0];
}
