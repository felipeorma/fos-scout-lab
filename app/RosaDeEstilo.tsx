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
/** Hasta aquí caben las etiquetas horizontales; con más cuñas se montan arriba y abajo. */
const MAX_HORIZONTALES = 26;

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

/**
 * Una sola rosa con los dos proveedores: StatsBomb primero y, si el equipo
 * tiene datos de SkillCorner, sus cuñas a continuación (movimiento y presión
 * sin balón). La leyenda dice qué familias vienen de SkillCorner.
 */
export function RosaDeEstilo({ perfil, rival }: {
  perfil: PerfilEquipo;
  rival?: PerfilEquipo | null;
}) {
  const metricas = METRICAS_ESTILO.filter((metrica) => perfil.valores[metrica.id]);
  const familias = FAMILIAS.filter((familia) => metricas.some((metrica) => metrica.familia === familia.id));
  const n = metricas.length;
  if (!n) return null;
  const paso = (Math.PI * 2) / n;
  const hueco = paso * 0.08;
  const radiales = n > MAX_HORIZONTALES;

  const cuña = (indice: number, percentil: number) => {
    const a0 = indice * paso + hueco, a1 = (indice + 1) * paso - hueco;
    const r = radio(percentil);
    const [x0, y0] = punto(a0, R_DENTRO), [x1, y1] = punto(a0, r), [x2, y2] = punto(a1, r), [x3, y3] = punto(a1, R_DENTRO);
    return `M${x0} ${y0}L${x1} ${y1}A${r} ${r} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${R_DENTRO} ${R_DENTRO} 0 0 0 ${x0} ${y0}Z`;
  };
  const arco = (a0: number, a1: number, r: number) => {
    const [x0, y0] = punto(a0, r), [x1, y1] = punto(a1, r);
    return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
  };

  // El rival va como una marca en cada cuña donde tiene dato, no como un
  // polígono: si le falta SkillCorner, esas cuñas quedan sin marca en vez de
  // hundir el contorno al centro, que parecería un percentil cero.
  const marcasRival = rival
    ? metricas.map((metrica, i) => {
      const valor = rival.valores[metrica.id];
      return valor ? arco(i * paso + hueco, (i + 1) * paso - hueco, radio(valor.percentil)) : "";
    }).filter(Boolean).join("")
    : "";

  // Con etiquetas radiales hace falta sitio alrededor para las más largas.
  // La leyenda de familias va debajo, en filas de tres o cuatro.
  const porFila = radiales ? 3 : 4;
  const filasLeyenda = Math.ceil(familias.length / porFila);
  const margen = 172;
  const caja = radiales
    ? { x: CENTRO - R_FUERA - margen, y: CENTRO - R_FUERA - margen, ancho: (R_FUERA + margen) * 2, alto: (R_FUERA + margen) * 2 + filasLeyenda * 24 }
    : { x: -110, y: -24, ancho: 780, alto: 584 + filasLeyenda * 24 };
  const yLeyenda = radiales ? CENTRO + R_FUERA + margen : 566;
  const anchoLeyenda = (caja.ancho - 32) / porFila;

  return <svg className="rosa-estilo" viewBox={`${caja.x} ${caja.y} ${caja.ancho} ${caja.alto}`} role="img"
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

    {marcasRival && <path d={marcasRival} className="rosa-rival" />}


    {metricas.map((metrica, i) => {
      const angulo = (i + 0.5) * paso;
      const texto = t(metrica.corta ?? metrica.etiqueta);
      if (radiales) {
        // A lo largo del radio, siempre legible de izquierda a derecha: en la
        // mitad izquierda se gira media vuelta y se ancla por el final.
        const [x, y] = punto(angulo, R_FUERA + 14);
        const grados = (angulo * 180) / Math.PI;
        const derecha = angulo < Math.PI;
        return <text key={metrica.id} x={x} y={y} dy="0.35em" textAnchor={derecha ? "start" : "end"}
          transform={`rotate(${derecha ? grados - 90 : grados + 90} ${x} ${y})`} className="rosa-etiqueta radial">{texto}</text>;
      }
      const [x, y] = punto(angulo, R_FUERA + 16);
      const seno = Math.sin(angulo);
      // Solo va centrada la que cae justo arriba o abajo. Con 24 métricas la
      // primera y la última quedan a 7,5° a cada lado de las 12 y, centradas
      // las dos, se montaban una encima de la otra.
      const ancla = seno > 0.05 ? "start" : seno < -0.05 ? "end" : "middle";
      const lineas = enDosLineas(texto);
      const arriba = Math.cos(angulo) > 0.2;
      const desde = arriba ? y - (lineas.length - 1) * 11 : y + 4;
      return <text key={metrica.id} x={x} y={desde} textAnchor={ancla} className="rosa-etiqueta">
        {lineas.map((linea, k) => <tspan key={k} x={x} dy={k === 0 ? 0 : 11}>{linea}</tspan>)}
      </text>;
    })}

    <circle cx={CENTRO} cy={CENTRO} r={R_DENTRO - 4} className="rosa-centro" />
    {familias.map((familia, i) => (
      <g key={familia.id} transform={`translate(${caja.x + 16 + (i % porFila) * anchoLeyenda}, ${yLeyenda + Math.floor(i / porFila) * 24})`}>
        <rect width="12" height="12" rx="3" fill={COLOR_FAMILIA[familia.id]} />
        <text x="18" y="10" className="rosa-leyenda">{t(familia.nombre)}{familia.id === "movimiento" || familia.id === "presion" ? " · SkillCorner" : ""}</text>
      </g>
    ))}
  </svg>;
}
