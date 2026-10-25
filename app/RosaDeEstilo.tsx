"use client";

import { useId } from "react";
import { FAMILIAS, valorDeFamilia, type FamiliaEstilo, type PerfilEquipo } from "@/lib/estiloEquipo";
import { sitioDelValor } from "@/lib/radar";
import { tonosDe } from "@/lib/similarityMetricGroups";
import { t, tf } from "@/lib/i18n";

/**
 * La rosa de estilo: una cuña por familia, agrupadas por fase del juego.
 *
 * El largo de cada cuña es la media de los percentiles de su familia contra
 * el grupo de referencia; el anillo discontinuo es la mediana. El detalle,
 * métrica a métrica, está en las cajas de la izquierda: tocar una cuña
 * resalta su caja, y al revés.
 *
 * Los colores son los de Ficha y radar (ver "rosa de estilo" en
 * globals.css), y el dibujo también: cada cuña sobre su pista, de oscuro a
 * claro según el percentil, su número en una píldora oscura y un anillo de
 * color por fuera. Las familias van en el orden de la jugada, las cuatro con
 * balón arriba y las dos sin balón abajo, y un arco gris más afuera nombra
 * cada fase.
 *
 * El equipo con el que se compara va encima como una línea continua en la
 * tinta —blanca en el tema oscuro—, para leer las dos formas a la vez.
 * SVG y no canvas: la hoja se imprime, y un vector sale nítido en el PDF.
 */

/** El color de cada familia: variables del tema (ver globals.css, "rosa de estilo"). */
export const COLOR_FAMILIA: Record<FamiliaEstilo, string> = {
  construccion: "var(--familia-construccion)",
  circulacion: "var(--familia-circulacion)",
  ataque: "var(--familia-ataque)",
  movimiento: "var(--familia-movimiento)",
  defensa: "var(--familia-defensa)",
  presion: "var(--familia-presion)",
};

/** Los mismos tonos en hexadecimal: el degradado necesita el bajo y el alto aprobados de cada uno. */
const HEX_FAMILIA: Record<FamiliaEstilo, string> = {
  construccion: "#b5577f",
  circulacion: "#d7a62c",
  ataque: "#e95b3f",
  movimiento: "#12c48b",
  defensa: "#3f72d9",
  presion: "#8b5cf6",
};

const CENTRO = 280;
const R_DENTRO = 30;
const R_FUERA = 196;
/** El anillo de color de cada familia, como el de los conjuntos en el radar de jugadores. */
const R_ANILLO = R_FUERA + 13;
const R_FASE = R_ANILLO + 16;
const R_NOMBRE = R_FASE + 24;
/** La píldora del percentil: la del radar de jugadores. */
const CIFRA = 13;
const ALTO_PILDORA = CIFRA * 1.55;

const radio = (percentil: number) => R_DENTRO + (R_FUERA - R_DENTRO) * Math.max(0, Math.min(100, percentil)) / 100;
const punto = (angulo: number, r: number) => [CENTRO + r * Math.sin(angulo), CENTRO - r * Math.cos(angulo)] as const;
const arco = (a0: number, a1: number, r: number, invertido = false) => {
  const [x0, y0] = punto(invertido ? a1 : a0, r), [x1, y1] = punto(invertido ? a0 : a1, r);
  return `M${x0} ${y0}A${r} ${r} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} ${invertido ? 0 : 1} ${x1} ${y1}`;
};

/** "Movimiento sin balón" en dos líneas; las cortas, en una. */
function lineas(texto: string) {
  if (texto.length <= 13) return [texto];
  const corte = texto.indexOf(" ", Math.floor(texto.length / 2) - 3);
  return corte > 0 ? [texto.slice(0, corte), texto.slice(corte + 1)] : [texto];
}

export function RosaDeEstilo({ perfil, rival, activa = null, onActiva }: {
  perfil: PerfilEquipo;
  rival?: PerfilEquipo | null;
  /** La familia resaltada: su cuña a pleno y el resto atenuado. */
  activa?: FamiliaEstilo | null;
  onActiva?: (familia: FamiliaEstilo | null) => void;
}) {
  const id = useId().replace(/:/g, "");
  // Solo las familias con dato: sin SkillCorner, cuatro cuñas.
  const familias = FAMILIAS
    .map((familia) => ({ ...familia, valor: valorDeFamilia(perfil, familia.id) }))
    .filter((familia): familia is typeof familia & { valor: NonNullable<typeof familia.valor> } => Boolean(familia.valor));
  const n = familias.length;
  if (n < 3) return null;
  const paso = (Math.PI * 2) / n;
  const conBalon = familias.filter((familia) => familia.fase === "con").length;
  // Las familias con balón, centradas arriba; las sin balón, abajo.
  const inicio = -(conBalon * paso) / 2;
  const desde = (i: number) => inicio + i * paso;
  const medio = (i: number) => desde(i) + paso / 2;
  const hueco = paso * 0.035;
  const huecoAnillo = Math.min(0.045, paso * 0.12);
  const elegir = (id: FamiliaEstilo) => onActiva?.(activa === id ? null : id);

  const cuna = (i: number, percentil: number) => {
    const a0 = desde(i) + hueco, a1 = desde(i + 1) - hueco, r = radio(percentil);
    const [x0, y0] = punto(a0, R_DENTRO), [x1, y1] = punto(a0, r), [x2, y2] = punto(a1, r), [x3, y3] = punto(a1, R_DENTRO);
    return `M${x0} ${y0}L${x1} ${y1}A${r} ${r} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${R_DENTRO} ${R_DENTRO} 0 0 0 ${x0} ${y0}Z`;
  };

  // El rival, como línea continua por el centro de cada cuña. Si le falta
  // una familia (no tiene SkillCorner), la línea se corta ahí en vez de
  // hundirse al centro, que parecería un percentil cero.
  const delRival = rival ? familias.map((familia) => valorDeFamilia(rival, familia.id)?.percentil ?? null) : [];
  const completo = Boolean(rival) && delRival.every((v) => v !== null);
  const tramos: string[] = [];
  if (rival && !completo) {
    let actual: string[] = [];
    delRival.forEach((v, i) => {
      if (v === null) { if (actual.length > 1) tramos.push(actual.join(" ")); actual = []; return; }
      actual.push(punto(medio(i), radio(v)).join(","));
    });
    if (actual.length > 1) tramos.push(actual.join(" "));
  }

  const fases = [
    { id: "con", nombre: t("Con balón"), a0: desde(0), a1: desde(conBalon), abajo: false },
    { id: "sin", nombre: t("Sin balón"), a0: desde(conBalon), a1: desde(n), abajo: true },
  ].filter((fase) => fase.a1 - fase.a0 > 0.01);

  const clase = (base: string, familia: FamiliaEstilo) => (activa && activa !== familia ? `${base} atenuada` : base);

  return <svg className={activa ? "rosa-estilo con-activa" : "rosa-estilo"} viewBox="-90 -8 740 576" role="img"
    aria-label={rival ? tf("Estilo de {a} frente a {b}", { a: perfil.equipo, b: rival.equipo }) : tf("Estilo de {a}", { a: perfil.equipo })}>
    <defs>
      {/* De oscuro a claro a lo largo de TODA la pista, no de la cuña: el tono
          dice el percentil, y una cuña corta se queda apagada. */}
      {familias.map((familia) => {
        const { bajo, alto } = tonosDe(HEX_FAMILIA[familia.id]);
        return <radialGradient key={familia.id} id={`${id}-${familia.id}`} gradientUnits="userSpaceOnUse" cx={CENTRO} cy={CENTRO} r={R_FUERA} fx={CENTRO} fy={CENTRO}>
          <stop offset={R_DENTRO / R_FUERA} stopColor={bajo} />
          <stop offset={(R_DENTRO + 0.55 * (R_FUERA - R_DENTRO)) / R_FUERA} stopColor={HEX_FAMILIA[familia.id]} />
          <stop offset={1} stopColor={alto} />
        </radialGradient>;
      })}
    </defs>

    {[25, 50, 75, 100].map((p) => <circle key={p} cx={CENTRO} cy={CENTRO} r={radio(p)} className={p === 50 ? "rosa-anillo mediana" : "rosa-anillo"} />)}

    {/* El anillo de color de cada familia, sobre una base tenue. */}
    <circle cx={CENTRO} cy={CENTRO} r={R_ANILLO} className="rosa-anillo-base" />
    {familias.map((familia, i) => (
      <path key={familia.id} d={arco(desde(i) + huecoAnillo, desde(i + 1) - huecoAnillo, R_ANILLO)} style={{ stroke: COLOR_FAMILIA[familia.id] }}
        className={clase("rosa-anillo-familia", familia.id)} />
    ))}

    {familias.map((familia, i) => (
      <g key={familia.id} className={clase("rosa-cuna", familia.id)} onClick={() => elegir(familia.id)}>
        <title>{`${t(familia.nombre)} · P${familia.valor.percentil} · ${tf("{n} métricas", { n: familia.valor.metricas })}`}</title>
        {/* La pista entera, tenue: deja ver cuánto le falta al percentil. */}
        <path d={cuna(i, 100)} className="rosa-pista" />
        <path d={cuna(i, familia.valor.percentil)} fill={`url(#${id}-${familia.id})`} />
      </g>
    ))}

    {completo && <polygon points={delRival.map((v, i) => punto(medio(i), radio(v as number)).join(",")).join(" ")} className="rosa-rival" />}
    {tramos.map((tramo, i) => <polyline key={i} points={tramo} className="rosa-rival abierto" />)}

    {/* El percentil en su píldora, encima de la línea del rival para que se lea. */}
    {familias.map((familia, i) => {
      const valor = String(familia.valor.percentil);
      const ancho = Math.max(ALTO_PILDORA, valor.length * CIFRA * 0.6 + CIFRA * 0.62);
      const { radio: r } = sitioDelValor({
        radioInterior: R_DENTRO, radioExterior: R_FUERA, radioDePorcion: radio(familia.valor.percentil),
        anguloPorPorcion: paso, anchoPildora: ancho, altoPildora: ALTO_PILDORA,
      });
      const [x, y] = punto(medio(i), r);
      return <g key={familia.id} className={clase("rosa-pildora", familia.id)} aria-hidden="true">
        <rect x={x - ancho / 2} y={y - ALTO_PILDORA / 2} width={ancho} height={ALTO_PILDORA} rx={ALTO_PILDORA / 2} />
        <text x={x} y={y + CIFRA * 0.02} textAnchor="middle" dominantBaseline="central">{valor}</text>
      </g>;
    })}

    <circle cx={CENTRO} cy={CENTRO} r={R_DENTRO - 4} className="rosa-centro" />

    {/* Las dos fases: un arco fino por fuera y su nombre escrito sobre él.
        El de abajo va al revés para que se lea de izquierda a derecha. */}
    {fases.map((fase) => {
      const id = `rosa-fase-${fase.id}-${perfil.clave.replace(/[^a-z0-9]/gi, "")}`;
      return <g key={fase.id} className={`rosa-fase ${fase.id}`}>
        <path d={arco(fase.a0 + hueco, fase.a1 - hueco, R_FASE)} className="rosa-fase-arco" />
        <path id={id} d={arco(fase.a0, fase.a1, fase.abajo ? R_FASE + 13 : R_FASE + 5, fase.abajo)} fill="none" stroke="none" />
        <text className="rosa-fase-nombre"><textPath href={`#${id}`} startOffset="50%" textAnchor="middle">{fase.nombre.toUpperCase()}</textPath></text>
      </g>;
    })}

    {familias.map((familia, i) => {
      const a = medio(i);
      const [x, y] = punto(a, R_NOMBRE);
      const seno = Math.sin(a), coseno = Math.cos(a);
      const ancla = seno > 0.15 ? "start" : seno < -0.15 ? "end" : "middle";
      const texto = lineas(t(familia.nombre));
      const alto = texto.length * 15;
      const y0 = coseno > 0.6 ? y - alto + 12 : coseno < -0.6 ? y + 12 : y - alto / 2 + 12;
      return <g key={familia.id} className={activa && activa !== familia.id ? "rosa-familia atenuada" : activa === familia.id ? "rosa-familia activa" : "rosa-familia"}
        role="button" tabIndex={0} aria-pressed={activa === familia.id} aria-label={`${t(familia.nombre)} · P${familia.valor.percentil}`}
        onClick={() => elegir(familia.id)}
        onKeyDown={(evento) => { if (evento.key === "Enter" || evento.key === " ") { evento.preventDefault(); elegir(familia.id); } }}>
        <text x={x} y={y0} textAnchor={ancla} className="rosa-nombre">
          {texto.map((linea, k) => <tspan key={k} x={x} dy={k === 0 ? 0 : 15}>{linea}</tspan>)}
        </text>
      </g>;
    })}
  </svg>;
}
