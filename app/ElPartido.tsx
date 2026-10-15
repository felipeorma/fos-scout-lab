"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Antetitulo, CAL, Cesped, FranjaDeCifras } from "./KitNight";
import { Escudo } from "./Escudo";
import { numberLocale, t, tf } from "@/lib/i18n";
import { fetchPartidosDeLiga } from "@/lib/remoteData";
import { METRICAS_ESTILO, type PerfilEquipo } from "@/lib/estiloEquipo";
import {
  MEJORA_MINIMA,
  PREDICCION_CALIBRADA,
  mejoraDelModelo,
  choqueDeDibujos,
  crucesDeEstilo,
  enfrentamientos,
  estructuraDe,
  formacionLegible,
  formacionProbable,
  fuertesYFlojos,
  lineaDefensiva,
  mediasDeLiga,
  onceTipico,
  partidosDe,
  perfilesDeDimension,
  prediccionDelPartido,
  rendimientoPorLinea,
  ventajas,
  type ChoqueDeZona,
  type CruceDeEstilo,
  type LigaPartidos,
  type MetricaPartido,
  type PartidoDeEquipo,
} from "@/lib/partido";

/**
 * El partido: cómo va a salir cada equipo y qué se espera cuando se crucen.
 *
 * Va dentro de Estilo de juego, con los dos equipos de esa página. Necesita
 * que sean de la misma liga y temporada: lo esperado y las ventajas salen de
 * sus partidos contra los mismos rivales. Los cálculos están en lib/partido.
 */

// Lo pedido en esta sesión y lo que está en camino, por liga y temporada.
const ligasGuardadas = new Map<string, LigaPartidos>();
const ligasEnCamino = new Map<string, Promise<LigaPartidos>>();

export function usePartidosDeLiga(competicion: number | null, temporada: number | null) {
  const clave = competicion !== null && temporada !== null ? `${competicion}:${temporada}` : "";
  const [estado, setEstado] = useState<{ clave: string; liga?: LigaPartidos; error?: string }>({ clave: "" });
  // Lo ya leído en esta sesión se sirve directo, sin pasar por el estado.
  const guardada = clave ? ligasGuardadas.get(clave) : undefined;
  useEffect(() => {
    if (!clave || ligasGuardadas.has(clave)) return;
    let vivo = true;
    let promesa = ligasEnCamino.get(clave);
    if (!promesa) {
      promesa = fetchPartidosDeLiga(competicion!, temporada!)
        .then((liga) => { if (!liga.fallidos) ligasGuardadas.set(clave, liga); return liga; })
        .finally(() => ligasEnCamino.delete(clave));
      ligasEnCamino.set(clave, promesa);
    }
    promesa
      .then((liga) => { if (vivo) setEstado({ clave, liga }); })
      .catch((fallo) => {
        if (!vivo) return;
        setEstado({ clave, error: fallo instanceof TypeError
          ? t("El servidor local no respondió. Arranca npm run bg:server y reintenta.")
          : fallo instanceof Error ? fallo.message : String(fallo) });
      });
    return () => { vivo = false; };
    // La clave ya contiene competición y temporada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  const vigente = estado.clave === clave ? estado : null;
  return { liga: guardada ?? vigente?.liga ?? null, error: guardada ? "" : vigente?.error ?? "", cargando: Boolean(clave) && !guardada && !vigente };
}

/** "303:316:1234" → competición, temporada y equipo. */
export const partesDeClave = (clave: string) => {
  const [competicion, temporada, equipo] = clave.split(":").map(Number);
  return { competicion, temporada, equipo };
};

const decimal = (valor: number, digitos = 1) => (Number.isFinite(valor)
  ? valor.toLocaleString(numberLocale(), { minimumFractionDigits: digitos, maximumFractionDigits: digitos })
  : "—");
const pct = (valor: number) => (Number.isFinite(valor) ? `${Math.round(valor * 100)}%` : "—");
const formato = (metrica: MetricaPartido, valor: number) => (metrica.formato === "pct" ? pct(valor) : decimal(valor, metrica.formato === "n2" ? 2 : 1));

// ---- Pizarra -----------------------------------------------------------------------------

/*
 * Dónde se dibuja cada puesto: profundidad desde la propia portería (0–100) y
 * ancho (0–80, su izquierda arriba). Los dos equipos se superponen —A ataca a
 * la derecha, B a la izquierda— de modo que los delanteros de uno caen sobre
 * los centrales del otro y los medios se encuentran: así se ven los choques.
 */
const SITIO: Record<string, [number, number]> = {
  GK: [0, 40],
  LB: [24, 10], RB: [24, 70], LCB: [17, 27], CB: [16, 40], RCB: [17, 53],
  LWB: [36, 7], RWB: [36, 73],
  LDMF: [35, 31], DMF: [34, 40], RDMF: [35, 49],
  LCMF: [47, 27], CMF: [47, 40], RCMF: [47, 53],
  LM: [54, 10], RM: [54, 70],
  LAMF: [62, 27], AMF: [62, 40], RAMF: [62, 53],
  LW: [70, 11], RW: [70, 69],
  SS: [72, 40], LCF: [80, 32], CF: [81, 40], RCF: [80, 48],
};

function Pizarra({ onceA, onceB, nombreA, nombreB }: { onceA: string[] | null; onceB: string[] | null; nombreA: string; nombreB: string }) {
  const punto = (codigo: string, lado: "a" | "b") => {
    const sitio = SITIO[codigo];
    if (!sitio) return null;
    const [d, w] = sitio;
    const x = codigo === "GK" ? (lado === "a" ? 3 : 117) : lado === "a" ? 10 + d : 110 - d;
    const y = lado === "a" ? w : 80 - w;
    return <g key={`${lado}-${codigo}`} className={`pizarra-ficha ${lado}`}>
      <circle cx={x} cy={y} r={3.3} />
      <text x={x} y={y + 1.05} textAnchor="middle">{codigo}</text>
    </g>;
  };
  return <figure className="partido-pizarra">
    <svg viewBox="-2 -2 124 84" role="img" aria-label={tf("Once probable de {a} y de {b}, superpuestos", { a: nombreA, b: nombreB })}>
      <Cesped ancho={120} largo={80} vertical={false} franja={10} />
      <rect x={0} y={0} width={120} height={80} {...CAL} />
      <line x1={60} y1={0} x2={60} y2={80} {...CAL} />
      <circle cx={60} cy={40} r={9.15} {...CAL} />
      <rect x={0} y={18} width={18} height={44} {...CAL} />
      <rect x={102} y={18} width={18} height={44} {...CAL} />
      {(onceB ?? []).map((codigo) => punto(codigo, "b"))}
      {(onceA ?? []).map((codigo) => punto(codigo, "a"))}
    </svg>
    <figcaption>
      <span><i className="a" />{tf("{equipo} ataca hacia la derecha", { equipo: nombreA })}</span>
      <span><i className="b" />{tf("{equipo} ataca hacia la izquierda", { equipo: nombreB })}</span>
    </figcaption>
  </figure>;
}

// ---- Textos --------------------------------------------------------------------------------

const ZONA: Record<ChoqueDeZona["zona"], string> = {
  salida_a: "Salida de {a}: sus centrales contra las puntas de {b}",
  salida_b: "Salida de {b}: sus centrales contra las puntas de {a}",
  medio: "Centro del campo: pivotes, interiores y mediapuntas",
  bandas: "Cada banda: laterales, carrileros y extremos",
};

function lecturaDeZona(zona: ChoqueDeZona, a: string, b: string) {
  const quien = zona.ventaja === "a" ? a : zona.ventaja === "b" ? b : "";
  if (zona.zona === "salida_a" || zona.zona === "salida_b") {
    const sale = zona.zona === "salida_a" ? a : b;
    const sobran = zona.zona === "salida_a" ? zona.a - zona.b : zona.b - zona.a;
    if (sobran >= 2) return tf("{equipo} sale con dos de sobra: para apretarle hay que saltar con extremos o mediapunta.", { equipo: sale });
    if (sobran === 1) return tf("{equipo} sale con uno de sobra, lo normal.", { equipo: sale });
    if (sobran === 0) return tf("Igualdad: {equipo} sale con sus centrales emparejados; presionarle hombre a hombre es posible.", { equipo: sale });
    return tf("{equipo} sale en inferioridad: le esperan más puntas que centrales tiene.", { equipo: sale });
  }
  if (!quien) return t("Igualados en número: decide quién gana los duelos y quién se mueve mejor.");
  return zona.zona === "medio"
    ? tf("{equipo} tiene uno más por dentro: puede tener el balón y girar entre líneas.", { equipo: quien })
    : tf("{equipo} tiene más gente por fuera: puede doblar en banda y llegar con centros.", { equipo: quien });
}

const CRUCE: Record<CruceDeEstilo["id"], string> = {
  espalda: "{a} ataca la espalda y {b} defiende alto: hay espacio detrás de su línea.",
  presion_salida: "{a} presiona arriba y {b} sale jugando en corto desde atrás: robo alto probable.",
  transicion: "{a} corre al contragolpe y {b} se queda con el balón: tras cada pérdida de {b} habrá espacio.",
  contrapresion: "{a} aprieta al perder la pelota y {b} la pierde a menudo bajo presión.",
};

const etiquetaDeMetricaEstilo = (id: string) => t(METRICAS_ESTILO.find((m) => m.id === id)?.etiqueta ?? id);
const conSigno = (z: number) => `${z >= 0 ? "+" : "−"}${Math.abs(z).toFixed(1)}`;
const ordinal = (n: number, de: number) => tf("{n}º de {de}", { n, de });

// ---- La sección ----------------------------------------------------------------------------

export function ElPartido({ a, b }: { a: PerfilEquipo; b: PerfilEquipo }) {
  const pa = partesDeClave(a.clave);
  const pb = partesDeClave(b.clave);
  const mismaLiga = pa.competicion === pb.competicion && pa.temporada === pb.temporada;
  const { liga, error, cargando } = usePartidosDeLiga(mismaLiga ? pa.competicion : null, mismaLiga ? pa.temporada : null);

  const datos = useMemo(() => {
    if (!liga) return null;
    const deA = partidosDe(liga, pa.equipo);
    const deB = partidosDe(liga, pb.equipo);
    if (!deA.length || !deB.length) return null;
    const formA = formacionProbable(deA);
    const formB = formacionProbable(deB);
    const onceA = formA[0] ? onceTipico(deA, formA[0].formacion) : null;
    const onceB = formB[0] ? onceTipico(deB, formB[0].formacion) : null;
    const estA = onceA ? estructuraDe(onceA) : null;
    const estB = onceB ? estructuraDe(onceB) : null;
    const dimensiones = perfilesDeDimension(liga);
    const dimA = dimensiones.get(pa.equipo) ?? [];
    const dimB = dimensiones.get(pb.equipo) ?? [];
    return {
      deA, deB, formA, formB, onceA, onceB, estA, estB,
      choque: estA && estB ? choqueDeDibujos(estA, estB) : [],
      esperado: prediccionDelPartido(deA, deB, mediasDeLiga(liga)),
      ventajasA: ventajas(dimA, dimB),
      ventajasB: ventajas(dimB, dimA),
      fuertesA: fuertesYFlojos(dimA),
      fuertesB: fuertesYFlojos(dimB),
      lineasA: rendimientoPorLinea(deA),
      lineasB: rendimientoPorLinea(deB),
      previos: enfrentamientos(deA, pb.equipo),
    };
  }, [liga, pa.equipo, pb.equipo]);

  const crucesA = useMemo(() => crucesDeEstilo(a, b), [a, b]);
  const crucesB = useMemo(() => crucesDeEstilo(b, a), [a, b]);

  const cabecera = <header className="partido-cabecera">
    <Antetitulo>{t("EL PARTIDO")}</Antetitulo>
    <h3>
      <span className="con-escudo"><Escudo equipo={a.equipo} liga={a.competicion} tamano={22} respaldo />{a.equipo}</span>
      <em>{t("contra")}</em>
      <span className="con-escudo"><Escudo equipo={b.equipo} liga={b.competicion} tamano={22} respaldo />{b.equipo}</span>
    </h3>
  </header>;

  if (!mismaLiga) {
    return <section className="partido">{cabecera}
      <p className="partido-estado">{t("Para el partido hacen falta los dos equipos en la misma liga y temporada: lo esperado y las ventajas salen de sus partidos contra los mismos rivales. Elige un rival de su liga.")}</p>
    </section>;
  }
  if (!datos) {
    return <section className="partido">{cabecera}
      <p className="partido-estado" role="status">{error || (cargando
        ? tf("Leyendo los partidos de {liga}… la primera vez tarda unos minutos.", { liga: a.competicion })
        : t("No hay partidos jugados de los dos en esta temporada."))}</p>
    </section>;
  }

  const { formA, formB, esperado } = datos;
  const posesion = esperado.find((e) => e.metrica.id === "posesion");
  const xg = esperado.find((e) => e.metrica.id === "xg");
  const ppda = esperado.find((e) => e.metrica.id === "ppda");
  const presionaMas = ppda && Number.isFinite(ppda.a) && Number.isFinite(ppda.b) ? (ppda.a < ppda.b ? a.equipo : b.equipo) : "";
  const validacion = PREDICCION_CALIBRADA.partidos
    ? tf("Lo esperado se calibró prediciendo {n} partidos de {l} ligas solo con los anteriores a cada uno.", { n: PREDICCION_CALIBRADA.partidos.toLocaleString(numberLocale()), l: PREDICCION_CALIBRADA.ligas.length })
    : "";

  const columnaVentajas = (equipo: string, rival: string, lista: typeof datos.ventajasA, cruces: CruceDeEstilo[]) => <div>
    <h4>{tf("Dónde puede hacer daño {equipo}", { equipo })}</h4>
    {!lista.length && !cruces.length && <p className="partido-vacio">{t("Nada claro: lo que mejor hace no coincide con lo que peor defiende el rival.")}</p>}
    <ul>
      {lista.map((v) => <li key={v.dimension.id}>
        <b>{t(v.dimension.etiqueta)}</b>
        <span>{tf("{equipo} es {p} de la liga generándolo; {rival}, {q} defendiéndolo.", {
          equipo, rival, p: ordinal(v.puestoHace, v.equipos), q: ordinal(v.equipos + 1 - v.puestoConcedeRival, v.equipos),
        })}</span>
      </li>)}
      {cruces.map((cruce) => <li key={cruce.id} className="partido-cruce">
        <b>{tf(CRUCE[cruce.id], { a: equipo, b: rival })}</b>
        <span>{cruce.de.map((d) => `${d.equipo === "a" ? equipo : rival}: ${etiquetaDeMetricaEstilo(d.metrica)} ${conSigno(d.z)}`).join(" · ")}</span>
      </li>)}
    </ul>
  </div>;

  const columnaFuertes = (equipo: string, lectura: typeof datos.fuertesA) => {
    const texto = (l: (typeof lectura.fuertes)[number]) => (l.lado === "hace"
      ? tf("{d}: {p} de la liga generándolo", { d: t(l.dimension.etiqueta), p: ordinal(l.puesto, l.equipos) })
      : tf("{d}: {p} de la liga defendiéndolo", { d: t(l.dimension.etiqueta), p: ordinal(l.puesto, l.equipos) }));
    return <div>
      <h4 className="con-escudo">{equipo}</h4>
      <p className="partido-etiqueta bueno">{t("Fuerte")}</p>
      <ul>{lectura.fuertes.length ? lectura.fuertes.map((l) => <li key={`${l.dimension.id}-${l.lado}`}>{texto(l)}</li>) : <li className="partido-vacio">{t("Nada que destaque en su liga.")}</li>}</ul>
      <p className="partido-etiqueta malo">{t("Flojo")}</p>
      <ul>{lectura.flojos.length ? lectura.flojos.map((l) => <li key={`${l.dimension.id}-${l.lado}`}>{texto(l)}</li>) : <li className="partido-vacio">{t("Nada que flojee en su liga.")}</li>}</ul>
    </div>;
  };

  const filaLinea = (equipo: string, lineas: typeof datos.lineasA, lineaRival: 3 | 4 | null): ReactNode => <tr>
    <th scope="row">{equipo}</th>
    {([3, 4] as const).map((linea) => {
      const r = lineas[linea];
      return <td key={linea} className={lineaRival === linea ? "contra-esta" : undefined}>
        {r.partidos ? <>
          <b>{tf("{p} pts en {n}", { p: r.puntos, n: r.partidos })}</b>
          <small>{tf("xG {f}–{c} por partido", { f: decimal(r.xg, 2), c: decimal(r.xgContra, 2) })}</small>
        </> : <small>{t("sin partidos")}</small>}
      </td>;
    })}
  </tr>;

  return <section className="partido">
    {cabecera}
    <p className="partido-intro">{tf("Con sus {na} y {nb} partidos de la temporada. Lo esperado corrige lo que suele hacer cada uno por lo que suele conceder el otro.", { na: datos.deA.length, nb: datos.deB.length })}</p>

    <ul className="partido-resumen">
      {formA[0] && formB[0] && <li>{tf("{a} saldrá probablemente con {fa} ({pa}) y {b} con {fb} ({pb}).", {
        a: a.equipo, b: b.equipo, fa: formacionLegible(formA[0].formacion), pa: pct(formA[0].probabilidad), fb: formacionLegible(formB[0].formacion), pb: pct(formB[0].probabilidad),
      })}</li>}
      {posesion && <li>{tf("Posesión esperada: {pa} para {a}, {pb} para {b}.", { a: a.equipo, b: b.equipo, pa: pct(posesion.a), pb: pct(posesion.b) })}</li>}
      {ppda && presionaMas && <li>{tf("Presionará más {equipo} (PPDA esperado {x} frente a {y}; menos es más presión).", {
        equipo: presionaMas, x: decimal(Math.min(ppda.a, ppda.b)), y: decimal(Math.max(ppda.a, ppda.b)),
      })}</li>}
      {xg && <li>{tf("xG esperado sin penaltis: {xa} – {xb}.", { xa: decimal(xg.a, 2), xb: decimal(xg.b, 2) })}</li>}
      {[{ equipo: a.equipo, lista: datos.ventajasA, cruces: crucesA, rival: b.equipo }, { equipo: b.equipo, lista: datos.ventajasB, cruces: crucesB, rival: a.equipo }]
        .filter(({ lista, cruces }) => lista.length || cruces.length)
        .map(({ equipo, lista, cruces, rival }) => <li key={equipo}>{lista.length
          ? tf("Donde más daño puede hacer {equipo}: {d}.", { equipo, d: t(lista[0].dimension.etiqueta).toLowerCase() })
          : tf(CRUCE[cruces[0].id], { a: equipo, b: rival })}</li>)}
    </ul>

    <div className="partido-dibujos">
      <Pizarra onceA={datos.onceA} onceB={datos.onceB} nombreA={a.equipo} nombreB={b.equipo} />
      <div className="partido-formaciones">
        {[{ equipo: a.equipo, form: formA, de: datos.deA, lado: "a" }, { equipo: b.equipo, form: formB, de: datos.deB, lado: "b" }].map(({ equipo, form, de, lado }) => (
          <div key={lado} className={`partido-formacion ${lado}`}>
            <b>{equipo}</b>
            <ol>{form.slice(0, 3).map((f) => <li key={f.formacion}>
              <span>{formacionLegible(f.formacion)}</span>
              <i><u style={{ width: `${Math.round(f.probabilidad * 100)}%` }} /></i>
              <em>{pct(f.probabilidad)}</em>
            </li>)}</ol>
            <small>{tf("Último partido: {f} · {n} cambios de dibujo en la temporada", {
              f: formacionLegible(de.filter((p: PartidoDeEquipo) => p.formacion).at(-1)?.formacion ?? null),
              n: de.reduce((s: number, p: PartidoDeEquipo) => s + p.cambios, 0),
            })}</small>
          </div>
        ))}
        <p className="partido-nota">{[t("Probabilidad: cuántas veces salió con cada dibujo, pesando más los últimos partidos. El once es el reparto de puestos que más repitió con ese dibujo."),
          tf("En la validación acertó el dibujo exacto el {d} de las veces y la línea (de 3 o de 4) el {l}.", { d: pct(PREDICCION_CALIBRADA.formacion.acierto), l: pct(PREDICCION_CALIBRADA.formacion.linea) })].join(" ")}</p>
      </div>
    </div>

    {datos.choque.length > 0 && <div className="partido-bloque">
      <h4>{t("El choque de dibujos")}</h4>
      <ol className="partido-zonas">
        {datos.choque.map((zona) => <li key={zona.zona} className={zona.ventaja ? `ventaja-${zona.ventaja}` : undefined}>
          <span>{tf(ZONA[zona.zona], { a: a.equipo, b: b.equipo })}</span>
          <b>{`${decimal(zona.a, zona.a % 1 ? 1 : 0)} – ${decimal(zona.b, zona.b % 1 ? 1 : 0)}`}</b>
          <small>{lecturaDeZona(zona, a.equipo, b.equipo)}</small>
        </li>)}
      </ol>
      <p className="partido-nota">{t("Pizarra: cuántos hay de cada uno donde se encuentran los dos onces probables. Dice qué permite el dibujo, no lo que pasará: los movimientos lo cambian todo.")}</p>
    </div>}

    <div className="partido-bloque">
      <h4>{t("Lo esperado")}</h4>
      <table className="partido-esperado">
        <thead><tr><th>{a.equipo}</th><th>{t("Métrica")}</th><th>{b.equipo}</th><th>{t("Media de la liga")}</th></tr></thead>
        <tbody>{esperado.map((e) => {
          const mejorA = e.metrica.menosEsMas ? e.a < e.b : e.a > e.b;
          const mejora = mejoraDelModelo(e.metrica.campo);
          return <tr key={e.metrica.id} className={mejora < MEJORA_MINIMA ? "azar" : undefined}
            title={Number.isFinite(mejora) ? tf("En la validación, {n} menos de error que la mejor alternativa.", { n: pct(mejora) }) : undefined}>
            <td className={mejorA ? "lider" : undefined}>{formato(e.metrica, e.a)}</td>
            <th scope="row">{t(e.metrica.etiqueta)}</th>
            <td className={!mejorA ? "lider" : undefined}>{formato(e.metrica, e.b)}</td>
            <td className="media">{formato(e.metrica, e.mediaLiga)}</td>
          </tr>;
        })}</tbody>
      </table>
      <p className="partido-nota">{[t("Lo que suele hacer cada uno, corregido por lo que suele conceder el rival, con un peso por métrica ajustado en partidos reales."), validacion,
        t("En gris, las que apenas se pueden predecir partido a partido (contragolpes, juego directo, balón parado): ahí manda el azar.")].filter(Boolean).join(" ")}</p>
    </div>

    <div className="partido-bloque partido-dos">
      {columnaVentajas(a.equipo, b.equipo, datos.ventajasA, crucesA)}
      {columnaVentajas(b.equipo, a.equipo, datos.ventajasB, crucesB)}
    </div>

    <div className="partido-bloque partido-dos">
      {columnaFuertes(a.equipo, datos.fuertesA)}
      {columnaFuertes(b.equipo, datos.fuertesB)}
    </div>

    <div className="partido-bloque">
      <h4>{t("Contra línea de 3 y contra línea de 4")}</h4>
      <table className="partido-lineas">
        <thead><tr><th /><th>{t("Rival con línea de 3")}</th><th>{t("Rival con línea de 4")}</th></tr></thead>
        <tbody>
          {filaLinea(a.equipo, datos.lineasA, datos.estB ? lineaDefensiva(datos.estB) : null)}
          {filaLinea(b.equipo, datos.lineasB, datos.estA ? lineaDefensiva(datos.estA) : null)}
        </tbody>
      </table>
      <p className="partido-nota">{t("Marcada, la línea con que sale el rival de este partido. Pocos partidos dicen poco: mira el número antes que el promedio.")}</p>
    </div>

    {datos.previos.length > 0 && <div className="partido-bloque">
      <h4>{t("Esta temporada entre ellos")}</h4>
      <FranjaDeCifras className="partido-previos" celdas={datos.previos.map((p) => ({
        etiqueta: `${p.fecha} · ${p.enCasa ? t("en casa") : t("fuera")}`,
        valor: `${p.gf}–${p.gc}`,
        bajada: tf("xG {f}–{c} · {fa} contra {fb}", {
          f: decimal(p.propios.np_xg ?? Number.NaN, 2), c: decimal(p.delRival.np_xg ?? Number.NaN, 2),
          fa: formacionLegible(p.formacion), fb: formacionLegible(p.formacionRival),
        }),
      }))} />
    </div>}
  </section>;
}
