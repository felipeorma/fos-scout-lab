export type SimilarityMetricGroup = {
  id: "finishing" | "creating" | "passing" | "defending" | "goalkeeper" | "physical";
  label: string;
  color: string;
  /** El tono de los percentiles bajos: el color, apagado con el gris #3A3A45. */
  bajo: string;
  /** El tono de los percentiles altos: el color, claro. */
  alto: string;
};

/*
 * Cada conjunto va de oscuro a claro según el percentil: apagado abajo, su
 * color de siempre hacia la mitad y claro arriba. Aprobado el 14 de octubre
 * de 2026 (propuesta-radar-night.html); las versiones pálidas, mezcladas con
 * blanco, se descartaron por "muy claras".
 */
export const SIMILARITY_METRIC_GROUPS: SimilarityMetricGroup[] = [
  { id: "finishing", label: "Finalización", color: "#e95b3f", bajo: "#AC4F41", alto: "#FF9C7A" },
  { id: "creating", label: "Creación", color: "#d7a62c", bajo: "#A08035", alto: "#F4D27A" },
  // El verde azulado anterior (#43a8a0) se confundía con el verde de
  // SkillCorner en los radares que mezclan plataformas.
  { id: "passing", label: "Pase", color: "#b5577f", bajo: "#8A4D6B", alto: "#E390B3" },
  { id: "defending", label: "Defensa", color: "#3f72d9", bajo: "#3D5EA5", alto: "#86ABF6" },
  { id: "goalkeeper", label: "Portero", color: "#8b5cf6", bajo: "#6F50B8", alto: "#BDA2FF" },
  { id: "physical", label: "Físico", color: "#12c48b", bajo: "#209472", alto: "#6BE6BC" },
];

function mezclar(color: string, otro: string, peso: number) {
  const canal = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return "#" + [0, 1, 2].map((i) => Math.round(canal(color, i) * (1 - peso) + canal(otro, i) * peso).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * Los tonos bajo y alto de un color: los aprobados si es el de un conjunto;
 * si no (los de plataforma), apagado con el 35 % de #3A3A45 y aclarado con
 * el 40 % de blanco, que es como salen los aprobados.
 */
export function tonosDe(color: string): { bajo: string; alto: string } {
  const conjunto = SIMILARITY_METRIC_GROUPS.find((grupo) => grupo.color.toLowerCase() === color.toLowerCase());
  if (conjunto) return { bajo: conjunto.bajo, alto: conjunto.alto };
  if (!/^#[0-9a-f]{6}$/i.test(color)) return { bajo: color, alto: color };
  return { bajo: mezclar(color, "#3A3A45", 0.35), alto: mezclar(color, "#FFFFFF", 0.4) };
}

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
