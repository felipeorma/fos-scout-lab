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
      // Con Wyscout + StatsBomb + SkillCorner combinados el set puede superar
      // las 25 porciones: tercer nivel de densidad con tipografía más chica.
      const density = metrics.length > 18 ? 2 : metrics.length > 10 ? 1 : 0;
      const outer = size * [0.31, 0.27, 0.25][density];
      const inner = size * 0.085;
      const gap = 0.025;
      // El informe entrega las métricas agrupadas por categoría; al colorear
      // por plataforma se reordenan por fuente para que cada color siga
      // ocupando un solo arco continuo.
      const SOURCE_ORDER = ["wyscout", "statsbomb", "skillcorner"];
      const ordered = colorMode !== "platform" ? metrics : [...metrics].sort((a, b) => (
        SOURCE_ORDER.indexOf(a.source ?? "wyscout") - SOURCE_ORDER.indexOf(b.source ?? "wyscout")
      ));
      const step = Math.PI * 2 / ordered.length;
      // En modo plataforma cada métrica toma el color de su fuente de datos
      // (Wyscout / StatsBomb / SkillCorner); en modo grupo, el de su bloque.
      // Las de SkillCorner siempre llevan el verde de la marca, en ambos
      // modos, para que se lean como una fuente aparte.
      const metricGroups = ordered.map((metric) => {
        if (metric.source === "skillcorner") {
          return { id: "skillcorner", color: METRIC_SOURCE_COLORS.skillcorner.color };
        }
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

      // Las métricas de SkillCorner se dibujan como porciones "salidas" del
      // radar (desplazadas hacia afuera sobre su bisectriz) para marcar que
      // vienen de otra fuente de datos; el resto del radar no cambia.
      const explodeOffset = (metric: RadarMetric) => (metric.source === "skillcorner" ? size * 0.03 : 0);

      let groupStart = 0;
      for (let index = 1; index <= ordered.length; index += 1) {
        if (index < ordered.length && metricGroups[index].id === metricGroups[groupStart].id) continue;
        const startAngle = -Math.PI / 2 + groupStart * step + groupGap;
        const endAngle = -Math.PI / 2 + index * step - groupGap;
        ctx.beginPath();
        ctx.arc(cx, cy, groupRingRadius + explodeOffset(ordered[groupStart]), startAngle, endAngle);
        ctx.strokeStyle = metricGroups[groupStart].color;
        ctx.lineWidth = groupRingWidth;
        ctx.stroke();
        groupStart = index;
      }
      ctx.restore();

      ordered.forEach((metric, index) => {
        const start = -Math.PI / 2 + index * step + gap;
        const end = -Math.PI / 2 + (index + 1) * step - gap;
        const middle = start + step / 2 - gap;
        const explode = explodeOffset(metric);
        const ex = cx + Math.cos(middle) * explode;
        const ey = cy + Math.sin(middle) * explode;
        const radius = Math.max(inner + 8, outer * Math.max(0.08, metric.percentile / 100));
        ctx.beginPath();
        ctx.moveTo(ex + Math.cos(start) * inner, ey + Math.sin(start) * inner);
        ctx.arc(ex, ey, radius, start, end);
        ctx.lineTo(ex + Math.cos(end) * inner, ey + Math.sin(end) * inner);
        ctx.arc(ex, ey, inner, end, start, true);
        ctx.closePath();
        ctx.fillStyle = metricGroups[index].color;
        ctx.globalAlpha = 0.94;
        ctx.fill();
        ctx.globalAlpha = 1;

        const valueRadius = Math.max(inner + 18, radius - 18);
        const value = String(metric.percentile);
        const valueFontSize = Math.max(9, size * [0.019, 0.016, 0.0135][density]);
        const valueX = ex + Math.cos(middle) * valueRadius;
        const valueY = ey + Math.sin(middle) * valueRadius;
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

        // Las etiquetas de porciones salidas se empujan solo una fracción del
        // desplazamiento para no chocar con el borde del lienzo.
        const labelRadius = outer + size * [0.065, 0.075, 0.08][density] + explode * 0.4;
        const lx = cx + Math.cos(middle) * labelRadius;
        const ly = cy + Math.sin(middle) * labelRadius;
        ctx.fillStyle = "#445366";
        const labelFontSize = Math.max(8, size * [0.017, 0.0145, 0.012][density]);
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
        // El ancla se sujeta dentro del lienzo según el ancho real del texto,
        // para que ninguna etiqueta (sobre todo las de porciones salidas)
        // quede cortada en el borde.
        const maxLineWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
        let anchorX = lx;
        if (ctx.textAlign === "right") anchorX = Math.max(anchorX, maxLineWidth + 2);
        else if (ctx.textAlign === "left") anchorX = Math.min(anchorX, size - maxLineWidth - 2);
        else anchorX = Math.min(Math.max(anchorX, maxLineWidth / 2 + 2), size - maxLineWidth / 2 - 2);
        lines.forEach((line, lineIndex) => ctx.fillText(line, anchorX, ly + labelOffset + lineIndex * lineHeight));
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
