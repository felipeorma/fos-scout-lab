"use client";

import { useEffect, useRef } from "react";
import { METRIC_SOURCE_ORDER, type RadarMetric } from "@/lib/scouting";
import { METRIC_SOURCE_COLORS, similarityMetricGroup, tonosDe } from "@/lib/similarityMetricGroups";
import { sitioDelValor } from "@/lib/radar";
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

/** Los colores que no son de las métricas: sobre papel claro o sobre la tarjeta oscura del look Night. */
const TINTAS = {
  claro: { anillo: "rgba(26, 43, 56, .1)", baseDelAnillo: "rgba(18, 36, 49, .14)", etiqueta: "#445366", disco: "#122431", indice: "#9fb0bb", pista: "" },
  oscuro: { anillo: "rgba(255, 255, 255, .07)", baseDelAnillo: "rgba(255, 255, 255, .06)", etiqueta: "#b7b7c2", disco: "#08080a", indice: "#858592", pista: "rgba(255, 255, 255, .035)" },
};

/**
 * En la hoja oscura el lienzo lleva su propio fondo: el papel liso de la
 * tarjeta, el mismo que pinta la franja del radar (globals.css). Transparente,
 * Chrome lo aplanaba sobre blanco al pasar a PDF y el radar salía en un
 * cuadrado blanco; con un tramo del degradado quedaba un recuadro, porque la
 * hoja impresa no tiene las mismas proporciones que la pantalla.
 */
function pintarFondoDeLaTarjeta(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, size: number) {
  const tarjeta = canvas.closest<HTMLElement>("[data-oscuro]");
  const papel = tarjeta ? getComputedStyle(tarjeta).getPropertyValue("--report-paper").trim() : "";
  if (!papel) return;
  ctx.fillStyle = papel;
  ctx.fillRect(0, 0, size, size);
}

export function PizzaRadar({ metrics, score, cohort, lang = "es", colorMode = "groups", oscuro = false }: { metrics: RadarMetric[]; score: number; cohort: string; lang?: Lang; colorMode?: "groups" | "platform"; oscuro?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !metrics.length) return;
    const tinta = oscuro ? TINTAS.oscuro : TINTAS.claro;
    // En el look Night, la letra de la página (Geist); en claro, como siempre.
    const familia = oscuro ? getComputedStyle(canvas).fontFamily || "Arial" : "Arial";
    const draw = () => {
      const size = Math.max(420, Math.min(680, canvas.clientWidth * 2));
      const ratio = window.devicePixelRatio || 1;
      canvas.width = size * ratio;
      canvas.height = size * ratio;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.clearRect(0, 0, size, size);
      if (oscuro) pintarFondoDeLaTarjeta(ctx, canvas, size);
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
      // La ficha ya entrega las métricas por proveedor y, dentro, por
      // categoría. Al colorear por plataforma se asegura el orden por fuente
      // para radares que llegan de otro sitio, y cada color sigue ocupando un
      // solo arco continuo.
      const ordered = colorMode !== "platform" ? metrics : [...metrics].sort((a, b) => (
        METRIC_SOURCE_ORDER.indexOf(a.source ?? "wyscout") - METRIC_SOURCE_ORDER.indexOf(b.source ?? "wyscout")
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

      ctx.strokeStyle = tinta.anillo;
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
      ctx.strokeStyle = tinta.baseDelAnillo;
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
        if (tinta.pista) {
          // La pista entera de la cuña, tenue: deja ver cuánto le falta al percentil.
          ctx.beginPath();
          ctx.moveTo(ex + Math.cos(start) * inner, ey + Math.sin(start) * inner);
          ctx.arc(ex, ey, outer, start, end);
          ctx.lineTo(ex + Math.cos(end) * inner, ey + Math.sin(end) * inner);
          ctx.arc(ex, ey, inner, end, start, true);
          ctx.closePath();
          ctx.fillStyle = tinta.pista;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.moveTo(ex + Math.cos(start) * inner, ey + Math.sin(start) * inner);
        ctx.arc(ex, ey, radius, start, end);
        ctx.lineTo(ex + Math.cos(end) * inner, ey + Math.sin(end) * inner);
        ctx.arc(ex, ey, inner, end, start, true);
        ctx.closePath();
        // De oscuro a claro a lo largo de TODA la pista (no de la cuña): así
        // el tono dice el percentil, y una cuña corta se queda apagada.
        const { bajo, alto } = tonosDe(metricGroups[index].color);
        const degradado = ctx.createRadialGradient(ex, ey, inner, ex, ey, outer);
        degradado.addColorStop(0, bajo);
        degradado.addColorStop(0.55, metricGroups[index].color);
        degradado.addColorStop(1, alto);
        ctx.fillStyle = degradado;
        ctx.globalAlpha = 0.94;
        ctx.fill();
        ctx.globalAlpha = 1;

        const value = String(metric.percentile);
        const valueFontSize = Math.max(9, size * [0.019, 0.016, 0.0135][density]);
        ctx.font = `800 ${valueFontSize}px ${familia}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // La píldora se dibuja SIEMPRE, también en los percentiles bajos. Antes
        // solo se ponía cuando el número caía dentro de su porción, y como en un
        // percentil bajo la porción es demasiado corta para contenerlo, esos
        // valores salían sueltos en el color del grupo: el mismo radar mezclaba
        // dos maneras de escribir un número, y las que se quedaban sin recuadro
        // eran justo las bajas, que así parecían de otra categoría. Un percentil
        // de 8 y uno de 84 son la misma clase de dato y se leen igual.
        //
        // Sirve la misma píldora en los dos sitios porque es casi opaca: sobre
        // el color de la porción y sobre el fondo claro de la ficha se ve igual.
        // Dónde se posa lo decide sitioDelValor(), que la empuja hacia afuera
        // cuando el anillo de los valores bajos se queda estrecho.
        const pillHeight = valueFontSize * 1.55;
        const pillWidth = Math.max(pillHeight, ctx.measureText(value).width + valueFontSize * 0.62);
        const { radio: valueRadius } = sitioDelValor({
          radioInterior: inner, radioExterior: outer, radioDePorcion: radius,
          anguloPorPorcion: step, anchoPildora: pillWidth, altoPildora: pillHeight,
        });
        const valueX = ex + Math.cos(middle) * valueRadius;
        const valueY = ey + Math.sin(middle) * valueRadius;
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
        ctx.fillStyle = tinta.etiqueta;
        const labelFontSize = Math.max(8, size * [0.017, 0.0145, 0.012][density]);
        ctx.font = `600 ${labelFontSize}px ${familia}`;
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
      ctx.fillStyle = tinta.disco;
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 ${size * 0.042}px ${familia}`;
      ctx.fillText(String(score), cx, cy - size * 0.008);
      ctx.fillStyle = tinta.indice;
      ctx.font = `700 ${size * 0.013}px ${familia}`;
      ctx.fillText(t("ÍNDICE"), cx, cy + size * 0.032);
    };
    draw();
    // Con Geist, otra vez cuando la letra termine de cargar.
    if (oscuro) void document.fonts?.ready.then(draw);
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
    // Al imprimir cambia el tamaño de la hoja.
    window.addEventListener("beforeprint", draw);
    return () => {
      window.removeEventListener("beforeprint", draw);
      observer.disconnect();
      dprMedia?.removeEventListener("change", onDprChange);
    };
  }, [cohort, metrics, score, lang, colorMode, oscuro]);

  return (
    <canvas
      ref={canvasRef}
      className="pizza-radar"
      role="img"
      aria-label={tf("Radar de percentiles con índice global {s} de 100", { s: score })}
    />
  );
}
