"use client";

import type { CSSProperties } from "react";
import { t } from "@/lib/i18n";
import { METRIC_SOURCE_COLORS } from "@/lib/similarityMetricGroups";

/**
 * Gráficos de la página de contexto, en el lenguaje de skillcornerviz pero en
 * SVG propio: sin dependencias y con la tipografía del informe.
 *
 * - Swarm: toda la población de la posición como puntos, con el jugador
 *   marcado. Un percentil no dice si el 80 está en un pelotón apretado o
 *   destacado; la distribución sí.
 * - Cuadrantes: dos métricas cruzadas, con las medianas como ejes. Sitúa el
 *   perfil (volumen contra eficacia) de un vistazo.
 */

const VERDE = "#12c48b";
const TENUE = "rgba(234, 242, 240, .26)";
const TEXTO = "#8fa3a0";

function mediana(values: number[]) {
  if (!values.length) return Number.NaN;
  const orden = [...values].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

export type PuntoSwarm = { valor: number; nombre?: string; esObjetivo?: boolean; esCompanero?: boolean };

export function SwarmMetric({ etiqueta, puntos, unidad = "", percentil, fuente = "wyscout" }: { etiqueta: string; puntos: PuntoSwarm[]; unidad?: string; percentil?: number; fuente?: string }) {
  const acento = METRIC_SOURCE_COLORS[fuente]?.color ?? VERDE;
  const valores = puntos.map((punto) => punto.valor).filter(Number.isFinite);
  if (valores.length < 4) return null;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = max - min || 1;
  const ANCHO = 360;
  const ALTO = 46;
  const x = (valor: number) => 6 + ((valor - min) / rango) * (ANCHO - 12);

  // Dispersión vertical determinista: mismo dato, mismo dibujo en cada render
  // y en la exportación. Un jitter aleatorio cambiaría el PDF cada vez.
  const desplazamiento = (index: number) => ((index * 37) % 11) - 5;
  const objetivo = puntos.find((punto) => punto.esObjetivo);
  const med = mediana(valores);

  return <figure className="ctx-swarm">
    <figcaption>
      <span>{etiqueta}</span>
      {percentil !== undefined && <b style={{ color: acento }}>P{percentil}</b>}
    </figcaption>
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label={etiqueta}>
      <line x1="6" y1={ALTO / 2} x2={ANCHO - 6} y2={ALTO / 2} stroke="rgba(255,255,255,.08)" strokeWidth="1" />
      {Number.isFinite(med) && <line x1={x(med)} y1="8" x2={x(med)} y2={ALTO - 14} stroke="rgba(255,255,255,.22)" strokeWidth="1" strokeDasharray="3 3" />}
      {puntos.map((punto, index) => {
        if (!Number.isFinite(punto.valor) || punto.esObjetivo) return null;
        return <circle key={index} className="ctx-dot" cx={x(punto.valor)} cy={ALTO / 2 + desplazamiento(index)} r={punto.esCompanero ? 3 : 2.4}
          fill={punto.esCompanero ? "rgba(244, 201, 93, .75)" : TENUE}>
          <title>{`${punto.nombre ?? ""} · ${punto.valor.toFixed(2)}`}</title>
        </circle>;
      })}
      {objetivo && Number.isFinite(objetivo.valor) && <>
        <circle cx={x(objetivo.valor)} cy={ALTO / 2} r="6.5" fill={acento} stroke="#0d1a1f" strokeWidth="1.5" />
        <text x={x(objetivo.valor)} y={ALTO - 3} textAnchor="middle" fill={acento} fontSize="8.5" fontWeight="700">
          {objetivo.valor.toFixed(objetivo.valor >= 10 ? 0 : 2)}{unidad}
        </text>
      </>}
    </svg>
  </figure>;
}

export type PuntoCuadrante = { x: number; y: number; nombre: string; esObjetivo?: boolean; esCompanero?: boolean };

export function CuadranteMetricas({ titulo, ejeX, ejeY, puntos }: { titulo: string; ejeX: string; ejeY: string; puntos: PuntoCuadrante[] }) {
  const validos = puntos.filter((punto) => Number.isFinite(punto.x) && Number.isFinite(punto.y));
  if (validos.length < 6) return null;
  const xs = validos.map((punto) => punto.x);
  const ys = validos.map((punto) => punto.y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const rangoX = maxX - minX || 1; const rangoY = maxY - minY || 1;
  const W = 330; const H = 240; const M = 26;
  const px = (valor: number) => M + ((valor - minX) / rangoX) * (W - M * 2);
  const py = (valor: number) => H - M - ((valor - minY) / rangoY) * (H - M * 2);
  const medX = mediana(xs); const medY = mediana(ys);
  const objetivo = validos.find((punto) => punto.esObjetivo);

  return <figure className="ctx-quadrant">
    <figcaption>{titulo}</figcaption>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titulo}>
      <line x1={px(medX)} y1={M - 8} x2={px(medX)} y2={H - M + 6} stroke="rgba(255,255,255,.16)" strokeDasharray="4 4" />
      <line x1={M - 8} y1={py(medY)} x2={W - M + 6} y2={py(medY)} stroke="rgba(255,255,255,.16)" strokeDasharray="4 4" />
      {validos.map((punto, index) => punto.esObjetivo ? null : (
        <circle key={index} className="ctx-dot" cx={px(punto.x)} cy={py(punto.y)} r={punto.esCompanero ? 3.4 : 2.6}
          fill={punto.esCompanero ? "rgba(244, 201, 93, .8)" : TENUE}>
          {/* Etiqueta nativa al pasar el ratón: sin JavaScript, y no estorba al exportar. */}
          <title>{`${punto.nombre} · ${ejeX} ${punto.x.toFixed(2)} · ${ejeY} ${punto.y.toFixed(2)}`}</title>
        </circle>
      ))}
      {objetivo && <>
        <circle cx={px(objetivo.x)} cy={py(objetivo.y)} r="7" fill={VERDE} stroke="#0d1a1f" strokeWidth="1.6">
          <title>{`${objetivo.nombre} · ${ejeX} ${objetivo.x.toFixed(2)} · ${ejeY} ${objetivo.y.toFixed(2)}`}</title>
        </circle>
        <text x={px(objetivo.x)} y={py(objetivo.y) - 11} textAnchor="middle" fill={VERDE} fontSize="9" fontWeight="700">
          {objetivo.nombre.split(" ").slice(-1)[0]}
        </text>
      </>}
      <text x={W / 2} y={H - 4} textAnchor="middle" fill={TEXTO} fontSize="8" letterSpacing="1">{ejeX.toUpperCase()}</text>
      <text x="9" y={H / 2} textAnchor="middle" fill={TEXTO} fontSize="8" letterSpacing="1" transform={`rotate(-90 9 ${H / 2})`}>{ejeY.toUpperCase()}</text>
    </svg>
  </figure>;
}

export function LeyendaGraficos({ equipo }: { equipo: string }) {
  return <div className="ctx-chart-legend" style={{ "--ctx-green": VERDE } as CSSProperties}>
    <span><i className="objetivo" />{t("Jugador")}</span>
    <span><i className="companero" />{equipo}</span>
    <span><i className="resto" />{t("Su posición en la base")}</span>
    <span><i className="mediana" />{t("Mediana")}</span>
  </div>;
}

export type BarraRank = { nombre: string; valor: number; esObjetivo?: boolean; esCompanero?: boolean };

/** Barras rankeadas (artículo 1 y 3): el top de la liga con el jugador dentro. */
export function BarrasRanking({ titulo, unidad = "", barras, top = 12 }: { titulo: string; unidad?: string; barras: BarraRank[]; top?: number }) {
  const validas = barras.filter((barra) => Number.isFinite(barra.valor)).sort((a, b) => b.valor - a.valor);
  if (validas.length < 4) return null;
  const objetivo = validas.find((barra) => barra.esObjetivo);
  const puesto = objetivo ? validas.indexOf(objetivo) + 1 : 0;
  // Si el jugador no entra en el top se le añade al final, para que la barra
  // siempre esté: el gráfico existe para situarlo a él, no para lucir un top.
  const visibles = validas.slice(0, top);
  if (objetivo && !visibles.includes(objetivo)) visibles[visibles.length - 1] = objetivo;
  const maximo = Math.max(...visibles.map((barra) => barra.valor), 0.0001);
  return <figure className="ctx-rank">
    <figcaption>{titulo}{objetivo ? ` · ${puesto}/${validas.length}` : ""}</figcaption>
    <div className="ctx-rank-rows">
      {visibles.map((barra, index) => (
        <div key={`${barra.nombre}-${index}`} className={`ctx-rank-row${barra.esObjetivo ? " objetivo" : barra.esCompanero ? " companero" : ""}`}>
          <span title={barra.nombre}>{barra.nombre}</span>
          <i><em style={{ width: `${Math.max(2, (barra.valor / maximo) * 100)}%` }} /></i>
          <b>{barra.valor.toFixed(barra.valor >= 10 ? 0 : 2)}{unidad}</b>
        </div>
      ))}
    </div>
  </figure>;
}

export type BarraZ = { etiqueta: string; z: number };

/** Barras divergentes de z-score (artículo 2): sobre y bajo la media de su posición. */
export function BarrasZ({ titulo, barras }: { titulo: string; barras: BarraZ[] }) {
  const validas = barras.filter((barra) => Number.isFinite(barra.z));
  if (!validas.length) return null;
  const tope = Math.max(2, ...validas.map((barra) => Math.abs(barra.z)));
  return <figure className="ctx-z">
    <figcaption>{titulo}</figcaption>
    <div className="ctx-z-rows">
      {validas.map((barra) => {
        const ancho = (Math.abs(barra.z) / tope) * 50;
        const positivo = barra.z >= 0;
        return <div key={barra.etiqueta} className="ctx-z-row">
          <span title={barra.etiqueta}>{barra.etiqueta}</span>
          <i>
            <u />
            <em className={positivo ? "pos" : "neg"} style={positivo ? { left: "50%", width: `${ancho}%` } : { right: "50%", width: `${ancho}%` }} />
          </i>
          <b className={positivo ? "pos" : "neg"}>{barra.z > 0 ? "+" : ""}{barra.z.toFixed(2)}</b>
        </div>;
      })}
    </div>
  </figure>;
}
