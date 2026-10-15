"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import { tonosDe } from "@/lib/similarityMetricGroups";

/*
 * Las piezas del look Night (diseno-reportes-cavalry.json) que comparten las
 * páginas del informe: antetítulo, franja de cifras, chip de cambio, fila de
 * métrica con su barra y el césped de las canchas. Los colores salen de los
 * tokens de la plataforma, así que funcionan en oscuro y en claro.
 */

export type Tonos = { color: string; bajo: string; alto: string };

/** Los tres tonos de un color: los aprobados si es el de un conjunto, si no calculados. */
export const tonosDeColor = (color: string): Tonos => ({ color, ...tonosDe(color) });

/** Antetítulo en versalitas: el acento sobre su fondo, totalmente redondo. */
export function Antetitulo({ children }: { children: ReactNode }) {
  return <span className="n-antetitulo">{children}</span>;
}

/** Franja de estadísticas: columnas iguales separadas por filetes; etiqueta, cifra grande y bajada. */
export function FranjaDeCifras({ celdas, className = "" }: {
  celdas: Array<{ etiqueta: ReactNode; valor: ReactNode; bajada?: ReactNode }>;
  className?: string;
}) {
  return <div className={`n-franja ${className}`.trim()}>
    {celdas.map((celda, indice) => <div key={indice}>
      <span>{celda.etiqueta}</span>
      <b>{celda.valor}</b>
      {celda.bajada !== undefined && <small>{celda.bajada}</small>}
    </div>)}
  </div>;
}

/**
 * Chip de cambio. Por debajo del umbral, "igual" apagado; si no, triángulo y
 * cifra, en verde si el cambio es bueno y en rojo si es malo.
 */
export function ChipDeCambio({ cambio, umbral = 5, texto, igual = "igual", mejorSiBaja = false }: {
  cambio: number;
  umbral?: number;
  /** Lo que se escribe tras el triángulo; por defecto, el valor absoluto redondeado. */
  texto?: string;
  igual?: string;
  mejorSiBaja?: boolean;
}) {
  if (!Number.isFinite(cambio) || Math.abs(cambio) < umbral) return <span className="n-chip igual">{igual}</span>;
  const bueno = mejorSiBaja ? cambio < 0 : cambio > 0;
  return <span className={`n-chip ${bueno ? "bueno" : "malo"}`}>{cambio > 0 ? "▲" : "▼"} {texto ?? Math.round(Math.abs(cambio))}</span>;
}

/** Chip neutro, para una parte del total o un dato al margen. */
export function ChipNeutro({ children }: { children: ReactNode }) {
  return <span className="n-chip igual">{children}</span>;
}

/**
 * Barra con el degradado del conjunto a lo largo de TODA la pista, como el
 * radar: una barra corta se queda en el tono apagado y solo las largas llegan
 * al claro. La marca (0-100) es una rayita sobre un corte del color de la
 * tarjeta: la media, la temporada anterior o el otro jugador.
 */
export function BarraDegradada({ valor, tonos, marca, titulo }: { valor: number; tonos: Tonos; marca?: number | null; titulo?: string }) {
  const ancho = Math.max(2, Math.min(100, Number.isFinite(valor) ? valor : 0));
  return <i className="n-barra" title={titulo}>
    <em style={{ "--n-c": tonos.color, "--n-lo": tonos.bajo, "--n-hi": tonos.alto, width: `${ancho}%`, backgroundSize: `${10000 / ancho}% 100%` } as CSSProperties} />
    {marca !== undefined && marca !== null && Number.isFinite(marca) && <u style={{ left: `${Math.max(0, Math.min(100, marca))}%` }} />}
  </i>;
}

/** Fila de métrica: etiqueta a la izquierda, cifra y chip a la derecha, la barra debajo. */
export function FilaDeMetrica({ etiqueta, cifra, detalle, chip, valor, tonos, marca, onClick, activa = false }: {
  etiqueta: ReactNode;
  cifra: ReactNode;
  detalle?: ReactNode;
  chip?: ReactNode;
  valor: number;
  tonos: Tonos;
  marca?: number | null;
  onClick?: () => void;
  activa?: boolean;
}) {
  const contenido = <>
    <div>
      <span className="n-fila-etiqueta">{etiqueta}</span>
      <span className="n-fila-cifra">{cifra}{detalle !== undefined && <small>{detalle}</small>}</span>
      {chip}
    </div>
    <BarraDegradada valor={valor} tonos={tonos} marca={marca} />
  </>;
  return onClick
    ? <button type="button" className={`n-fila clicable${activa ? " activa" : ""}`} onClick={onClick}>{contenido}</button>
    : <div className="n-fila">{contenido}</div>;
}

/**
 * Césped de las canchas grandes: panel verde pino con franjas de corte y una
 * luz central muy tenue. Va debajo de las líneas de cal de cada cancha.
 * `vertical`: franjas a lo ancho (la cancha sube por la pantalla).
 */
export function Cesped({ x = 0, y = 0, ancho, largo, vertical = true, franja = 10, radio = 2 }: {
  x?: number; y?: number; ancho: number; largo: number; vertical?: boolean; franja?: number; radio?: number;
}) {
  const id = useId().replace(/:/g, "");
  const bandas: ReactNode[] = [];
  const total = vertical ? largo : ancho;
  for (let i = 0, n = 0; i < total; i += franja, n += 1) {
    if (n % 2) continue;
    bandas.push(vertical
      ? <rect key={i} x={x} y={y + i} width={ancho} height={Math.min(franja, total - i)} fill="#12332A" />
      : <rect key={i} x={x + i} y={y} width={Math.min(franja, total - i)} height={largo} fill="#12332A" />);
  }
  return <g className="n-cesped">
    <defs>
      <clipPath id={`cesped-${id}`}><rect x={x} y={y} width={ancho} height={largo} rx={radio} /></clipPath>
      <radialGradient id={`luz-${id}`} cx="50%" cy="50%" r="75%">
        <stop offset="0" stopColor="#fff" stopOpacity={0.055} />
        <stop offset="1" stopColor="#fff" stopOpacity={0} />
      </radialGradient>
    </defs>
    <g clipPath={`url(#cesped-${id})`}>
      <rect x={x} y={y} width={ancho} height={largo} fill="#0E2A1F" />
      {bandas}
      <rect x={x} y={y} width={ancho} height={largo} fill={`url(#luz-${id})`} />
    </g>
  </g>;
}

/** Las líneas de cal sobre el césped. */
export const CAL = { fill: "none", stroke: "rgba(230, 240, 234, .4)", strokeWidth: 0.4 } as const;

/**
 * Una cometa: la carrera o el pase como un triángulo fino que engorda hacia
 * donde termina, así la dirección se lee sin flecha.
 */
export function Cometa({ x1, y1, x2, y2, ancho, color, opacidad = 1 }: {
  x1: number; y1: number; x2: number; y2: number; ancho: number; color: string; opacidad?: number;
}) {
  const largo = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = (-(y2 - y1) / largo) * (ancho / 2);
  const ny = ((x2 - x1) / largo) * (ancho / 2);
  return <path d={`M${x1} ${y1}L${x2 + nx} ${y2 + ny}Q${x2 + (x2 - x1) / largo * ancho * 0.6} ${y2 + (y2 - y1) / largo * ancho * 0.6} ${x2 - nx} ${y2 - ny}Z`} fill={color} opacity={opacidad} />;
}
