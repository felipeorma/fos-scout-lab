"use client";

import type { SimilarityMetricComparison } from "@/lib/similarity";
import { similarityMetricGroup, tonosDe } from "@/lib/similarityMetricGroups";
import { t, tf } from "@/lib/i18n";
import type { CSSProperties } from "react";

const WIDTH = 800;
const HEIGHT = 700;
const CENTER_X = 400;
const CENTER_Y = 350;
const RADIUS = 226;
/** El agujero del centro, donde va el parecido. */
const INNER = 48;
/** Hueco entre porciones. */
const GAP = 0.03;
const RING = RADIUS + 18;

/**
 * Mismo reparto angular que la pizza de la Página 1: cada métrica se centra en
 * medio de su porción (de ahí el medio paso), no sobre el vértice superior.
 * Así ambos radares muestran las métricas en la misma posición.
 */
function point(index: number, total: number, radius: number) {
  const angle = -Math.PI / 2 + (index + 0.5) * Math.PI * 2 / total;
  return { x: CENTER_X + Math.cos(angle) * radius, y: CENTER_Y + Math.sin(angle) * radius, angle };
}

const enAngulo = (angle: number, radius: number) => [CENTER_X + Math.cos(angle) * radius, CENTER_Y + Math.sin(angle) * radius] as const;

/** Una cuña entre el agujero y `radius`, de `start` a `end`. */
function wedge(start: number, end: number, radius: number) {
  const [x0, y0] = enAngulo(start, INNER), [x1, y1] = enAngulo(start, radius), [x2, y2] = enAngulo(end, radius), [x3, y3] = enAngulo(end, INNER);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}L${x1.toFixed(2)} ${y1.toFixed(2)}A${radius} ${radius} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}L${x3.toFixed(2)} ${y3.toFixed(2)}A${INNER} ${INNER} 0 0 0 ${x0.toFixed(2)} ${y0.toFixed(2)}Z`;
}

const radioDe = (percentile: number) => Math.max(INNER + 3, INNER + (RADIUS - INNER) * Math.max(0, Math.min(100, percentile)) / 100);

function arcPath(start: number, end: number, radius: number) {
  const startPoint = { x: CENTER_X + Math.cos(start) * radius, y: CENTER_Y + Math.sin(start) * radius };
  const endPoint = { x: CENTER_X + Math.cos(end) * radius, y: CENTER_Y + Math.sin(end) * radius };
  return `M ${startPoint.x.toFixed(2)} ${startPoint.y.toFixed(2)} A ${radius} ${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${endPoint.x.toFixed(2)} ${endPoint.y.toFixed(2)}`;
}

function shortName(value: string) {
  const parts = value.trim().split(/\s+/);
  return parts.length > 2 ? `${parts[0]} ${parts.at(-1)}` : value;
}

// Etiqueta compacta para el radar: sin sufijo "/90" y partida en dos líneas
// cuando es larga, para que los sets de 14-16 métricas no se encimen.
function radarLabelLines(label: string) {
  const compact = label.replace(/\s*\/90/g, "").replace(/,\s*%$/, " %");
  if (compact.length <= 16) return [compact];
  const words = compact.split(" ");
  if (words.length < 2) return [compact];
  let splitIndex = 1;
  let bestDiff = Infinity;
  for (let wordIndex = 1; wordIndex < words.length; wordIndex += 1) {
    const diff = Math.abs(words.slice(0, wordIndex).join(" ").length - words.slice(wordIndex).join(" ").length);
    if (diff < bestDiff) { bestDiff = diff; splitIndex = wordIndex; }
  }
  return [words.slice(0, splitIndex).join(" "), words.slice(splitIndex).join(" ")];
}

export function ComparisonRadar({ metrics, metricCohort, targetName, candidateName, targetColor, candidateColor, targetLabelColor, candidateLabelColor, targetLabelTransparency, candidateLabelTransparency, similarity }: { metrics: SimilarityMetricComparison[]; metricCohort: string; targetName: string; candidateName: string; targetColor: string; candidateColor: string; targetLabelColor: string; candidateLabelColor: string; targetLabelTransparency: number; candidateLabelTransparency: number; similarity?: number }) {
  if (metrics.length < 3) return null;
  /*
   * Un sufijo estable por pareja de jugadores. Los <defs> del SVG viven en un
   * espacio de nombres global del documento, así que dos radares en la misma
   * página —el de pantalla y el de la hoja de impresión— se pisarían los
   * degradados si compartieran identificador. Sale de los nombres, no de un
   * contador ni de un aleatorio, para que el marcado del servidor y el del
   * navegador coincidan.
   */
  const sufijo = `${targetName}-${candidateName}`.replace(/[^a-zA-Z0-9]+/g, "").slice(0, 28).toLowerCase() || "radar";
  const step = Math.PI * 2 / metrics.length;
  const labelRadius = 304;
  const target = shortName(targetName);
  const candidate = shortName(candidateName);
  const targetLabelOpacity = `${100 - Math.max(0, Math.min(100, targetLabelTransparency))}%`;
  const candidateLabelOpacity = `${100 - Math.max(0, Math.min(100, candidateLabelTransparency))}%`;
  // Los tonos del comparable, como los de los conjuntos en el radar de la ficha: apagado abajo, su color a mitad, claro arriba.
  const tonos = tonosDe(candidateColor);

  // El anillo de grupos: un arco por tramo seguido del mismo conjunto, como en la ficha.
  const grupos = metrics.map((metric) => similarityMetricGroup(metric, metricCohort));
  const arcos: Array<{ desde: number; hasta: number; color: string }> = [];
  let inicio = 0;
  for (let i = 1; i <= metrics.length; i += 1) {
    if (i < metrics.length && grupos[i].id === grupos[inicio].id) continue;
    arcos.push({ desde: -Math.PI / 2 + inicio * step + GAP, hasta: -Math.PI / 2 + i * step - GAP, color: grupos[inicio].color });
    inicio = i;
  }

  return <div className="comparison-radar-wrap" style={{ "--comparison-target": targetColor, "--comparison-candidate": candidateColor, "--comparison-target-label": targetLabelColor, "--comparison-candidate-label": candidateLabelColor, "--comparison-target-label-opacity": targetLabelOpacity, "--comparison-candidate-label-opacity": candidateLabelOpacity } as CSSProperties}>
    {/* La leyenda dice cómo se lee, no solo quién es quién. */}
    <div className="comparison-radar-legend" aria-hidden="true">
      <span className="candidate"><i />{tf("{p} · la cuña", { p: candidate })}</span>
      <span className="target"><i />{tf("{p} · la línea", { p: target })}</span>
    </div>
    <svg className="comparison-radar comparison-pizza" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby={`comparison-radar-title-${sufijo} comparison-radar-description-${sufijo}`}>
      {/* Se lee como las barras de "Dónde coinciden": en cada métrica, la cuña
          es el comparable y la línea, el objetivo. Si la cuña llega a la
          línea, se parecen; lo que sobra o falta es la diferencia, y se ve
          sin buscar. La cuña va en el color del comparable, de oscuro a claro
          a lo largo de TODA la pista, como el radar de la ficha; la zona del
          objetivo queda sombreada en su color. Antes eran dos cuñas finas por
          métrica, y con diecisiete métricas no había forma de seguirlas. */}
      <defs>
        <radialGradient id={`comparacion-candidate-${sufijo}`} gradientUnits="userSpaceOnUse" cx={CENTER_X} cy={CENTER_Y} r={RADIUS} fx={CENTER_X} fy={CENTER_Y}>
          <stop offset={INNER / RADIUS} stopColor={tonos.bajo} />
          <stop offset={(INNER + 0.55 * (RADIUS - INNER)) / RADIUS} stopColor={candidateColor} />
          <stop offset={1} stopColor={tonos.alto} />
        </radialGradient>
      </defs>
      <title id={`comparison-radar-title-${sufijo}`}>{tf("Radar comparativo de {a} y {b}", { a: targetName, b: candidateName })}</title>
      <desc id={`comparison-radar-description-${sufijo}`}>{tf("Percentiles P0 a P100. En cada métrica, la cuña es {b} y la línea, {a}.", { a: targetName, b: candidateName })}</desc>

      {[25, 50, 75, 100].map((level) => <circle key={level} className={level === 50 ? "comparison-radar-anillo mediana" : "comparison-radar-anillo"} cx={CENTER_X} cy={CENTER_Y} r={radioDe(level)} />)}
      <circle className="comparison-radar-anillo-base" cx={CENTER_X} cy={CENTER_Y} r={RING} />
      {arcos.map((a, i) => <path key={i} d={arcPath(a.desde, a.hasta, RING)} fill="none" stroke={a.color} className="comparison-radar-group" />)}

      {metrics.map((metric, index) => {
        const a0 = -Math.PI / 2 + index * step + GAP;
        const a1 = -Math.PI / 2 + (index + 1) * step - GAP;
        const rObjetivo = radioDe(metric.targetPercentile);
        return <g key={metric.key}>
          <path className="comparison-pizza-pista" d={wedge(a0, a1, RADIUS)} />
          {/* La zona del objetivo, tenue; la cuña del comparable encima. */}
          <path className="comparison-pizza-objetivo" d={wedge(a0, a1, rObjetivo)} />
          <path className="comparison-pizza-cuna" d={wedge(a0, a1, radioDe(metric.candidatePercentile))} fill={`url(#comparacion-candidate-${sufijo})`} />
          {/* La línea del objetivo, con un halo oscuro para que se lea sobre la cuña. */}
          <path className="comparison-pizza-linea-halo" d={arcPath(a0, a1, rObjetivo)} />
          <path className="comparison-pizza-linea" d={arcPath(a0, a1, rObjetivo)} />
        </g>;
      })}

      <circle className="comparison-pizza-disco" cx={CENTER_X} cy={CENTER_Y} r={INNER - 4} />
      {similarity !== undefined && Number.isFinite(similarity) && <>
        <text className="comparison-pizza-parecido" x={CENTER_X} y={CENTER_Y - 3} textAnchor="middle" dominantBaseline="central">{`${Math.round(similarity)}%`}</text>
        <text className="comparison-pizza-parecido-label" x={CENTER_X} y={CENTER_Y + 19} textAnchor="middle" dominantBaseline="central">{t("PARECIDO")}</text>
      </>}

      {metrics.map((metric, index) => {
        const label = point(index, metrics.length, labelRadius);
        const badgeWidth = 39;
        const badgeGap = 5;
        const badgesWidth = badgeWidth * 2 + badgeGap;
        const badgesX = label.x - badgesWidth / 2;
        const badgesY = label.y;
        // Lo que separa a los dos en esta métrica: se marca cuando pasa de 20 puntos.
        const diferencia = metric.candidatePercentile - metric.targetPercentile;
        return <g key={`values-${metric.key}`} className={Math.abs(diferencia) >= 20 ? "comparison-radar-metrica lejos" : "comparison-radar-metrica"}>
          <text className="comparison-radar-label" x={label.x} y={label.y - 7} textAnchor="middle">
            {radarLabelLines(t(metric.label)).map((line, lineIndex, lines) => (
              <tspan key={lineIndex} x={label.x} dy={lineIndex === 0 ? (lines.length > 1 ? -12 : 0) : 12}>{line}</tspan>
            ))}
          </text>
          <g className="comparison-radar-percentile" aria-label={tf("{name}: percentil {a}; {other}: percentil {b}", { name: targetName, a: metric.targetPercentile, other: candidateName, b: metric.candidatePercentile })}>
            <g className="candidate">
              <rect x={badgesX} y={badgesY} width={badgeWidth} height="18" rx="3" />
              <text x={badgesX + badgeWidth / 2} y={badgesY + 12.5} textAnchor="middle">P{metric.candidatePercentile}</text>
            </g>
            <g className="target">
              <rect x={badgesX + badgeWidth + badgeGap} y={badgesY} width={badgeWidth} height="18" rx="9" />
              <text x={badgesX + badgeWidth + badgeGap + badgeWidth / 2} y={badgesY + 12.5} textAnchor="middle">P{metric.targetPercentile}</text>
            </g>
          </g>
        </g>;
      })}
    </svg>
  </div>;
}
