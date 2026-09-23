"use client";

import { FAMILIAS, METRICAS_ESTILO, type FamiliaEstilo, type PerfilEquipo } from "@/lib/estiloEquipo";
import { t, tf } from "@/lib/i18n";

/**
 * La rosa de estilo: una cuña por métrica, agrupadas por familia.
 *
 * Es la misma lectura que el radar de la página 7 del dossier, pero dibujada
 * en SVG y no en canvas: la hoja se imprime, y un vector sale nítido en el
 * PDF a cualquier tamaño. El largo de cada cuña es el percentil contra el
 * grupo de referencia; el anillo discontinuo es la mediana. El segundo equipo,
 * si lo hay, va encima como contorno, para que las dos formas se lean a la vez
 * sin taparse.
 */

export const COLOR_FAMILIA: Record<FamiliaEstilo, string> = {
  construccion: "#3b7dd8",
  circulacion: "#2f9e62",
  ataque: "#e08a2e",
  defensa: "#d0503f",
  movimiento: "#7b61d1",
  presion: "#1f9aa6",
};

const LADO = 560;
const CENTRO = LADO / 2;
const R_DENTRO = 34;
const R_FUERA = 196;

const radio = (percentil: number) => R_DENTRO + (R_FUERA - R_DENTRO) * Math.max(0, Math.min(100, percentil)) / 100;
const punto = (angulo: number, r: number) => [CENTRO + r * Math.sin(angulo), CENTRO - r * Math.cos(angulo)] as const;

/** Parte la etiqueta en dos líneas por el espacio más cercano a la mitad. */
function enDosLineas(texto: string): string[] {
  if (texto.length <= 18) return [texto];
  const mitad = texto.length / 2;
  let corte = -1;
  for (let i = 0; i < texto.length; i += 1) {
    if (texto[i] === " " && (corte < 0 || Math.abs(i - mitad) < Math.abs(corte - mitad))) corte = i;
  }
  return corte < 0 ? [texto] : [texto.slice(0, corte), texto.slice(corte + 1)];
}

export function RosaDeEstilo({ perfil, rival, fuente = "statsbomb" }: {
  perfil: PerfilEquipo;
  rival?: PerfilEquipo | null;
  /** Una rosa por proveedor: juntas serían 35 cuñas y no se leería ninguna. */
  fuente?: "statsbomb" | "skillcorner";
}) {
  const metricas = METRICAS_ESTILO.filter((metrica) => (metrica.fuente ?? "statsbomb") === fuente && perfil.valores[metrica.id]);
  // El contorno del rival solo si tiene dato en todas: con huecos, el
  // polígono se hundiría al centro donde no hay dato, que no es lo mismo que
  // un percentil cero.
  const rivalDibujable = rival && metricas.every((metrica) => rival.valores[metrica.id]) ? rival : null;
  const familias = FAMILIAS.filter((familia) => metricas.some((metrica) => metrica.familia === familia.id));
  const n = metricas.length;
  if (!n) return null;
  const paso = (Math.PI * 2) / n;
  const hueco = paso * 0.08;

  const cuña = (indice: number, percentil: number) => {
    const a0 = indice * paso + hueco, a1 = (indice + 1) * paso - hueco;
    const r = radio(percentil);
    const [x0, y0] = punto(a0, R_DENTRO), [x1, y1] = punto(a0, r), [x2, y2] = punto(a1, r), [x3, y3] = punto(a1, R_DENTRO);
    return `M${x0} ${y0}L${x1} ${y1}A${r} ${r} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${R_DENTRO} ${R_DENTRO} 0 0 0 ${x0} ${y0}Z`;
  };

  const contornoRival = rivalDibujable
    ? metricas.map((metrica, i) => punto((i + 0.5) * paso, radio(rivalDibujable.valores[metrica.id].percentil)).join(",")).join(" ")
    : "";

  return <svg className="rosa-estilo" viewBox="-110 -24 780 608" role="img"
    aria-label={rival ? tf("Estilo de {a} frente a {b}", { a: perfil.equipo, b: rival.equipo }) : tf("Estilo de {a}", { a: perfil.equipo })}>
    {[25, 50, 75, 100].map((p) => (
      <circle key={p} cx={CENTRO} cy={CENTRO} r={radio(p)} className={p === 50 ? "rosa-anillo mediana" : "rosa-anillo"} />
    ))}
    {metricas.map((_, i) => {
      const [x, y] = punto(i * paso, R_FUERA);
      return <line key={i} x1={CENTRO} y1={CENTRO} x2={x} y2={y} className="rosa-radio" />;
    })}

    {metricas.map((metrica, i) => {
      const valor = perfil.valores[metrica.id];
      return <path key={metrica.id} d={cuña(i, valor.percentil)} fill={COLOR_FAMILIA[metrica.familia]} className="rosa-cuna">
        <title>{`${t(metrica.etiqueta)} · P${valor.percentil} · z ${valor.z >= 0 ? "+" : ""}${valor.z.toFixed(2)}`}</title>
      </path>;
    })}

    {rivalDibujable && <polygon points={contornoRival} className="rosa-rival" />}

    {metricas.map((metrica, i) => {
      const angulo = (i + 0.5) * paso;
      const [x, y] = punto(angulo, R_FUERA + 16);
      const seno = Math.sin(angulo);
      // Solo va centrada la que cae justo arriba o abajo. Con 24 métricas la
      // primera y la última quedan a 7,5° a cada lado de las 12 y, centradas
      // las dos, se montaban una encima de la otra.
      const ancla = seno > 0.05 ? "start" : seno < -0.05 ? "end" : "middle";
      const lineas = enDosLineas(t(metrica.corta ?? metrica.etiqueta));
      const arriba = Math.cos(angulo) > 0.2;
      const desde = arriba ? y - (lineas.length - 1) * 11 : y + 4;
      return <text key={metrica.id} x={x} y={desde} textAnchor={ancla} className="rosa-etiqueta">
        {lineas.map((linea, k) => <tspan key={k} x={x} dy={k === 0 ? 0 : 11}>{linea}</tspan>)}
      </text>;
    })}

    <circle cx={CENTRO} cy={CENTRO} r={R_DENTRO - 4} className="rosa-centro" />
    {familias.map((familia, i) => (
      <g key={familia.id} transform={`translate(${-100 + i * 190}, 578)`}>
        <rect width="12" height="12" rx="3" fill={COLOR_FAMILIA[familia.id]} />
        <text x="18" y="10" className="rosa-leyenda">{t(familia.nombre)}</text>
      </g>
    ))}
  </svg>;
}
