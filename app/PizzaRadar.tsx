"use client";

import { useEffect, useRef } from "react";
import type { RadarMetric } from "@/lib/scouting";
import { METRIC_SOURCE_COLORS, similarityMetricGroup } from "@/lib/similarityMetricGroups";
import { t, tf, type Lang } from "@/lib/i18n";

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const corner = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + corner, y);
  ctx.arcTo(x + width, y, x + width, y + height, corner);
  ctx.arcTo(x + width, y + height, x, y + height, corner);
  ctx.arcTo(x, y + height, x, y, corner);
  ctx.arcTo(x, y, x + width, y, corner);
  ctx.closePath();
}

export function PizzaRadar({ metrics, score, cohort, lang = "es", colorMode = "groups" }: { metrics: RadarMetric[]; score: number; cohort: string; lang?: Lang; colorMode?: "groups" | "platform" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !metrics.length) return;
    const draw = () => {
      const size = Math.max(420, Math.min(680, canvas.clientWidth * 2));
      const ratio = window.devicePixelRatio || 1;
      canvas.width = size * ratio;
      canvas.height = size * ratio;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      // Con sets de 14-16 métricas el radio se reduce para dejar aire a las
      // etiquetas, que se envuelven en dos líneas y pierden el sufijo "/90".
      const outer = size * (metrics.length > 10 ? 0.27 : 0.31);
      const inner = size * 0.085;
      const gap = 0.025;
      const step = Math.PI * 2 / metrics.length;
      // En modo plataforma cada métrica toma el color de su fuente de datos
      // (Wyscout / StatsBomb / SkillCorner); en modo grupo, el de su bloque.
      const metricGroups = metrics.map((metric) => {
        if (colorMode === "platform") {
          const source = metric.source ?? "wyscout";
          const brand = METRIC_SOURCE_COLORS[source] ?? METRIC_SOURCE_COLORS.wyscout;
          return { id: source, color: brand.color };
        }
        return similarityMetricGroup(metric, cohort);
      });

      ctx.strokeStyle = "rgba(26, 43, 56, .1)";
      ctx.lineWidth = 1;
      [0.25, 0.5, 0.75, 1].forEach((fraction) => {
        ctx.beginPath();
        ctx.arc(cx, cy, outer * fraction, 0, Math.PI * 2);
        ctx.stroke();
      });

      const groupRingRadius = outer + size * 0.019;
      const groupRingWidth = Math.max(6, size * 0.012);
      const groupGap = Math.min(0.045, step * 0.12);
      ctx.save();
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(cx, cy, groupRingRadius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(18, 36, 49, .14)";
      ctx.lineWidth = groupRingWidth + Math.max(3, size * 0.005);
      ctx.stroke();

      let groupStart = 0;
      for (let index = 1; index <= metrics.length; index += 1) {
        if (index < metrics.length && metricGroups[index].id === metricGroups[groupStart].id) continue;
        const startAngle = -Math.PI / 2 + groupStart * step + groupGap;
        const endAngle = -Math.PI / 2 + index * step - groupGap;
        ctx.beginPath();
        ctx.arc(cx, cy, groupRingRadius, startAngle, endAngle);
        ctx.strokeStyle = metricGroups[groupStart].color;
        ctx.lineWidth = groupRingWidth;
        ctx.stroke();
        groupStart = index;
      }
      ctx.restore();

      metrics.forEach((metric, index) => {
        const start = -Math.PI / 2 + index * step + gap;
        const end = -Math.PI / 2 + (index + 1) * step - gap;
        const radius = Math.max(inner + 8, outer * Math.max(0.08, metric.percentile / 100));
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(start) * inner, cy + Math.sin(start) * inner);
        ctx.arc(cx, cy, radius, start, end);
        ctx.lineTo(cx + Math.cos(end) * inner, cy + Math.sin(end) * inner);
        ctx.arc(cx, cy, inner, end, start, true);
        ctx.closePath();
        ctx.fillStyle = metricGroups[index].color;
        ctx.globalAlpha = 0.94;
        ctx.fill();
        ctx.globalAlpha = 1;

        const middle = start + step / 2 - gap;
        const valueRadius = Math.max(inner + 18, radius - 18);
        const value = String(metric.percentile);
        const valueFontSize = Math.max(10, size * (metrics.length > 10 ? 0.016 : 0.019));
        const valueX = cx + Math.cos(middle) * valueRadius;
        const valueY = cy + Math.sin(middle) * valueRadius;
        ctx.font = `800 ${valueFontSize}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const pillWidth = Math.max(valueFontSize * 1.85, ctx.measureText(value).width + valueFontSize * 0.85);
        const pillHeight = valueFontSize * 1.55;
        ctx.save();
        ctx.shadowColor = "rgba(3, 10, 17, .34)";
        ctx.shadowBlur = Math.max(3, size * 0.009);
        roundedRect(ctx, valueX - pillWidth / 2, valueY - pillHeight / 2, pillWidth, pillHeight, pillHeight / 2);
        ctx.fillStyle = "rgba(8, 18, 28, .82)";
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255, 255, 255, .42)";
        ctx.lineWidth = Math.max(1, size * 0.0018);
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(value, valueX, valueY + valueFontSize * 0.02);
        ctx.restore();

        const labelRadius = outer + size * (metrics.length > 10 ? 0.075 : 0.065);
        const lx = cx + Math.cos(middle) * labelRadius;
        const ly = cy + Math.sin(middle) * labelRadius;
        ctx.fillStyle = "#445366";
        const labelFontSize = Math.max(9, size * (metrics.length > 10 ? 0.0145 : 0.017));
        ctx.font = `600 ${labelFontSize}px Arial`;
        ctx.textAlign = Math.cos(middle) > 0.18 ? "left" : Math.cos(middle) < -0.18 ? "right" : "center";
        const label = t(metric.label).replace(/\s*\/90/g, "").replace(/,\s*%$/, " %");
        let lines = [label];
        if (label.length > 16) {
          const words = label.split(" ");
          if (words.length > 1) {
            let splitIndex = 1;
            let bestDiff = Infinity;
            for (let wordIndex = 1; wordIndex < words.length; wordIndex += 1) {
              const diff = Math.abs(words.slice(0, wordIndex).join(" ").length - words.slice(wordIndex).join(" ").length);
              if (diff < bestDiff) { bestDiff = diff; splitIndex = wordIndex; }
            }
            lines = [words.slice(0, splitIndex).join(" "), words.slice(splitIndex).join(" ")];
          }
        }
        const lineHeight = labelFontSize * 1.12;
        const labelOffset = -((lines.length - 1) * lineHeight) / 2 + (Math.sin(middle) > 0.4 ? lineHeight * 0.4 : Math.sin(middle) < -0.4 ? -lineHeight * 0.1 : 0);
        lines.forEach((line, lineIndex) => ctx.fillText(line, lx, ly + labelOffset + lineIndex * lineHeight));
      });

      ctx.beginPath();
      ctx.arc(cx, cy, inner - 2, 0, Math.PI * 2);
      ctx.fillStyle = "#122431";
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 ${size * 0.042}px Arial`;
      ctx.fillText(String(score), cx, cy - size * 0.008);
      ctx.fillStyle = "#9fb0bb";
      ctx.font = `700 ${size * 0.013}px Arial`;
      ctx.fillText(t("ÍNDICE"), cx, cy + size * 0.032);
    };
    draw();
    // Al mover la ventana entre monitores con distinta densidad (1x ↔ Retina)
    // el tamaño CSS no cambia y ResizeObserver no dispara: se escucha el
    // cambio de devicePixelRatio con matchMedia y se re-registra tras cada uno.
    let dprMedia: MediaQueryList | null = null;
    const watchDpr = () => {
      dprMedia?.removeEventListener("change", onDprChange);
      dprMedia = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dprMedia.addEventListener("change", onDprChange);
    };
    function onDprChange() {
      draw();
      watchDpr();
    }
    watchDpr();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      dprMedia?.removeEventListener("change", onDprChange);
    };
  }, [cohort, metrics, score, lang, colorMode]);

  return (
    <canvas
      ref={canvasRef}
      className="pizza-radar"
      role="img"
      aria-label={tf("Radar de percentiles con índice global {s} de 100", { s: score })}
    />
  );
}
