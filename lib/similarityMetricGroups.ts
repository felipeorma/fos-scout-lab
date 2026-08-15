export type SimilarityMetricGroup = {
  id: "finishing" | "creating" | "passing" | "defending" | "goalkeeper" | "physical";
  label: string;
  color: string;
};

export const SIMILARITY_METRIC_GROUPS: SimilarityMetricGroup[] = [
  { id: "finishing", label: "Finalización", color: "#e95b3f" },
  { id: "creating", label: "Creación", color: "#d7a62c" },
  // El verde azulado anterior (#43a8a0) se confundía con el verde de
  // SkillCorner en los radares que mezclan plataformas.
  { id: "passing", label: "Pase", color: "#b5577f" },
  { id: "defending", label: "Defensa", color: "#3f72d9" },
  { id: "goalkeeper", label: "Portero", color: "#8b5cf6" },
  { id: "physical", label: "Físico", color: "#12c48b" },
];

const AERIAL_METRIC = /aerial|aereo|cabece|header/;
const DEFENSIVE_METRIC = /defens|intercep|duelo|parada|save|gol evitado|prevented|gol recibido|conceded|entrada|tackle|recupera|bloqueo|clearance/;
const ATTACKING_AERIAL_COHORTS = new Set(["WING", "DWING", "AM", "CF", "OTHER"]);

export function similarityMetricGroup(metric: { key: string; label: string; group: number; colorGroup?: string }, cohort = "") {
  // Las definiciones nuevas traen el grupo de color expl\u00edcito; la inferencia
  // por regex queda como respaldo para m\u00e9tricas sin esa marca.
  if (metric.colorGroup) {
    const explicit = SIMILARITY_METRIC_GROUPS.find((group) => group.id === metric.colorGroup);
    if (explicit) return explicit;
  }
  const semanticName = `${metric.label} ${metric.key}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
  // Payloads antiguos (sin colorGroup) de porteros: las métricas de arquero
  // pertenecen al grupo Portero, no al defensivo genérico.
  if (cohort.toUpperCase() === "GK" && /save|parada|atajada|conceded|gol(es)? concedido|gol(es)? recibido|prevented|evitado|xg against|xg en contra|exit|salida/.test(semanticName)) {
    return SIMILARITY_METRIC_GROUPS[4];
  }
  if (AERIAL_METRIC.test(semanticName)) {
    return ATTACKING_AERIAL_COHORTS.has(cohort.toUpperCase())
      ? SIMILARITY_METRIC_GROUPS[0]
      : SIMILARITY_METRIC_GROUPS[3];
  }
  if (DEFENSIVE_METRIC.test(semanticName)) return SIMILARITY_METRIC_GROUPS[3];
  if (metric.group === 1) return SIMILARITY_METRIC_GROUPS[1];
  if (metric.group === 2) return SIMILARITY_METRIC_GROUPS[2];
  return SIMILARITY_METRIC_GROUPS[0];
}

// Colores de marca por plataforma de datos, para el modo "color por
// plataforma" del radar.
export const METRIC_SOURCE_COLORS: Record<string, { label: string; color: string }> = {
  wyscout: { label: "Wyscout", color: "#e07a2f" },
  statsbomb: { label: "StatsBomb", color: "#b0243a" },
  skillcorner: { label: "SkillCorner", color: "#12c48b" },
};
