"use client";

import type { SimilarityMetricComparison } from "@/lib/similarity";

const GROUP_COLORS = ["#e95b3f", "#d7a62c", "#43a8a0"];
const SIZE = 640;
const CENTER = 320;
const RADIUS = 205;

function point(index: number, total: number, radius: number) {
  const angle = -Math.PI / 2 + index * Math.PI * 2 / total;
  return { x: CENTER + Math.cos(angle) * radius, y: CENTER + Math.sin(angle) * radius, angle };
}

function polygon(metrics: SimilarityMetricComparison[], field: "targetPercentile" | "candidatePercentile") {
  return metrics.map((metric, index) => {
    const radius = RADIUS * Math.max(0, Math.min(100, metric[field])) / 100;
    const value = point(index, metrics.length, radius);
    return `${value.x.toFixed(1)},${value.y.toFixed(1)}`;
  }).join(" ");
}

function arcPath(start: number, end: number, radius: number) {
  const startPoint = { x: CENTER + Math.cos(start) * radius, y: CENTER + Math.sin(start) * radius };
  const endPoint = { x: CENTER + Math.cos(end) * radius, y: CENTER + Math.sin(end) * radius };
  return `M ${startPoint.x.toFixed(2)} ${startPoint.y.toFixed(2)} A ${radius} ${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${endPoint.x.toFixed(2)} ${endPoint.y.toFixed(2)}`;
}

function shortName(value: string) {
  const parts = value.trim().split(/\s+/);
  return parts.length > 2 ? `${parts[0]} ${parts.at(-1)}` : value;
}

export function ComparisonRadar({ metrics, targetName, candidateName }: { metrics: SimilarityMetricComparison[]; targetName: string; candidateName: string }) {
  if (metrics.length < 3) return null;
  const step = Math.PI * 2 / metrics.length;
  const labelRadius = 257;
  const target = shortName(targetName);
  const candidate = shortName(candidateName);

  return <div className="comparison-radar-wrap">
    <div className="comparison-radar-legend" aria-hidden="true"><span className="target"><i />{target}</span><span className="candidate"><i />{candidate}</span></div>
    <svg className="comparison-radar" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-labelledby="comparison-radar-title comparison-radar-description">
      <title id="comparison-radar-title">Radar comparativo de {targetName} y {candidateName}</title>
      <desc id="comparison-radar-description">Comparación de percentiles P0 a P100. {targetName} aparece con círculos y {candidateName} con cuadrados.</desc>
      {[25, 50, 75, 100].map((level) => <polygon key={level} className="comparison-radar-grid" points={metrics.map((_, index) => { const value = point(index, metrics.length, RADIUS * level / 100); return `${value.x},${value.y}`; }).join(" ")} />)}
      {metrics.map((metric, index) => { const edge = point(index, metrics.length, RADIUS); return <line key={metric.key} className="comparison-radar-axis" x1={CENTER} y1={CENTER} x2={edge.x} y2={edge.y} />; })}
      {metrics.map((metric, index) => {
        const start = -Math.PI / 2 + index * step - step * .43;
        const end = -Math.PI / 2 + index * step + step * .43;
        return <path key={`ring-${metric.key}`} d={arcPath(start, end, RADIUS + 18)} fill="none" stroke={GROUP_COLORS[metric.group] ?? GROUP_COLORS[0]} className="comparison-radar-group" />;
      })}
      <polygon className="comparison-radar-area target" points={polygon(metrics, "targetPercentile")} />
      <polygon className="comparison-radar-area candidate" points={polygon(metrics, "candidatePercentile")} />
      {metrics.map((metric, index) => {
        const targetPoint = point(index, metrics.length, RADIUS * metric.targetPercentile / 100);
        const candidatePoint = point(index, metrics.length, RADIUS * metric.candidatePercentile / 100);
        const label = point(index, metrics.length, labelRadius);
        const anchor = Math.cos(label.angle) > .22 ? "start" : Math.cos(label.angle) < -.22 ? "end" : "middle";
        const labelX = anchor === "end" ? Math.max(150, label.x) : anchor === "start" ? Math.min(490, label.x) : label.x;
        return <g key={`values-${metric.key}`}>
          <circle className="comparison-radar-dot target" cx={targetPoint.x} cy={targetPoint.y} r="5" />
          <rect className="comparison-radar-dot candidate" x={candidatePoint.x - 4.5} y={candidatePoint.y - 4.5} width="9" height="9" rx="1.5" />
          <text className="comparison-radar-label" x={labelX} y={label.y - 6} textAnchor={anchor}>{metric.label}</text>
          <text className="comparison-radar-values" x={labelX} y={label.y + 11} textAnchor={anchor}>P{metric.targetPercentile} / P{metric.candidatePercentile}</text>
        </g>;
      })}
      <circle className="comparison-radar-center" cx={CENTER} cy={CENTER} r="39" />
      <text className="comparison-radar-center-value" x={CENTER} y={CENTER - 2} textAnchor="middle">P100</text>
      <text className="comparison-radar-center-label" x={CENTER} y={CENTER + 15} textAnchor="middle">ESCALA</text>
    </svg>
  </div>;
}
