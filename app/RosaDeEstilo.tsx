"use client";

import { FAMILIAS, valorDeFamilia, type FamiliaEstilo, type PerfilEquipo } from "@/lib/estiloEquipo";
import { t, tf } from "@/lib/i18n";

/**
 * La rosa de estilo: una cuña por familia, agrupadas por fase del juego.
 *
 * El largo de cada cuña es la media de los percentiles de su familia contra
 * el grupo de referencia; el anillo discontinuo es la mediana. El detalle,
 * métrica a métrica, está en las cajas de la izquierda: tocar una cuña
 * resalta su caja, y al revés.
 *
 * El color no es una paleta de categorías: es la fase. Las cuatro familias
 * con balón van en el color del club, de más a menos intenso siguiendo la
 * jugada (construir, circular, atacar, moverse para recibir); las dos sin
 * balón, en grafito. Un arco por fuera nombra cada fase. En el espacio de
 * Cavalry sale en su rojo; en el de Maldonado, en su verde.
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

const CENTRO = 280;
const R_DENTRO = 30;
const R_FUERA = 196;
const R_FASE = R_FUERA + 12;
const R_NOMBRE = R_FUERA + 34;

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

  return <svg className={activa ? "rosa-estilo con-activa" : "rosa-estilo"} viewBox="-86 -6 732 572" role="img"
    aria-label={rival ? tf("Estilo de {a} frente a {b}", { a: perfil.equipo, b: rival.equipo }) : tf("Estilo de {a}", { a: perfil.equipo })}>
    {[25, 50, 75, 100].map((p) => <circle key={p} cx={CENTRO} cy={CENTRO} r={radio(p)} className={p === 50 ? "rosa-anillo mediana" : "rosa-anillo"} />)}
    {familias.map((_, i) => {
      const [x, y] = punto(desde(i), R_FUERA);
      return <line key={i} x1={CENTRO} y1={CENTRO} x2={x} y2={y} className="rosa-radio" />;
    })}

    {familias.map((familia, i) => (
      <path key={familia.id} d={cuna(i, familia.valor.percentil)} style={{ fill: COLOR_FAMILIA[familia.id] }}
        className={activa && activa !== familia.id ? "rosa-cuna atenuada" : "rosa-cuna"} onClick={() => elegir(familia.id)}>
        <title>{`${t(familia.nombre)} · P${familia.valor.percentil} · ${tf("{n} métricas", { n: familia.valor.metricas })}`}</title>
      </path>
    ))}

    {completo && <polygon points={delRival.map((v, i) => punto(medio(i), radio(v as number)).join(",")).join(" ")} className="rosa-rival" />}
    {tramos.map((tramo, i) => <polyline key={i} points={tramo} className="rosa-rival abierto" />)}

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
      const alto = (texto.length + 1) * 15;
      const y0 = coseno > 0.6 ? y - alto + 12 : coseno < -0.6 ? y + 12 : y - alto / 2 + 12;
      return <g key={familia.id} className={activa && activa !== familia.id ? "rosa-familia atenuada" : activa === familia.id ? "rosa-familia activa" : "rosa-familia"}
        role="button" tabIndex={0} aria-pressed={activa === familia.id} aria-label={`${t(familia.nombre)} · P${familia.valor.percentil}`}
        onClick={() => elegir(familia.id)}
        onKeyDown={(evento) => { if (evento.key === "Enter" || evento.key === " ") { evento.preventDefault(); elegir(familia.id); } }}>
        <text x={x} y={y0} textAnchor={ancla} className="rosa-nombre">
          {texto.map((linea, k) => <tspan key={k} x={x} dy={k === 0 ? 0 : 15}>{linea}</tspan>)}
          <tspan x={x} dy={16} className="rosa-valor">{`P${familia.valor.percentil}`}</tspan>
        </text>
      </g>;
    })}
  </svg>;
}
