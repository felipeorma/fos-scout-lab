"use client";

import { useEffect, useMemo, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { Antetitulo, CAL, Cesped, FranjaDeCifras } from "./KitNight";
import { Escudo } from "./Escudo";
import { numberLocale, t, tf } from "@/lib/i18n";
import { fetchPartidosDeLiga } from "@/lib/remoteData";
import { METRICAS_ESTILO, mismoEquipo, type PerfilEquipo } from "@/lib/estiloEquipo";
import { nivelDeLiga } from "@/lib/nivelDeLiga";
import {
  MEJORA_MINIMA,
  PREDICCION_CALIBRADA,
  choqueDeDibujos,
  crucesDeEstilo,
  enfrentamientos,
  estructuraDe,
  formacionLegible,
  formacionProbable,
  fuertesYFlojos,
  lineaDefensiva,
  mediasDeLiga,
  mejoraDelModelo,
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
import { FASES, fasesDeLiga, formaReciente, lecturaDe, lecturaDeFases, type LecturaDeMetrica, type MetricaDeFase } from "@/lib/fases";
import { DIBUJOS, SITIO, consejosDePizarra, oncePara, puestosDe, type Consejo } from "@/lib/pizarra";
import { normalizarNombre, useCatalogo, useFormaDeLiga, usePlantelDeLiga, type JugadorDePlantel } from "./useTemporadaDeLiga";

/**
 * El partido: el informe de un rival como lo prepara un cuerpo técnico.
 *
 * Arriba, las claves; después, la pizarra —los dos onces sobre la misma
 * cancha, con jugadores reales y su índice, que se mueven arrastrando o
 * tocando—, lo que aconseja el cruce de dibujos (cada consejo con los datos
 * que lo sostienen), las cinco fases del juego de cada uno y cómo vienen. Si
 * los dos son de la misma liga y temporada, además lo esperado, dónde puede
 * hacer daño cada uno y los enfrentamientos; si no, cada uno se lee contra su
 * propia liga y el nivel de cada liga va al lado. Los cálculos están en
 * lib/partido, lib/fases y lib/pizarra.
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
const formatoFase = (metrica: MetricaDeFase, valor: number) => (
  metrica.formato === "pct" ? pct(valor) : metrica.formato === "m" ? `${decimal(valor)} m` : decimal(valor, metrica.formato === "n2" ? 2 : 1)
);
const ordinal = (n: number, de: number) => tf("{n}º de {de}", { n, de });
const apellido = (nombre: string) => nombre.trim().split(/\s+/).slice(-1)[0] ?? nombre;

// ---- Los datos de cada lado ----------------------------------------------------------------

/** Todo lo de un equipo en su liga y temporada: partidos, forma, fases y plantel. */
function useLadoDelPartido(perfil: PerfilEquipo) {
  const partes = partesDeClave(perfil.clave);
  const { datos: catalogo } = useCatalogo();
  const competicion = catalogo?.find((c) => c.competition_id === partes.competicion && c.season_id === partes.temporada) ?? null;
  const { liga, error, cargando } = usePartidosDeLiga(partes.competicion, partes.temporada);
  const forma = useFormaDeLiga(partes.competicion, partes.temporada);
  const plantel = usePlantelDeLiga(competicion);
  const datos = useMemo(() => {
    if (!liga) return null;
    const suyos = partidosDe(liga, partes.equipo);
    if (!suyos.length) return null;
    const lecturas = lecturaDeFases(fasesDeLiga(liga, forma.datos), partes.equipo);
    const dimensiones = perfilesDeDimension(liga).get(partes.equipo) ?? [];
    return {
      suyos,
      formaciones: formacionProbable(suyos),
      lecturas,
      dimensiones,
      fuertes: fuertesYFlojos(dimensiones),
      lineas: rendimientoPorLinea(suyos),
      reciente: formaReciente(liga, partes.equipo),
    };
  }, [liga, forma.datos, partes.equipo]);
  const jugadores = useMemo(() => {
    const deSuEquipo = (plantel.datos ?? []).filter((j) => mismoEquipo(j.equipo, perfil.equipo));
    // Los que salieron de titulares y no están en las estadísticas (pocos minutos) también caben.
    const vistos = new Set(deSuEquipo.map((j) => normalizarNombre(j.nombre)));
    for (const p of datos?.suyos ?? []) for (const [puesto, nombre] of p.titulares) {
      if (!vistos.has(normalizarNombre(nombre))) {
        vistos.add(normalizarNombre(nombre));
        deSuEquipo.push({ nombre, equipo: perfil.equipo, posicion: puesto, minutos: 0, indice: null, perfil: "" });
      }
    }
    return deSuEquipo.sort((x, y) => y.minutos - x.minutos);
  }, [plantel.datos, perfil.equipo, datos]);
  return {
    partes, liga, datos, jugadores, error, cargando,
    formaCargando: forma.cargando, con360: (forma.datos?.con360 ?? 0) > 0, formaError: forma.error,
    plantelCargando: plantel.cargando,
  };
}

// ---- La pizarra ------------------------------------------------------------------------------

type Lado = "a" | "b";
type Arrastre = { lado: Lado; origen: "banca" | "puesto"; valor: string | number };

/** El nombre de la plantilla, contra el de los titulares: StatsBomb a veces los escribe distinto. */
const mismoJugador = (x: string, y: string) => normalizarNombre(x) === normalizarNombre(y);

function FichaDeJugador({ lado, codigo, nombre, jugador, x, y, seleccionada, onTocar, onSoltar, onArrastrar }: {
  lado: Lado; codigo: string; nombre: string | null; jugador: JugadorDePlantel | null; x: number; y: number;
  seleccionada: boolean; onTocar: () => void; onSoltar: (evento: DragEvent) => void; onArrastrar: (evento: DragEvent) => void;
}) {
  return <button type="button" className={`pizarra-ficha ${lado}${seleccionada ? " elegida" : ""}${nombre ? "" : " vacia"}`}
    style={{ left: `${(x + 2) / 124 * 100}%`, top: `${(y + 2) / 84 * 100}%` } as CSSProperties}
    draggable={Boolean(nombre)} onDragStart={onArrastrar} onDragOver={(evento) => evento.preventDefault()} onDrop={onSoltar} onClick={onTocar}
    title={nombre ? `${nombre} · ${codigo}${jugador?.minutos ? ` · ${Math.round(jugador.minutos)}′` : ""}${jugador?.indice != null ? ` · ${t("índice")} ${jugador.indice}` : ""}` : codigo}>
    <i>{jugador?.indice != null ? jugador.indice : codigo}</i>
    <span>{nombre ? apellido(nombre) : codigo}</span>
  </button>;
}

function Banca({ lado, equipo, jugadores, enCancha, seleccion, onTocar, onSoltar, onArrastrar, cargando }: {
  lado: Lado; equipo: string; jugadores: JugadorDePlantel[]; enCancha: (nombre: string) => boolean; seleccion: string | null;
  onTocar: (nombre: string) => void; onSoltar: (evento: DragEvent) => void; onArrastrar: (evento: DragEvent, nombre: string) => void; cargando: boolean;
}) {
  const libres = jugadores.filter((j) => !enCancha(j.nombre));
  return <div className={`pizarra-banca ${lado}`} onDragOver={(evento) => evento.preventDefault()} onDrop={onSoltar}>
    <b>{tf("Plantel de {equipo}", { equipo })}</b>
    {cargando && !jugadores.length && <small>{t("Leyendo el plantel…")}</small>}
    <ul>
      {libres.slice(0, 30).map((j) => <li key={j.nombre}>
        <button type="button" draggable onDragStart={(evento) => onArrastrar(evento, j.nombre)} onClick={() => onTocar(j.nombre)}
          className={seleccion === j.nombre ? "elegida" : undefined}>
          <span className="pizarra-banca-puesto">{j.posicion || "—"}</span>
          <span className="pizarra-banca-nombre">{j.nombre}</span>
          <span className="pizarra-banca-cifras">{j.indice != null ? j.indice : "—"}<small>{`${Math.round(j.minutos)}′`}</small></span>
        </button>
      </li>)}
    </ul>
  </div>;
}

// ---- Textos ----------------------------------------------------------------------------------

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

/** Las métricas de forma que, sin StatsBomb 360, son una estimación. */
const ESTIMADAS = new Set(["largo_bloque", "ancho_bloque"]);

/** "Pacific FC: altura de la defensa 47,1 m · bloque alto · 2º de 8". */
function textoDePrueba(equipo: string, lectura: LecturaDeMetrica, estimada: boolean) {
  const etiqueta = t(lectura.metrica.etiqueta).split(" (")[0];
  // "Altura de la presión" se escribe en minúscula dentro de la frase; "PPDA" y "xG", no.
  const nombre = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(etiqueta) ? etiqueta[0].toLowerCase() + etiqueta.slice(1) : etiqueta;
  return `${equipo}: ${nombre} ${estimada ? "≈" : ""}${formatoFase(lectura.metrica, lectura.valor)}${lectura.palabra ? ` · ${t(lectura.palabra)}` : ""} · ${ordinal(lectura.puesto, lectura.equipos)}`;
}

// ---- La sección ----------------------------------------------------------------------------

export function ElPartido({ a, b }: { a: PerfilEquipo; b: PerfilEquipo }) {
  const ladoA = useLadoDelPartido(a);
  const ladoB = useLadoDelPartido(b);
  const mismaLiga = ladoA.partes.competicion === ladoB.partes.competicion && ladoA.partes.temporada === ladoB.partes.temporada;
  const nivelA = nivelDeLiga(null, a.competicion);
  const nivelB = nivelDeLiga(null, b.competicion);

  // ---- Los dibujos y los onces de la pizarra ----
  const probableA = ladoA.datos?.formaciones[0]?.formacion ?? "4231";
  const probableB = ladoB.datos?.formaciones[0]?.formacion ?? "4231";
  const [elegidaA, setElegidaA] = useState<string | null>(null);
  const [elegidaB, setElegidaB] = useState<string | null>(null);
  const [manualA, setManualA] = useState<{ formacion: string; nombres: Array<string | null> } | null>(null);
  const [manualB, setManualB] = useState<{ formacion: string; nombres: Array<string | null> } | null>(null);
  const [seleccion, setSeleccion] = useState<Arrastre | null>(null);
  // Al cambiar de equipo, la pizarra vuelve a lo suyo.
  const claveDelCruce = `${a.clave}|${b.clave}`;
  const [cruceDeLaPizarra, setCruceDeLaPizarra] = useState(claveDelCruce);
  if (cruceDeLaPizarra !== claveDelCruce) {
    setCruceDeLaPizarra(claveDelCruce);
    setElegidaA(null); setElegidaB(null); setManualA(null); setManualB(null); setSeleccion(null);
  }
  const formA = elegidaA ?? probableA;
  const formB = elegidaB ?? probableB;
  const puestosA = useMemo(() => puestosDe(formA, ladoA.datos ? onceTipico(ladoA.datos.suyos, formA) : null), [formA, ladoA.datos]);
  const puestosB = useMemo(() => puestosDe(formB, ladoB.datos ? onceTipico(ladoB.datos.suyos, formB) : null), [formB, ladoB.datos]);
  const onceA = useMemo(() => (manualA?.formacion === formA ? manualA.nombres : oncePara(puestosA, ladoA.datos?.suyos ?? [], formA)), [manualA, formA, puestosA, ladoA.datos]);
  const onceB = useMemo(() => (manualB?.formacion === formB ? manualB.nombres : oncePara(puestosB, ladoB.datos?.suyos ?? [], formB)), [manualB, formB, puestosB, ladoB.datos]);
  const opcionesDeDibujo = (lado: typeof ladoA) => [...new Set([...(lado.datos?.formaciones.map((f) => f.formacion) ?? []), ...Object.keys(DIBUJOS)])];
  const jugadorDe = (lado: typeof ladoA, nombre: string | null) => (nombre ? lado.jugadores.find((j) => mismoJugador(j.nombre, nombre)) ?? null : null);

  // Mover jugadores: de la banca a un puesto, de un puesto a otro (se cambian) o de vuelta a la banca.
  const mover = (lado: Lado, origen: Arrastre, destino: { tipo: "puesto"; indice: number } | { tipo: "banca" }) => {
    const nombres = [...(lado === "a" ? onceA : onceB)];
    const formacion = lado === "a" ? formA : formB;
    if (destino.tipo === "banca") {
      if (origen.origen === "puesto") nombres[origen.valor as number] = null;
    } else if (origen.origen === "banca") {
      const yaEsta = nombres.findIndex((n) => n !== null && mismoJugador(n, origen.valor as string));
      if (yaEsta >= 0) nombres[yaEsta] = nombres[destino.indice];
      nombres[destino.indice] = origen.valor as string;
    } else {
      const desde = origen.valor as number;
      [nombres[desde], nombres[destino.indice]] = [nombres[destino.indice], nombres[desde]];
    }
    (lado === "a" ? setManualA : setManualB)({ formacion, nombres });
    setSeleccion(null);
  };
  const leerArrastre = (evento: DragEvent): Arrastre | null => {
    try { return JSON.parse(evento.dataTransfer.getData("text/plain")) as Arrastre; } catch { return null; }
  };
  const empezar = (evento: DragEvent, arrastre: Arrastre) => {
    evento.dataTransfer.setData("text/plain", JSON.stringify(arrastre));
    evento.dataTransfer.effectAllowed = "move";
  };

  // ---- Lo que sale de la pizarra y de los datos ----
  const consejos = useMemo(() => consejosDePizarra(puestosA, puestosB, {
    a: (id) => (ladoA.datos ? lecturaDe(ladoA.datos.lecturas, id) : null),
    b: (id) => (ladoB.datos ? lecturaDe(ladoB.datos.lecturas, id) : null),
  }, formB), [puestosA, puestosB, ladoA.datos, ladoB.datos, formB]);
  const choque = useMemo(() => choqueDeDibujos(estructuraDe(puestosA), estructuraDe(puestosB)), [puestosA, puestosB]);
  const delMismo = useMemo(() => {
    if (!mismaLiga || !ladoA.liga || !ladoA.datos || !ladoB.datos) return null;
    return {
      esperado: prediccionDelPartido(ladoA.datos.suyos, ladoB.datos.suyos, mediasDeLiga(ladoA.liga)),
      ventajasA: ventajas(ladoA.datos.dimensiones, ladoB.datos.dimensiones),
      ventajasB: ventajas(ladoB.datos.dimensiones, ladoA.datos.dimensiones),
      previos: enfrentamientos(ladoA.datos.suyos, ladoB.partes.equipo),
    };
  }, [mismaLiga, ladoA.liga, ladoA.datos, ladoB.datos, ladoB.partes.equipo]);
  const crucesA = useMemo(() => crucesDeEstilo(a, b), [a, b]);
  const crucesB = useMemo(() => crucesDeEstilo(b, a), [a, b]);

  const textoConsejo = (consejo: Consejo) => tf(t(consejo.texto), { a: a.equipo, b: b.equipo, n: consejos.medio[0], m: consejos.medio[1] });
  const pruebasDe = (consejo: Consejo) => consejo.pruebas.map((p) => ({
    texto: textoDePrueba(p.equipo === "a" ? a.equipo : b.equipo, p.lectura, ESTIMADAS.has(p.lectura.metrica.id) && !(p.equipo === "a" ? ladoA.con360 : ladoB.con360)),
    apoya: p.apoya,
  }));
  const ESTADO: Record<Consejo["estado"], string> = { respaldado: "Respaldado por los datos", pizarra: "Solo pizarra", contradicho: "Los datos no lo respaldan" };
  const itemDeConsejo = (c: Consejo) => <li key={c.id} className={`consejo-${c.estado}`}>
    <b>{textoConsejo(c)}</b>
    <em className="partido-estado-consejo">{t(ESTADO[c.estado])}</em>
    {pruebasDe(c).map((p) => <span key={p.texto} className={`partido-prueba${p.apoya === true ? " apoya" : p.apoya === false ? " contradice" : ""}`}>
      {p.apoya === true ? "✓ " : p.apoya === false ? "✗ " : ""}{p.texto}
    </span>)}
  </li>;

  const cabecera = <header className="partido-cabecera">
    <Antetitulo>{t("EL PARTIDO")}</Antetitulo>
    <h3>
      <span className="con-escudo"><Escudo equipo={a.equipo} liga={a.competicion} tamano={22} respaldo />{a.equipo}</span>
      <em>{t("contra")}</em>
      <span className="con-escudo"><Escudo equipo={b.equipo} liga={b.competicion} tamano={22} respaldo />{b.equipo}</span>
    </h3>
    <p className="partido-ligas">
      {[{ perfil: a, nivel: nivelA }, { perfil: b, nivel: nivelB }].map(({ perfil, nivel }) => (
        <span key={perfil.clave}>{`${perfil.equipo}: ${perfil.competicion} ${perfil.temporada}${nivel ? ` · Opta ${decimal(nivel.rating)}` : ""}`}</span>
      ))}
    </p>
  </header>;

  if (!ladoA.datos || !ladoB.datos) {
    const fallo = ladoA.error || ladoB.error;
    return <section className="partido">{cabecera}
      <p className="partido-estado" role="status">{fallo || (ladoA.cargando || ladoB.cargando
        ? tf("Leyendo los partidos de {liga}… la primera vez tarda unos minutos.", { liga: ladoA.cargando ? `${a.competicion} ${a.temporada}` : `${b.competicion} ${b.temporada}` })
        : t("No hay partidos jugados de los dos en esas temporadas."))}</p>
    </section>;
  }

  const datosA = ladoA.datos;
  const datosB = ladoB.datos;
  const enCancha = (once: Array<string | null>) => (nombre: string) => once.some((n) => n !== null && mismoJugador(n, nombre));
  const posesion = delMismo?.esperado.find((e) => e.metrica.id === "posesion");
  const xg = delMismo?.esperado.find((e) => e.metrica.id === "xg");
  const ppda = delMismo?.esperado.find((e) => e.metrica.id === "ppda");
  const presionaMas = ppda && Number.isFinite(ppda.a) && Number.isFinite(ppda.b) ? (ppda.a < ppda.b ? a.equipo : b.equipo) : "";
  // Las claves: lo respaldado primero (ya vienen ordenados) y nunca lo que los datos contradicen.
  const claves = {
    op: consejos.oportunidades.filter((c) => c.estado !== "contradicho").slice(0, 3),
    ri: consejos.riesgos.filter((c) => c.estado !== "contradicho").slice(0, 3),
  };
  const racha = (datos: typeof datosA) => datos.reciente.map((p) => t(p.resultado)).join(" ");

  const columnaVentajas = (equipo: string, rival: string, lista: ReturnType<typeof ventajas>, cruces: CruceDeEstilo[]) => <div>
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

  const filaLinea = (equipo: string, lineas: ReturnType<typeof rendimientoPorLinea>, lineaRival: 3 | 4): ReactNode => <tr>
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

  const lados = {
    a: { perfil: a, lado: ladoA, puestos: puestosA, once: onceA, form: formA, setForm: setElegidaA, opciones: opcionesDeDibujo(ladoA) },
    b: { perfil: b, lado: ladoB, puestos: puestosB, once: onceB, form: formB, setForm: setElegidaB, opciones: opcionesDeDibujo(ladoB) },
  };

  return <section className="partido">
    {cabecera}

    {/* ---- Las claves ---- */}
    <div className="partido-claves">
      <h4>{t("Las claves")}</h4>
      <ul className="partido-resumen">
        <li>{tf("{a} saldrá probablemente con {fa} ({pa}); {b}, con {fb} ({pb}).", {
          a: a.equipo, b: b.equipo,
          fa: formacionLegible(datosA.formaciones[0]?.formacion ?? null), pa: pct(datosA.formaciones[0]?.probabilidad ?? Number.NaN),
          fb: formacionLegible(datosB.formaciones[0]?.formacion ?? null), pb: pct(datosB.formaciones[0]?.probabilidad ?? Number.NaN),
        })}</li>
        {posesion && <li>{tf("Posesión esperada: {pa} para {a}, {pb} para {b}.", { a: a.equipo, b: b.equipo, pa: pct(posesion.a), pb: pct(posesion.b) })}</li>}
        {ppda && presionaMas && <li>{tf("Presionará más {equipo} (PPDA esperado {x} frente a {y}; menos es más presión).", {
          equipo: presionaMas, x: decimal(Math.min(ppda.a, ppda.b)), y: decimal(Math.max(ppda.a, ppda.b)),
        })}</li>}
        {xg && <li>{tf("xG esperado sin penaltis: {xa} – {xb}.", { xa: decimal(xg.a, 2), xb: decimal(xg.b, 2) })}</li>}
        <li>{tf("Cómo vienen (últimos 5, del más reciente): {a} {ra} · {b} {rb}.", { a: a.equipo, b: b.equipo, ra: racha(datosA), rb: racha(datosB) })}</li>
        {!mismaLiga && <li>{t("De ligas distintas: cada número se lee contra su propia liga, con el nivel de Opta de cada una al lado. Lo esperado partido a partido solo se calcula entre equipos de la misma liga.")}</li>}
      </ul>
      <div className="partido-dos">
        <div><p className="partido-etiqueta bueno">{tf("Para hacer daño a {b}", { b: b.equipo })}</p>
          <ul>{claves.op.map((c) => <li key={c.id}>{textoConsejo(c)}</li>)}</ul></div>
        <div><p className="partido-etiqueta malo">{tf("Para neutralizar a {b}", { b: b.equipo })}</p>
          <ul>{claves.ri.length ? claves.ri.map((c) => <li key={c.id}>{textoConsejo(c)}</li>) : <li className="partido-vacio">{t("Nada que destaque.")}</li>}</ul></div>
      </div>
    </div>

    {/* ---- La pizarra ---- */}
    <div className="partido-bloque">
      <h4>{t("La pizarra")}</h4>
      <div className="pizarra-controles">
        {(["a", "b"] as const).map((cual) => {
          const l = lados[cual];
          return <label key={cual} className={`pizarra-dibujo ${cual}`}>
            <span>{tf("Dibujo de {equipo}", { equipo: l.perfil.equipo })}</span>
            <select value={l.form} onChange={(evento) => l.setForm(evento.target.value)}>
              {l.opciones.map((f) => {
                const prob = l.lado.datos?.formaciones.find((x) => x.formacion === f);
                return <option key={f} value={f}>{prob ? `${formacionLegible(f)} · ${pct(prob.probabilidad)}` : formacionLegible(f)}</option>;
              })}
            </select>
          </label>;
        })}
        <button type="button" className="pizarra-reiniciar" onClick={() => { setElegidaA(null); setElegidaB(null); setManualA(null); setManualB(null); setSeleccion(null); }}>{t("Volver a lo probable")}</button>
      </div>
      <div className="pizarra-campo">
        <svg viewBox="-2 -2 124 84" aria-hidden="true">
          <Cesped ancho={120} largo={80} vertical={false} franja={10} />
          <rect x={0} y={0} width={120} height={80} {...CAL} />
          <line x1={60} y1={0} x2={60} y2={80} {...CAL} />
          <circle cx={60} cy={40} r={9.15} {...CAL} />
          <rect x={0} y={18} width={18} height={44} {...CAL} />
          <rect x={102} y={18} width={18} height={44} {...CAL} />
        </svg>
        {(["b", "a"] as const).map((cual) => {
          const l = lados[cual];
          return l.puestos.map((codigo, i) => {
            const [d, w] = SITIO[codigo] ?? [50, 40];
            const x = codigo === "GK" ? (cual === "a" ? 3 : 117) : cual === "a" ? 10 + d : 110 - d;
            const y = cual === "a" ? w : 80 - w;
            const nombre = l.once[i] ?? null;
            return <FichaDeJugador key={`${cual}-${i}`} lado={cual} codigo={codigo} nombre={nombre} jugador={jugadorDe(l.lado, nombre)} x={x} y={y}
              seleccionada={seleccion?.lado === cual && seleccion.origen === "puesto" && seleccion.valor === i}
              onArrastrar={(evento) => empezar(evento, { lado: cual, origen: "puesto", valor: i })}
              onSoltar={(evento) => { evento.preventDefault(); const origen = leerArrastre(evento); if (origen && origen.lado === cual) mover(cual, origen, { tipo: "puesto", indice: i }); }}
              onTocar={() => {
                if (seleccion && seleccion.lado === cual) mover(cual, seleccion, { tipo: "puesto", indice: i });
                else setSeleccion({ lado: cual, origen: "puesto", valor: i });
              }} />;
          });
        })}
      </div>
      <p className="partido-nota">{tf("{a} ataca hacia la derecha y {b} hacia la izquierda: los delanteros de uno caen sobre los centrales del otro. En cada ficha, su índice en su liga. Arrastra un jugador del plantel a un puesto (o tócalo y luego toca el puesto); dos fichas se cambian entre sí; arrastrar una ficha al plantel la saca.", { a: a.equipo, b: b.equipo })}</p>
      <div className="pizarra-bancas">
        {(["a", "b"] as const).map((cual) => {
          const l = lados[cual];
          return <Banca key={cual} lado={cual} equipo={l.perfil.equipo} jugadores={l.lado.jugadores} enCancha={enCancha(l.once)} cargando={l.lado.plantelCargando}
            seleccion={seleccion?.lado === cual && seleccion.origen === "banca" ? String(seleccion.valor) : null}
            onArrastrar={(evento, nombre) => empezar(evento, { lado: cual, origen: "banca", valor: nombre })}
            onTocar={(nombre) => setSeleccion({ lado: cual, origen: "banca", valor: nombre })}
            onSoltar={(evento) => { evento.preventDefault(); const origen = leerArrastre(evento); if (origen && origen.lado === cual) mover(cual, origen, { tipo: "banca" }); }} />;
        })}
      </div>
    </div>

    {/* ---- Lo que aconseja el cruce ---- */}
    <div className="partido-bloque partido-dos partido-consejos">
      <div>
        <h4 className="partido-etiqueta bueno">{t("Oportunidades")}</h4>
        <ul>{consejos.oportunidades.map(itemDeConsejo)}</ul>
      </div>
      <div>
        <h4 className="partido-etiqueta malo">{t("Riesgos a cuidar")}</h4>
        <ul>{consejos.riesgos.length ? consejos.riesgos.map(itemDeConsejo) : <li className="partido-vacio">{t("Nada que destaque.")}</li>}</ul>
      </div>
    </div>
    <p className="partido-nota">{t("Cada consejo sale del cruce de los dos dibujos de la pizarra (reglas de pizarra) y, debajo, los datos de la temporada, con el puesto de cada equipo en su liga: ✓ si apoyan el consejo, ✗ si dicen lo contrario. Los que los datos no respaldan van al final y no entran en las claves. Cambia un dibujo y los consejos cambian.")}</p>

    <div className="partido-bloque">
      <h4>{t("El choque de dibujos")}</h4>
      <ol className="partido-zonas">
        {choque.map((zona) => <li key={zona.zona} className={zona.ventaja ? `ventaja-${zona.ventaja}` : undefined}>
          <span>{tf(ZONA[zona.zona], { a: a.equipo, b: b.equipo })}</span>
          <b>{`${decimal(zona.a, zona.a % 1 ? 1 : 0)} – ${decimal(zona.b, zona.b % 1 ? 1 : 0)}`}</b>
          <small>{lecturaDeZona(zona, a.equipo, b.equipo)}</small>
        </li>)}
      </ol>
    </div>

    {/* ---- Las fases del juego ---- */}
    <div className="partido-bloque">
      <h4>{t("Las fases del juego")}</h4>
      {(ladoA.formaCargando || ladoB.formaCargando) && <p className="partido-estado" role="status">{t("Calculando la forma de cada equipo partido a partido (altura, bloque, presión, amplitud)… la primera vez tarda unos minutos por liga.")}</p>}
      <table className="partido-fases">
        <thead><tr><th>{t("Métrica")}</th><th>{a.equipo}</th><th>{b.equipo}</th></tr></thead>
        {FASES.map((fase) => {
          const filas = fase.metricas.map((metrica) => ({ metrica, la: lecturaDe(datosA.lecturas, metrica.id), lb: lecturaDe(datosB.lecturas, metrica.id) }))
            .filter(({ la, lb }) => la || lb);
          if (!filas.length) return null;
          const celda = (l: LecturaDeMetrica | null, con360: boolean) => (l ? <td className={`tercio-${l.tercio ?? "x"}${l.metrica.mejor ? ` mejor-${l.metrica.mejor}` : ""}`}>
            <b>{ESTIMADAS.has(l.metrica.id) && !con360 ? "≈" : ""}{formatoFase(l.metrica, l.valor)}</b>
            <small>{[l.palabra ? t(l.palabra) : "", ordinal(l.puesto, l.equipos)].filter(Boolean).join(" · ")}</small>
          </td> : <td className="sin-dato">—</td>);
          return <tbody key={fase.id}>
            <tr className="partido-fase-titulo"><th colSpan={3}>{t(fase.nombre)}</th></tr>
            {filas.map(({ metrica, la, lb }) => <tr key={metrica.id}>
              <th scope="row" title={t(metrica.etiqueta)}>{t(metrica.etiqueta)}</th>
              {celda(la, ladoA.con360)}
              {celda(lb, ladoB.con360)}
            </tr>)}
          </tbody>;
        })}
      </table>
      <p className="partido-nota">{[
        t("Media por partido de su temporada. Debajo, la lectura por tercios de su liga y su puesto en ella (1º = el que más)."),
        !(ladoA.con360 && ladoB.con360) ? t("≈: el largo y el ancho del bloque se estiman con dónde hace cada equipo sus acciones defensivas y de presión (la parte central de esas acciones, del cuartil 25 al 75); sin StatsBomb 360 no hay posición de los once en cada momento. La altura de la defensa es la de StatsBomb.") : "",
      ].filter(Boolean).join(" ")}</p>
    </div>

    {/* ---- Cómo vienen ---- */}
    <div className="partido-bloque partido-dos">
      {[{ perfil: a, datos: datosA }, { perfil: b, datos: datosB }].map(({ perfil, datos }) => <div key={perfil.clave}>
        <h4>{tf("Cómo viene {equipo}", { equipo: perfil.equipo })}</h4>
        <ol className="partido-reciente">
          {datos.reciente.map((p) => <li key={`${p.fecha}-${p.rival}`} className={`resultado-${p.resultado}`}>
            <i>{t(p.resultado)}</i>
            <span>{`${p.enCasa ? t("vs") : "@"} ${p.rival}`}<small>{`${p.fecha} · ${formacionLegible(p.formacion)}`}</small></span>
            <b>{`${p.gf}–${p.gc}`}<small>{tf("xG {f}–{c}", { f: decimal(p.xg, 2), c: decimal(p.xgContra, 2) })}</small></b>
          </li>)}
        </ol>
      </div>)}
    </div>

    {delMismo && <div className="partido-bloque">
      <h4>{t("Lo esperado")}</h4>
      <table className="partido-esperado">
        <thead><tr><th>{a.equipo}</th><th>{t("Métrica")}</th><th>{b.equipo}</th><th>{t("Media de la liga")}</th></tr></thead>
        <tbody>{delMismo.esperado.map((e) => {
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
      <p className="partido-nota">{[t("Lo que suele hacer cada uno, corregido por lo que suele conceder el rival, con un peso por métrica ajustado en partidos reales."),
        tf("Lo esperado se calibró prediciendo {n} partidos de {l} ligas solo con los anteriores a cada uno.", { n: PREDICCION_CALIBRADA.partidos.toLocaleString(numberLocale()), l: PREDICCION_CALIBRADA.ligas.length }),
        t("En gris, las que apenas se pueden predecir partido a partido (contragolpes, juego directo, balón parado): ahí manda el azar.")].join(" ")}</p>
    </div>}

    <div className="partido-bloque partido-dos">
      {columnaVentajas(a.equipo, b.equipo, delMismo?.ventajasA ?? [], crucesA)}
      {columnaVentajas(b.equipo, a.equipo, delMismo?.ventajasB ?? [], crucesB)}
    </div>

    <div className="partido-bloque partido-dos">
      {[{ perfil: a, lectura: datosA.fuertes }, { perfil: b, lectura: datosB.fuertes }].map(({ perfil, lectura }) => {
        const texto = (l: (typeof lectura.fuertes)[number]) => (l.lado === "hace"
          ? tf("{d}: {p} de la liga generándolo", { d: t(l.dimension.etiqueta), p: ordinal(l.puesto, l.equipos) })
          : tf("{d}: {p} de la liga defendiéndolo", { d: t(l.dimension.etiqueta), p: ordinal(l.puesto, l.equipos) }));
        return <div key={perfil.clave}>
          <h4 className="con-escudo">{perfil.equipo}</h4>
          <p className="partido-etiqueta bueno">{t("Fuerte")}</p>
          <ul>{lectura.fuertes.length ? lectura.fuertes.map((l) => <li key={`${l.dimension.id}-${l.lado}`}>{texto(l)}</li>) : <li className="partido-vacio">{t("Nada que destaque en su liga.")}</li>}</ul>
          <p className="partido-etiqueta malo">{t("Flojo")}</p>
          <ul>{lectura.flojos.length ? lectura.flojos.map((l) => <li key={`${l.dimension.id}-${l.lado}`}>{texto(l)}</li>) : <li className="partido-vacio">{t("Nada que flojee en su liga.")}</li>}</ul>
        </div>;
      })}
    </div>

    <div className="partido-bloque">
      <h4>{t("Contra línea de 3 y contra línea de 4")}</h4>
      <table className="partido-lineas">
        <thead><tr><th /><th>{t("Rival con línea de 3")}</th><th>{t("Rival con línea de 4")}</th></tr></thead>
        <tbody>
          {filaLinea(a.equipo, datosA.lineas, lineaDefensiva(estructuraDe(puestosB)))}
          {filaLinea(b.equipo, datosB.lineas, lineaDefensiva(estructuraDe(puestosA)))}
        </tbody>
      </table>
      <p className="partido-nota">{t("Marcada, la línea con que sale el rival de este partido. Pocos partidos dicen poco: mira el número antes que el promedio.")}</p>
    </div>

    {delMismo && delMismo.previos.length > 0 && <div className="partido-bloque">
      <h4>{t("Esta temporada entre ellos")}</h4>
      <FranjaDeCifras className="partido-previos" celdas={delMismo.previos.map((p: PartidoDeEquipo) => ({
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
