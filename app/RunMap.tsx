"use client";

import { useMemo } from "react";
import { t, tf } from "@/lib/i18n";
import type { CarreraSinBalon } from "@/lib/remoteData";

/**
 * Mapa de carreras sin balón, al modo del artículo "Open Data #4" de
 * SkillCorner: una flecha por carrera, del punto de inicio al de fin.
 *
 * Se replican sus tres decisiones de lectura, que son las que hacen que el
 * gráfico se entienda de un vistazo:
 *  · el color marca la intensidad (sprint y alta velocidad destacan sobre el
 *    resto), no el tipo de carrera: lo que importa es dónde aprieta;
 *  · un círculo en la punta señala que la carrera terminó en recepción;
 *  · la cancha es vertical y el ataque va siempre hacia arriba, así que dos
 *    jugadores de bandas distintas se comparan sin voltear la cabeza.
 *
 * SkillCorner entrega las coordenadas ya normalizadas al sentido de ataque
 * (x creciente = hacia la portería rival) en metros, con el centro del campo
 * en el origen: x ∈ [-52.5, 52.5], y ∈ [-34, 34].
 */

const LARGO = 105;
const ANCHO = 68;
const MARGEN = 3;

/** Cancha vertical: el eje largo de SkillCorner (x) sube por la pantalla. */
const VB_W = ANCHO + MARGEN * 2;
const VB_H = LARGO + MARGEN * 2;

const proyectar = (x: number, y: number) => ({
  cx: MARGEN + (ANCHO / 2 - y),
  cy: MARGEN + (LARGO / 2 - x),
});

const COLOR_BANDA: Record<string, string> = {
  sprinting: "#12c48b",
  hsr: "#7fe0b8",
};
const COLOR_BASE = "rgba(255,255,255,.28)";

/** Los diez tipos de carrera de SkillCorner, con su nombre corto en español. */
export const TIPOS_CARRERA: Record<string, string> = {
  behind: "A la espalda",
  run_ahead_of_the_ball: "Por delante del balón",
  support: "Apoyo",
  coming_short: "Al pie",
  cross_receiver: "Remate de centro",
  dropping_off: "Descuelgue",
  pulling_wide: "Abriendo a banda",
  pulling_half_space: "Al carril interior",
  overlap: "Desdoble por fuera",
  underlap: "Desdoble por dentro",
};

function Cancha() {
  const linea = { fill: "none", stroke: "rgba(255,255,255,.3)", strokeWidth: 0.4 };
  const areaGrande = { x: MARGEN + (ANCHO - 40.3) / 2, ancho: 40.3, alto: 16.5 };
  const areaChica = { x: MARGEN + (ANCHO - 18.3) / 2, ancho: 18.3, alto: 5.5 };
  return <g>
    <rect x={MARGEN} y={MARGEN} width={ANCHO} height={LARGO} rx={0.5} {...linea} />
    <line x1={MARGEN} y1={MARGEN + LARGO / 2} x2={MARGEN + ANCHO} y2={MARGEN + LARGO / 2} {...linea} />
    <circle cx={MARGEN + ANCHO / 2} cy={MARGEN + LARGO / 2} r={9.15} {...linea} />
    {/* Portería rival arriba: es a donde apuntan todas las carreras. */}
    <rect x={areaGrande.x} y={MARGEN} width={areaGrande.ancho} height={areaGrande.alto} {...linea} />
    <rect x={areaChica.x} y={MARGEN} width={areaChica.ancho} height={areaChica.alto} {...linea} />
    <rect x={areaGrande.x} y={MARGEN + LARGO - areaGrande.alto} width={areaGrande.ancho} height={areaGrande.alto} {...linea} />
    <rect x={areaChica.x} y={MARGEN + LARGO - areaChica.alto} width={areaChica.ancho} height={areaChica.alto} {...linea} />
  </g>;
}

export function RunMap({ carreras, titulo, subtitulo }: {
  carreras: CarreraSinBalon[];
  titulo: string;
  subtitulo?: string;
}) {
  const dibujables = useMemo(() => carreras.filter((carrera) => (
    carrera.x_start !== null && carrera.y_start !== null
    && carrera.x_end !== null && carrera.y_end !== null
  )), [carreras]);

  if (!dibujables.length) {
    return <figure className="run-map">
      <figcaption><b>{titulo}</b>{subtitulo && <small>{subtitulo}</small>}</figcaption>
      <p className="run-map-vacio">{t("Ninguna carrera con coordenadas para este filtro.")}</p>
    </figure>;
  }

  // Las intensas se pintan al final para que ninguna quede tapada por el
  // grueso de carreras a ritmo de trote, que son la mayoría.
  const ordenadas = [...dibujables].sort((a, b) => Number(Boolean(COLOR_BANDA[a.speed_avg_band])) - Number(Boolean(COLOR_BANDA[b.speed_avg_band])));
  const intensas = dibujables.filter((carrera) => COLOR_BANDA[carrera.speed_avg_band]).length;
  const recibidas = dibujables.filter((carrera) => carrera.received).length;

  return <figure className="run-map">
    <figcaption><b>{titulo}</b>{subtitulo && <small>{subtitulo}</small>}</figcaption>
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} role="img" aria-label={titulo}>
      <Cancha />
      {ordenadas.map((carrera, indice) => {
        const inicio = proyectar(carrera.x_start as number, carrera.y_start as number);
        const fin = proyectar(carrera.x_end as number, carrera.y_end as number);
        const color = COLOR_BANDA[carrera.speed_avg_band] ?? COLOR_BASE;
        const intensa = Boolean(COLOR_BANDA[carrera.speed_avg_band]);
        return <g key={indice} opacity={intensa ? 0.95 : 0.5}>
          <line
            x1={inicio.cx} y1={inicio.cy} x2={fin.cx} y2={fin.cy}
            stroke={color} strokeWidth={intensa ? 0.5 : 0.32} strokeLinecap="round"
          />
          {/* La punta va en el final del recorrido: dice hacia dónde ataca. */}
          <circle cx={fin.cx} cy={fin.cy} r={intensa ? 0.75 : 0.5} fill={color} />
          {carrera.received && <circle cx={fin.cx} cy={fin.cy} r={1.15} fill="none" stroke="#fff" strokeWidth={0.32} />}
        </g>;
      })}
    </svg>
    <div className="run-map-legend">
      <span><i style={{ background: COLOR_BANDA.sprinting }} />{t("Sprint (+25 km/h)")}</span>
      <span><i style={{ background: COLOR_BANDA.hsr }} />{t("Alta velocidad (20-25)")}</span>
      <span><i style={{ background: COLOR_BASE }} />{t("Ritmo de carrera")}</span>
      <span><i className="run-map-recibida" />{t("Termina en recepción")}</span>
    </div>
    <small className="run-map-total">
      {tf("{n} carreras · {i} de alta intensidad · {r} terminan en recepción", {
        n: dibujables.length, i: intensas, r: recibidas,
      })}
    </small>
  </figure>;
}

/** Reparto por tipo de carrera: el perfil de movimiento en una sola barra. */
export function RepartoCarreras({ carreras }: { carreras: CarreraSinBalon[] }) {
  const reparto = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const carrera of carreras) {
      const tipo = carrera.event_subtype || "otro";
      cuenta.set(tipo, (cuenta.get(tipo) ?? 0) + 1);
    }
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  }, [carreras]);

  if (!reparto.length) return null;
  const total = reparto.reduce((suma, [, valor]) => suma + valor, 0);

  return <div className="run-mix">
    {reparto.map(([tipo, valor]) => (
      <div key={tipo} className="run-mix-row">
        <span>{t(TIPOS_CARRERA[tipo] ?? tipo)}</span>
        <i><em style={{ width: `${Math.max(1, (valor / reparto[0][1]) * 100)}%` }} /></i>
        <b>{valor}<small>{Math.round((valor / total) * 100)}%</small></b>
      </div>
    ))}
  </div>;
}
