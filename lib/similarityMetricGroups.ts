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

const DEFENSIVE_METRIC = /defens|intercep|duelo|aereo|parada|save|gol evitado|prevented|gol recibido|conceded|entrada|tackle|recupera|bloqueo|clearance/;

export function similarityMetricGroup(metric: { key: string; label: string; group: number }) {
  if (metric.group === 1) return SIMILARITY_METRIC_GROUPS[2];
  if (metric.group === 2) return SIMILARITY_METRIC_GROUPS[3];
  const semanticName = `${metric.label} ${metric.key}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
  return DEFENSIVE_METRIC.test(semanticName) ? SIMILARITY_METRIC_GROUPS[1] : SIMILARITY_METRIC_GROUPS[0];
}
