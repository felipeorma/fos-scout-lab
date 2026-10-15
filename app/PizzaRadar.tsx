"use client";

import { useId } from "react";
import { METRIC_SOURCE_ORDER, type RadarMetric } from "@/lib/scouting";
import { METRIC_SOURCE_COLORS, similarityMetricGroup, tonosDe } from "@/lib/similarityMetricGroups";
import { sitioDelValor } from "@/lib/radar";
import { t, tf, type Lang } from "@/lib/i18n";

/*
 * El radar de la ficha, en SVG.
 *
 * Era un canvas, y al pasar a PDF salía como imagen: Chrome la aplanaba sobre
 * blanco si tenía transparencia, y opaca dejaba un recuadro fino en el borde
 * al imprimir sobre la tarjeta oscura. En vectorial no hay imagen: sale nítido
 * a cualquier zoom, sin borde, y no hace falta repintarlo al cambiar de tamaño
 * ni antes de imprimir. El dibujo es el mismo, con las mismas constantes.
 */

/** Lado del dibujo en unidades del SVG: el que tenía el lienzo a su tamaño máximo. */
const SIZE = 680;

/** Los colores que no son de las métricas: sobre papel claro o sobre la tarjeta oscura del look Night. */
const TINTAS = {
  claro: { anillo: "rgba(26, 43, 56, .1)", baseDelAnillo: "rgba(18, 36, 49, .14)", etiqueta: "#445366", disco: "#122431", indice: "#9fb0bb", pista: "" },
  oscuro: { anillo: "rgba(255, 255, 255, .07)", baseDelAnillo: "rgba(255, 255, 255, .06)", etiqueta: "#b7b7c2", disco: "#08080a", indice: "#858592", pista: "rgba(255, 255, 255, .035)" },
};

/**
 * El ancho aproximado de un texto. Sin medirlo en el navegador, para que el
 * dibujo sea el mismo en el servidor y en el cliente: solo sirve para el
 * ancho de las píldoras y para que ninguna etiqueta se salga del lienzo.
 */
function anchoDeTexto(texto: string, tamano: number, cifras = false) {
  let unidades = 0;
  for (const letra of texto) {
    if (cifras || /[0-9]/.test(letra)) unidades += 0.6;
    else if (/[ilIj.,'|:;!]/.test(letra)) unidades += 0.28;
    else if (/[mwMW%]/.test(letra)) unidades += 0.85;
    else if (letra === " ") unidades += 0.28;
    else if (/[A-ZÁÉÍÓÚÑ]/.test(letra)) unidades += 0.66;
    else unidades += 0.54;
  }
  return unidades * tamano;
}

const punto = (cx: number, cy: number, radio: number, angulo: number) => [cx + Math.cos(angulo) * radio, cy + Math.sin(angulo) * radio] as const;

/** Una porción entre dos radios y dos ángulos (el anillo de una cuña). */
function porcion(cx: number, cy: number, interior: number, exterior: number, desde: number, hasta: number) {
  const [x0, y0] = punto(cx, cy, interior, desde);
  const [x1, y1] = punto(cx, cy, exterior, desde);
  const [x2, y2] = punto(cx, cy, exterior, hasta);
  const [x3, y3] = punto(cx, cy, interior, hasta);
  const grande = hasta - desde > Math.PI ? 1 : 0;
  return `M${x0} ${y0}L${x1} ${y1}A${exterior} ${exterior} 0 ${grande} 1 ${x2} ${y2}L${x3} ${y3}A${interior} ${interior} 0 ${grande} 0 ${x0} ${y0}Z`;
}

function arco(cx: number, cy: number, radio: number, desde: number, hasta: number) {
  const [x0, y0] = punto(cx, cy, radio, desde);
  const [x1, y1] = punto(cx, cy, radio, hasta);
  return `M${x0} ${y0}A${radio} ${radio} 0 ${hasta - desde > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
}

export function PizzaRadar({ metrics, score, cohort, lang = "es", colorMode = "groups", oscuro = false }: { metrics: RadarMetric[]; score: number; cohort: string; lang?: Lang; colorMode?: "groups" | "platform"; oscuro?: boolean }) {
  const id = useId().replace(/:/g, "");
  void lang; // el idioma llega por t(): basta con que cambie para volver a dibujar.
  if (!metrics.length) return null;
  const tinta = oscuro ? TINTAS.oscuro : TINTAS.claro;
  const size = SIZE;
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
  // La ficha ya entrega las métricas por proveedor y, dentro, por categoría.
  // Al colorear por plataforma se asegura el orden por fuente para radares
  // que llegan de otro sitio, y cada color sigue ocupando un solo arco.
  const ordered = colorMode !== "platform" ? metrics : [...metrics].sort((a, b) => (
    METRIC_SOURCE_ORDER.indexOf(a.source ?? "wyscout") - METRIC_SOURCE_ORDER.indexOf(b.source ?? "wyscout")
  ));
  const step = Math.PI * 2 / ordered.length;
  // En modo plataforma cada métrica toma el color de su fuente; en modo
  // grupo, el de su bloque. Las de SkillCorner llevan siempre el verde de la
  // marca, en ambos modos, para que se lean como una fuente aparte.
  const metricGroups = ordered.map((metric) => {
    if (metric.source === "skillcorner") return { id: "skillcorner", color: METRIC_SOURCE_COLORS.skillcorner.color };
    if (colorMode === "platform") {
      const source = metric.source ?? "wyscout";
      const brand = METRIC_SOURCE_COLORS[source] ?? METRIC_SOURCE_COLORS.wyscout;
      return { id: source, color: brand.color };
    }
    return similarityMetricGroup(metric, cohort);
  });

  const groupRingRadius = outer + size * 0.019;
  const groupRingWidth = Math.max(6, size * 0.012);
  const groupGap = Math.min(0.045, step * 0.12);
  // Las de SkillCorner van como porciones "salidas" del radar (desplazadas
  // hacia afuera sobre su bisectriz) para marcar que vienen de otra fuente.
  const explodeOffset = (metric: RadarMetric) => (metric.source === "skillcorner" ? size * 0.03 : 0);

  const arcosDeGrupo: Array<{ desde: number; hasta: number; radio: number; color: string }> = [];
  let groupStart = 0;
  for (let index = 1; index <= ordered.length; index += 1) {
    if (index < ordered.length && metricGroups[index].id === metricGroups[groupStart].id) continue;
    arcosDeGrupo.push({
      desde: -Math.PI / 2 + groupStart * step + groupGap,
      hasta: -Math.PI / 2 + index * step - groupGap,
      radio: groupRingRadius + explodeOffset(ordered[groupStart]),
      color: metricGroups[groupStart].color,
    });
    groupStart = index;
  }

  const valueFontSize = Math.max(9, size * [0.019, 0.016, 0.0135][density]);
  const labelFontSize = Math.max(8, size * [0.017, 0.0145, 0.012][density]);
  const familia = oscuro ? "inherit" : "Arial, sans-serif";

  return (
    <svg className="pizza-radar" viewBox={`0 0 ${size} ${size}`} role="img" fontFamily={familia}
      aria-label={tf("Radar de percentiles con índice global {s} de 100", { s: score })}>
      <defs>
        {ordered.map((metric, index) => {
          const middle = -Math.PI / 2 + index * step + step / 2;
          const explode = explodeOffset(metric);
          const [ex, ey] = punto(cx, cy, explode, middle);
          // De oscuro a claro a lo largo de TODA la pista (no de la cuña): así
          // el tono dice el percentil, y una cuña corta se queda apagada.
          const { bajo, alto } = tonosDe(metricGroups[index].color);
          return <radialGradient key={metric.key} id={`${id}-g${index}`} gradientUnits="userSpaceOnUse" cx={ex} cy={ey} r={outer} fx={ex} fy={ey}>
            <stop offset={inner / outer} stopColor={bajo} />
            <stop offset={(inner + 0.55 * (outer - inner)) / outer} stopColor={metricGroups[index].color} />
            <stop offset={1} stopColor={alto} />
          </radialGradient>;
        })}
      </defs>

      {[0.25, 0.5, 0.75, 1].map((fraction) => <circle key={fraction} cx={cx} cy={cy} r={outer * fraction} fill="none" stroke={tinta.anillo} strokeWidth={1} />)}
      <circle cx={cx} cy={cy} r={groupRingRadius} fill="none" stroke={tinta.baseDelAnillo} strokeWidth={groupRingWidth + Math.max(3, size * 0.005)} />
      {arcosDeGrupo.map((a, i) => <path key={i} d={arco(cx, cy, a.radio, a.desde, a.hasta)} fill="none" stroke={a.color} strokeWidth={groupRingWidth} strokeLinecap="round" />)}

      {ordered.map((metric, index) => {
        const start = -Math.PI / 2 + index * step + gap;
        const end = -Math.PI / 2 + (index + 1) * step - gap;
        const middle = start + step / 2 - gap;
        const explode = explodeOffset(metric);
        const [ex, ey] = punto(cx, cy, explode, middle);
        const radius = Math.max(inner + 8, outer * Math.max(0.08, metric.percentile / 100));

        // La píldora va SIEMPRE, también en los percentiles bajos: un 8 y un
        // 84 son la misma clase de dato y se leen igual. Dónde se posa lo
        // decide sitioDelValor(), que la empuja hacia afuera cuando el anillo
        // de los valores bajos se queda estrecho.
        const value = String(metric.percentile);
        const pillHeight = valueFontSize * 1.55;
        const pillWidth = Math.max(pillHeight, anchoDeTexto(value, valueFontSize, true) + valueFontSize * 0.62);
        const { radio: valueRadius } = sitioDelValor({
          radioInterior: inner, radioExterior: outer, radioDePorcion: radius,
          anguloPorPorcion: step, anchoPildora: pillWidth, altoPildora: pillHeight,
        });
        const [valueX, valueY] = punto(ex, ey, valueRadius, middle);

        // Las etiquetas de porciones salidas se empujan solo una fracción del
        // desplazamiento para no chocar con el borde.
        const labelRadius = outer + size * [0.065, 0.075, 0.08][density] + explode * 0.4;
        const [lx, ly] = punto(cx, cy, labelRadius, middle);
        const ancla = Math.cos(middle) > 0.18 ? "start" : Math.cos(middle) < -0.18 ? "end" : "middle";
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
        // El ancla se sujeta dentro del dibujo según el ancho del texto, para
        // que ninguna etiqueta (sobre todo las de porciones salidas) se corte.
        const maxLineWidth = Math.max(...lines.map((line) => anchoDeTexto(line, labelFontSize)));
        let anchorX = lx;
        if (ancla === "end") anchorX = Math.max(anchorX, maxLineWidth + 2);
        else if (ancla === "start") anchorX = Math.min(anchorX, size - maxLineWidth - 2);
        else anchorX = Math.min(Math.max(anchorX, maxLineWidth / 2 + 2), size - maxLineWidth / 2 - 2);

        return <g key={metric.key}>
          {/* La pista entera de la cuña, tenue: deja ver cuánto le falta al percentil. */}
          {tinta.pista && <path d={porcion(ex, ey, inner, outer, start, end)} fill={tinta.pista} />}
          {/* Opacos, la cuña y la píldora: con transparencias, el visor de PDF las
              aplanaba en un cuadradito alrededor de cada píldora. */}
          <path d={porcion(ex, ey, inner, radius, start, end)} fill={`url(#${id}-g${index})`} />
          <rect x={valueX - pillWidth / 2} y={valueY - pillHeight / 2} width={pillWidth} height={pillHeight} rx={pillHeight / 2}
            fill="#0b131b" stroke="#8e9399" strokeWidth={Math.max(1, size * 0.0018)} />
          <text x={valueX} y={valueY + valueFontSize * 0.02} textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize={valueFontSize} fontWeight={800}>{value}</text>
          <text x={anchorX} y={ly + labelOffset} textAnchor={ancla} dominantBaseline="central" fill={tinta.etiqueta} fontSize={labelFontSize} fontWeight={600}>
            {lines.map((line, lineIndex) => <tspan key={lineIndex} x={anchorX} dy={lineIndex ? lineHeight : 0}>{line}</tspan>)}
          </text>
        </g>;
      })}

      <circle cx={cx} cy={cy} r={inner - 2} fill={tinta.disco} />
      <text x={cx} y={cy - size * 0.008} textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize={size * 0.042} fontWeight={800}>{score}</text>
      <text x={cx} y={cy + size * 0.032} textAnchor="middle" dominantBaseline="central" fill={tinta.indice} fontSize={size * 0.013} fontWeight={700}>{t("ÍNDICE")}</text>
    </svg>
  );
}
