"use client";

import { FAMILIAS, valorDeFamilia, type FamiliaEstilo, type PerfilEquipo } from "@/lib/estiloEquipo";
import { t, tf } from "@/lib/i18n";

/**
 * El radar de estilo: una arista por familia.
 *
 * Con una cuña por métrica eran 35 y no se leía ninguna. Aquí cada arista es
 * la media de los percentiles de su familia —construcción, circulación,
 * ataque, defensa y, con SkillCorner, movimiento y presión sin balón—, y el
 * detalle métrica a métrica está en las cajas de la izquierda. Tocar una
 * arista resalta su caja, y al revés.
 *
 * SVG y no canvas: la hoja se imprime, y un vector sale nítido en el PDF.
 */

export const COLOR_FAMILIA: Record<FamiliaEstilo, string> = {
  construccion: "#3b7dd8",
  circulacion: "#2f9e62",
  ataque: "#e08a2e",
  defensa: "#d0503f",
  movimiento: "#7b61d1",
  presion: "#1f9aa6",
};

const CENTRO = 280;
const R = 190;
const radio = (percentil: number) => R * Math.max(0, Math.min(100, percentil)) / 100;
const punto = (angulo: number, r: number) => [CENTRO + r * Math.sin(angulo), CENTRO - r * Math.cos(angulo)] as const;

/** "Movimiento sin balón" en dos líneas; las cortas, en una. */
function lineas(texto: string) {
  if (texto.length <= 13) return [texto];
  const corte = texto.indexOf(" ", Math.floor(texto.length / 2) - 3);
  return corte > 0 ? [texto.slice(0, corte), texto.slice(corte + 1)] : [texto];
}

export function RadarDeEstilo({ perfil, rival, activa = null, onActiva }: {
  perfil: PerfilEquipo;
  rival?: PerfilEquipo | null;
  /** La familia resaltada: su arista en su color y el resto atenuado. */
  activa?: FamiliaEstilo | null;
  onActiva?: (familia: FamiliaEstilo | null) => void;
}) {
  // Solo las familias con dato: sin SkillCorner, cuatro aristas.
  const familias = FAMILIAS
    .map((familia) => ({ ...familia, valor: valorDeFamilia(perfil, familia.id) }))
    .filter((familia): familia is typeof familia & { valor: NonNullable<typeof familia.valor> } => Boolean(familia.valor));
  const n = familias.length;
  if (n < 3) return null;
  const paso = (Math.PI * 2) / n;
  const angulo = (i: number) => i * paso;
  const elegir = (id: FamiliaEstilo) => onActiva?.(activa === id ? null : id);

  const poligono = (percentiles: number[]) => percentiles.map((p, i) => punto(angulo(i), radio(p)).join(",")).join(" ");
  const anillo = (p: number) => familias.map((_, i) => punto(angulo(i), radio(p)).join(",")).join(" ");

  // El rival, como línea continua. Si le falta una familia (no tiene
  // SkillCorner), la línea se corta ahí en vez de hundirse al centro, que
  // parecería un percentil cero.
  const delRival = rival ? familias.map((familia) => valorDeFamilia(rival, familia.id)?.percentil ?? null) : [];
  const completo = rival && delRival.every((v) => v !== null);
  const tramosRival: string[] = [];
  if (rival && !completo) {
    let actual: string[] = [];
    delRival.forEach((v, i) => {
      if (v === null) { if (actual.length > 1) tramosRival.push(actual.join(" ")); actual = []; return; }
      actual.push(punto(angulo(i), radio(v)).join(","));
    });
    if (actual.length > 1) tramosRival.push(actual.join(" "));
  }

  return <svg className={activa ? "radar-estilo con-activa" : "radar-estilo"} viewBox="-80 -4 720 568" role="img"
    aria-label={rival ? tf("Estilo de {a} frente a {b}", { a: perfil.equipo, b: rival.equipo }) : tf("Estilo de {a}", { a: perfil.equipo })}>
    {[25, 50, 75, 100].map((p) => <polygon key={p} points={anillo(p)} className={p === 50 ? "radar-anillo mediana" : "radar-anillo"} />)}
    {familias.map((familia, i) => {
      const [x, y] = punto(angulo(i), R);
      return <line key={familia.id} x1={CENTRO} y1={CENTRO} x2={x} y2={y}
        className={familia.id === activa ? "radar-eje activo" : "radar-eje"} style={familia.id === activa ? { stroke: COLOR_FAMILIA[familia.id] } : undefined} />;
    })}

    <polygon points={poligono(familias.map((familia) => familia.valor.percentil))} className="radar-equipo" />

    {completo && <polygon points={poligono(delRival as number[])} className="radar-rival" />}
    {tramosRival.map((tramo, i) => <polyline key={i} points={tramo} className="radar-rival abierto" />)}
    {rival && delRival.map((v, i) => {
      if (v === null) return null;
      const [x, y] = punto(angulo(i), radio(v));
      return <circle key={i} cx={x} cy={y} r={3.5} className="radar-rival-vertice" />;
    })}

    {familias.map((familia, i) => {
      const a = angulo(i);
      const [x, y] = punto(a, radio(familia.valor.percentil));
      const [lx, ly] = punto(a, R + 30);
      const seno = Math.sin(a), coseno = Math.cos(a);
      const ancla = seno > 0.1 ? "start" : seno < -0.1 ? "end" : "middle";
      const texto = lineas(t(familia.nombre));
      // Arriba, el bloque de texto crece hacia arriba; abajo, hacia abajo.
      const desde = coseno > 0.5 ? ly - texto.length * 16 : coseno < -0.5 ? ly + 16 : ly - (texto.length * 16) / 2 + 6;
      const atenuada = activa && activa !== familia.id;
      return <g key={familia.id} className={atenuada ? "radar-familia atenuada" : "radar-familia"} role="button" tabIndex={0}
        aria-pressed={activa === familia.id} aria-label={`${t(familia.nombre)} · P${familia.valor.percentil}`}
        onClick={() => elegir(familia.id)}
        onKeyDown={(evento) => { if (evento.key === "Enter" || evento.key === " ") { evento.preventDefault(); elegir(familia.id); } }}>
        <circle cx={x} cy={y} r={activa === familia.id ? 9 : 6.5} fill={COLOR_FAMILIA[familia.id]} className="radar-vertice" />
        <text x={lx} y={desde} textAnchor={ancla} className="radar-nombre" style={{ fill: COLOR_FAMILIA[familia.id] }}>
          {texto.map((linea, k) => <tspan key={k} x={lx} dy={k === 0 ? 0 : 16}>{linea}</tspan>)}
          <tspan x={lx} dy={17} className="radar-valor">{`P${familia.valor.percentil}`}</tspan>
        </text>
      </g>;
    })}
  </svg>;
}
