"use client";

import { useEffect, useMemo, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { Antetitulo, CAL, Cesped, FranjaDeCifras } from "./KitNight";
import { Escudo } from "./Escudo";
import { numberLocale, t, tf } from "@/lib/i18n";
import { fetchPartidosDeLiga } from "@/lib/remoteData";
import { METRICAS_ESTILO, mismoEquipo, type PerfilEquipo } from "@/lib/estiloEquipo";
import { nivelDeLiga } from "@/lib/nivelDeLiga";
import { cambioDeDibujo, type ChoqueDeZona, type CruceDeEstilo, crucesDeEstilo, enfrentamientos, equiposDeLiga, estructuraDe, formacionLegible, formacionProbable, fuertesYFlojos, type LigaPartidos, lineaDefensiva, zonasDelChoque, mediasDeLiga, MEJORA_MINIMA, mejoraDelModelo, type MetricaPartido, onceTipico, type PartidoDeEquipo, partidosDe, perfilesDeDimension, PREDICCION_CALIBRADA, prediccionDelPartido, rendimientoPorLinea, ventajas } from "@/lib/partido";
import { cambiosRecientes, FASES, fasesDeLiga, formaReciente, lecturaDe, lecturaDeFases, type LecturaDeMetrica, type MetricaDeFase } from "@/lib/fases";
import { DIBUJOS, SITIO, consejosDePizarra, oncePara, puestosDe, type Consejo } from "@/lib/pizarra";
import { normalizarNombre, useBalonParadoDeLiga, useCatalogo, useFormaDeLiga, usePlantelDeLiga, useSkillcornerDeLiga, type JugadorDePlantel } from "./useTemporadaDeLiga";
import { balonParadoDe, balonParadoDeLaLiga, lecturasDeParado, type PerfilDeParado, type Resumen as ResumenDeParado } from "@/lib/balonParado";
import { buscadorDeFisico, conSkillcorner, valoresSkillcorner, type FisicoDeJugador } from "@/lib/skillcornerPartido";
import { emparejar, mediasDeDuelo, mejorParaElDuelo, probabilidadAerea, probabilidadDeRegate, regateMedio, sitioEnPizarra, tasas, VALIDACION_DUELOS, type PerfilDeDuelo } from "@/lib/duelos";

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
  // Los porcentajes pequeños (le ganan la espalda: 0,6 %) con un decimal: redondeados salían "0 %" y "1 %".
  metrica.formato === "pct" ? (Number.isFinite(valor) && Math.abs(valor) < 0.1 ? `${decimal(valor * 100, 1)}%` : pct(valor))
    : metrica.formato === "m" ? `${decimal(valor)} m` : decimal(valor, metrica.formato === "n2" ? 2 : 1)
);
const ordinal = (n: number, de: number) => tf("{n}º de {de}", { n, de });
const apellido = (nombre: string) => nombre.trim().split(/\s+/).slice(-1)[0] ?? nombre;
/** Una fila de la tarjeta de duelo: el nuestro a la izquierda, el suyo a la derecha. */
type FilaDeDuelo = { etiqueta: string; a: number; b: number; texto: (v: number) => string; escala: [number, number] };
/** El color de un duelo: cinco puntos de ventaja sobre dos jugadores normales de su liga. */
const tonoDeDuelo = (ventaja: number) => (!Number.isFinite(ventaja) ? "igual" : ventaja >= 0.05 ? "nuestro" : ventaja <= -0.05 ? "suyo" : "igual");

// ---- Los datos de cada lado ----------------------------------------------------------------

/** Todo lo de un equipo en su liga y temporada: partidos, forma, fases y plantel. */
function useLadoDelPartido(perfil: PerfilEquipo) {
  const partes = partesDeClave(perfil.clave);
  const { datos: catalogo } = useCatalogo();
  const competicion = catalogo?.find((c) => c.competition_id === partes.competicion && c.season_id === partes.temporada) ?? null;
  const { liga, error, cargando } = usePartidosDeLiga(partes.competicion, partes.temporada);
  const forma = useFormaDeLiga(partes.competicion, partes.temporada);
  const plantel = usePlantelDeLiga(competicion);
  const sc = useSkillcornerDeLiga(competicion);
  const parado = useBalonParadoDeLiga(partes.competicion, partes.temporada);
  const datos = useMemo(() => {
    if (!liga) return null;
    const suyos = partidosDe(liga, partes.equipo);
    if (!suyos.length) return null;
    // SkillCorner, si su liga lo publica: game intelligence por equipo y el físico de sus jugadores.
    const deSkillcorner = sc.datos
      ? valoresSkillcorner(equiposDeLiga(liga).map((e) => ({ id: e.equipo, nombre: e.nombre })), sc.datos.equipos, sc.datos.jugadores)
      : new Map<number, Record<string, number>>();
    const lecturas = lecturaDeFases(conSkillcorner(fasesDeLiga(liga, forma.datos), deSkillcorner), partes.equipo);
    const dimensiones = perfilesDeDimension(liga).get(partes.equipo) ?? [];
    return {
      suyos,
      formaciones: formacionProbable(suyos),
      lecturas,
      dimensiones,
      fuertes: fuertesYFlojos(dimensiones),
      lineas: rendimientoPorLinea(suyos),
      reciente: formaReciente(liga, partes.equipo),
      // Lo que se movió de verdad en sus últimos cinco, y si cambió de dibujo.
      cambios: cambiosRecientes(liga, forma.datos, partes.equipo),
      dibujo: cambioDeDibujo(suyos),
    };
  }, [liga, forma.datos, partes.equipo, sc.datos]);
  const jugadores = useMemo(() => {
    const deSuEquipo = (plantel.datos ?? []).filter((j) => mismoEquipo(j.equipo, perfil.equipo));
    // Los que salieron de titulares y no están en las estadísticas (pocos minutos) también caben.
    const vistos = new Set(deSuEquipo.map((j) => normalizarNombre(j.nombre)));
    for (const p of datos?.suyos ?? []) for (const [puesto, nombre] of p.titulares) {
      if (!vistos.has(normalizarNombre(nombre))) {
        vistos.add(normalizarNombre(nombre));
        deSuEquipo.push({ nombre, equipo: perfil.equipo, posicion: puesto, minutos: 0, indice: null, perfil: "", duelo: null });
      }
    }
    return deSuEquipo.sort((x, y) => y.minutos - x.minutos);
  }, [plantel.datos, perfil.equipo, datos]);
  // Las medias de duelo de su liga: la base contra la que se mide cada jugador.
  const mediasDuelo = useMemo(
    () => mediasDeDuelo((plantel.datos ?? []).map((j) => j.duelo).filter((d): d is PerfilDeDuelo => d !== null)),
    [plantel.datos],
  );
  // Su balón parado y el de su liga, de referencia.
  const balonParado = useMemo(() => (parado.datos ? {
    perfil: balonParadoDe(parado.datos, partes.equipo),
    liga: balonParadoDeLaLiga(parado.datos),
  } : null), [parado.datos, partes.equipo]);
  // El físico de cada jugador (SkillCorner), por nombre: para los duelos y la pizarra.
  const fisicoDe = useMemo(() => buscadorDeFisico(sc.datos?.jugadores ?? []), [sc.datos]);
  return {
    partes, liga, datos, jugadores, error, cargando, mediasDuelo, fisicoDe, conSkillcorner: Boolean(sc.datos),
    balonParado, paradoCargando: parado.cargando, paradoError: parado.error,
    conJuegoSc: Boolean(sc.datos?.equipos.length),
    formaCargando: forma.cargando, con360: (forma.datos?.con360 ?? 0) > 0, formaError: forma.error,
    plantelCargando: plantel.cargando,
  };
}

// ---- La pizarra ------------------------------------------------------------------------------

type Lado = "a" | "b";
type Arrastre = { lado: Lado; origen: "banca" | "puesto"; valor: string | number };

/** El nombre de la plantilla, contra el de los titulares: StatsBomb a veces los escribe distinto. */
const mismoJugador = (x: string, y: string) => normalizarNombre(x) === normalizarNombre(y);

function FichaDeJugador({ lado, codigo, nombre, jugador, fisico, x, y, seleccionada, onTocar, onSoltar, onArrastrar }: {
  lado: Lado; codigo: string; nombre: string | null; jugador: JugadorDePlantel | null; x: number; y: number;
  /** Su físico de SkillCorner, si su liga lo publica: la velocidad punta va bajo el nombre. */
  fisico: FisicoDeJugador | null;
  seleccionada: boolean; onTocar: () => void; onSoltar: (evento: DragEvent) => void; onArrastrar: (evento: DragEvent) => void;
}) {
  const extras = fisico ? [
    `${t("velocidad punta")} ${decimal(fisico.psv99, 1)} km/h`,
    Number.isFinite(fisico.sprints) ? `${decimal(fisico.sprints, 1)} ${t("sprints/90")}` : "",
    Number.isFinite(fisico.rupturas) ? `${decimal(fisico.rupturas, 1)} ${t("rupturas/30")}` : "",
  ].filter(Boolean).join(" · ") : "";
  return <button type="button" className={`pizarra-ficha ${lado}${seleccionada ? " elegida" : ""}${nombre ? "" : " vacia"}`}
    style={{ left: `${(x + 2) / 124 * 100}%`, top: `${(y + 2) / 84 * 100}%` } as CSSProperties}
    draggable={Boolean(nombre)} onDragStart={onArrastrar} onDragOver={(evento) => evento.preventDefault()} onDrop={onSoltar} onClick={onTocar}
    title={nombre ? `${nombre} · ${codigo}${jugador?.minutos ? ` · ${Math.round(jugador.minutos)}′` : ""}${jugador?.indice != null ? ` · ${t("índice")} ${jugador.indice}` : ""}${extras ? ` · ${extras}` : ""}` : codigo}>
    <i>{jugador?.indice != null ? jugador.indice : codigo}</i>
    <span>{nombre ? apellido(nombre) : codigo}</span>
    {fisico && nombre && <small className="pizarra-velocidad">{`${decimal(fisico.psv99, 1)} km/h`}</small>}
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
  banda_izq: "Banda izquierda de {a}: sus laterales y extremos contra los de la derecha de {b}",
  banda_der: "Banda derecha de {a}: sus laterales y extremos contra los de la izquierda de {b}",
};

/** Dónde va cada zona en el dibujo (A ataca a la derecha): x, y, ancho, alto, en el campo de 120 × 80. */
const RECTANGULO_DE_ZONA: Record<string, [number, number, number, number]> = {
  banda_izq: [8, 0, 104, 19], salida_a: [8, 19, 33, 42], medio: [41, 19, 38, 42], salida_b: [79, 19, 33, 42], banda_der: [8, 61, 104, 19],
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
  if (zona.zona === "medio") return tf("{equipo} tiene uno más por dentro: puede tener el balón y girar entre líneas.", { equipo: quien });
  if (zona.zona === "banda_izq" || zona.zona === "banda_der") {
    return tf("{equipo} tiene {n} contra {m} en esta banda: puede doblar y llegar con centros; el otro tendrá que bascular.", {
      equipo: quien, n: Math.max(zona.a, zona.b), m: Math.min(zona.a, zona.b),
    });
  }
  return tf("{equipo} tiene más gente por fuera: puede doblar en banda y llegar con centros.", { equipo: quien });
}

const CRUCE: Record<CruceDeEstilo["id"], string> = {
  espalda: "{a} ataca la espalda y {b} defiende alto: hay espacio detrás de su línea.",
  presion_salida: "{a} presiona arriba y {b} sale jugando en corto desde atrás: robo alto probable.",
  transicion: "{a} corre al contragolpe y {b} se queda con el balón: tras cada pérdida de {b} habrá espacio.",
  contrapresion: "{a} aprieta al perder la pelota y {b} la pierde a menudo bajo presión.",
};

const etiquetaDeMetricaEstilo = (id: string) => t(METRICAS_ESTILO.find((m) => m.id === id)?.etiqueta ?? id);
const conSigno = (z: number) => `${z >= 0 ? "+" : "−"}${Math.abs(z).toFixed(1)}`;

/** Un icono por tipo de consejo, para leerlos de un vistazo. */
const TRAZO = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const ICONOS: Record<string, ReactNode> = {
  medio: <><circle cx="3.5" cy="8" r="1.6" {...TRAZO} /><circle cx="8" cy="8" r="1.6" {...TRAZO} /><circle cx="12.5" cy="8" r="1.6" {...TRAZO} /></>,
  bandas: <path d="M2 8h12M5 5 2 8l3 3M11 5l3 3-3 3" {...TRAZO} />,
  espalda: <><path d="M10 2v12" {...TRAZO} strokeDasharray="2 2" /><path d="M2 8h12M11 5l3 3-3 3" {...TRAZO} /></>,
  bloque: <><path d="M3 4v8M8 4v8M13 4v8" {...TRAZO} /></>,
  presion: <><circle cx="8" cy="8" r="6" {...TRAZO} /><circle cx="8" cy="8" r="2" {...TRAZO} /></>,
  parado: <path d="M4 14V2l8 3-8 3" {...TRAZO} />,
  contra: <path d="M9 1 3 9h4l-1 6 6-8H8z" {...TRAZO} />,
  cambio: <path d="M3 5h10l-3-3M13 11H3l3 3" {...TRAZO} />,
  escudo: <path d="M8 1.5 13.5 3.5v4.5c0 3.5-2.6 5.5-5.5 6.5-2.9-1-5.5-3-5.5-6.5V3.5z" {...TRAZO} />,
  largo: <path d="M2 12c3-8 9-8 12 0M11.5 10.5 14 12l.5-3" {...TRAZO} />,
};
const ICONO_DE_CONSEJO: Record<string, string> = {
  medio_mas: "medio", medio_menos: "medio", medio_igual: "medio",
  linea3: "bandas", amplitud: "bandas", carrileros: "bandas", su_amplitud: "bandas",
  espalda: "espalda", entre_lineas: "espalda", bloque_bajo: "bloque", linea5: "bloque",
  un_punta: "presion", su_presion: "presion",
  parado: "parado", su_parado: "parado",
  su_contra: "contra", carrileros_espalda: "contra", estrecho: "contra", linea5_espacios: "contra",
  lado_debil: "cambio", dos_puntas: "escudo", pivote: "escudo", su_balon_largo: "largo",
  presionar_salida: "presion", superar_presion: "presion", sus_rupturas: "espalda", carrera: "espalda", su_velocidad: "escudo",
};
function IconoDeConsejo({ id }: { id: string }) {
  return <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">{ICONOS[ICONO_DE_CONSEJO[id] ?? "medio"]}</svg>;
}

/** Las métricas de forma que, sin StatsBomb 360, son una estimación. */
const ESTIMADAS = new Set(["largo_bloque", "ancho_bloque"]);

/** "Pacific FC: altura de la defensa 47,1 m · bloque alto · 2º de 8". */
function textoDePrueba(equipo: string, lectura: LecturaDeMetrica, estimada: boolean) {
  const etiqueta = t(lectura.metrica.etiqueta).split(" (")[0];
  // "Altura de la presión" se escribe en minúscula dentro de la frase; "PPDA" y "xG", no.
  const nombre = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(etiqueta) ? etiqueta[0].toLowerCase() + etiqueta.slice(1) : etiqueta;
  return `${equipo}: ${nombre} ${estimada ? "≈" : ""}${formatoFase(lectura.metrica, lectura.valor)}${lectura.palabra ? ` · ${t(lectura.palabra)}` : ""} · ${ordinal(lectura.puesto, lectura.equipos)}`;
}

// ---- El balón parado -----------------------------------------------------------------------

/**
 * El área vista desde el que saca, con la portería arriba y el córner desde la
 * izquierda: el primer palo queda a la izquierda. En cada zona, una burbuja
 * con la parte de sus córners al área que cae ahí; el aro discontinuo es lo
 * normal en su liga. "En corto", junto a la esquina.
 */
function AreaDeParado({ resumen, liga, lado }: { resumen: ResumenDeParado; liga: ResumenDeParado; lado: Lado }) {
  // 2 unidades por metro: el área mide 44 × 18; el área chica, 20 × 6; la portería, 7,32.
  // Cada burbuja en su zona y la etiqueta fija debajo, dentro de la zona: con el 70 % al centro la burbuja tapaba las demás.
  const ZONAS: Array<{ id: keyof ResumenDeParado["zonas"]; x: number; y: number; etiqueta: string }> = [
    { id: "primer_palo", x: 14.5, y: 10.5, etiqueta: t("Primer palo") },
    { id: "centro", x: 44, y: 10.5, etiqueta: t("Centro") },
    { id: "segundo_palo", x: 73.5, y: 10.5, etiqueta: t("Segundo palo") },
    { id: "borde", x: 44, y: 29.5, etiqueta: t("Borde del área") },
  ];
  const radio = (p: number) => (Number.isFinite(p) ? 2 + Math.sqrt(Math.max(0, p)) * 8.5 : 0);
  const radioBorde = (p: number) => Math.min(4.6, radio(p));
  return <svg viewBox="-14 -6 116 50" className={`area-parado ${lado}`} role="img" aria-label={t("Adónde van sus córners")}>
    <rect x={-14} y={-6} width={116} height={50} className="area-parado-cesped" />
    <line x1={-14} y1={0} x2={102} y2={0} className="area-parado-linea" />
    <rect x={0} y={0} width={88} height={36} className="area-parado-linea" />
    <rect x={24} y={0} width={40} height={12} className="area-parado-linea" />
    <rect x={36.7} y={-3} width={14.6} height={3} className="area-parado-porteria" />
    <path d="M -14 4 A 4 4 0 0 0 -10 0" className="area-parado-linea" />
    <line x1={29.3} y1={0} x2={29.3} y2={24} className="area-parado-guia" />
    <line x1={58.7} y1={0} x2={58.7} y2={24} className="area-parado-guia" />
    <line x1={0} y1={24} x2={88} y2={24} className="area-parado-guia" />
    {ZONAS.map((z) => {
      const p = resumen.zonas[z.id], l = liga.zonas[z.id];
      const r = z.id === "borde" ? radioBorde : radio;
      return <g key={z.id}>
        <circle cx={z.x} cy={z.y} r={r(l)} className="area-parado-liga" />
        <circle cx={z.x} cy={z.y} r={r(p)} className="area-parado-burbuja" />
        <text x={z.x} y={z.y + 1.3} className="area-parado-pct">{pct(p)}</text>
        <text x={z.id === "borde" ? z.x + 12 : z.x} y={z.id === "borde" ? z.y + 1 : 22.6} className={z.id === "borde" ? "area-parado-zona izquierda" : "area-parado-zona"}>{z.etiqueta}</text>
      </g>;
    })}
    <g>
      <circle cx={-6.5} cy={9} r={Math.min(6, radio(resumen.enCorto))} className="area-parado-burbuja corto" />
      <text x={-6.5} y={10.3} className="area-parado-pct">{pct(resumen.enCorto)}</text>
      <text x={-6.5} y={18.5} className="area-parado-zona">{t("En corto")}</text>
    </g>
  </svg>;
}

/** Una fila métrica | equipo | liga, con la del equipo resaltada si se separa. */
function FilaDeParado({ etiqueta, valor, liga, formato = "pct", masEsPeor = false }: { etiqueta: string; valor: number; liga: number; formato?: "pct" | "n1" | "n3"; masEsPeor?: boolean }) {
  const texto = (v: number) => (formato === "pct" ? pct(v) : decimal(v, formato === "n3" ? 3 : 1));
  const diferencia = Number.isFinite(valor) && Number.isFinite(liga) && liga !== 0 ? valor / liga - 1 : 0;
  const tono = Math.abs(diferencia) < 0.15 ? "" : (diferencia > 0) !== masEsPeor ? "alto" : "bajo";
  return <tr><th scope="row">{etiqueta}</th><td className={tono}>{texto(valor)}</td><td>{texto(liga)}</td></tr>;
}

function ColumnaDeParado({ titulo, perfil, liga, lado, rival }: { titulo: string; perfil: PerfilDeParado; liga: ResumenDeParado; lado: Lado; rival: PerfilDeParado | null }) {
  const f = perfil.favor;
  return <div className="parado-columna">
    <h5>{titulo}</h5>
    <AreaDeParado resumen={f} liga={liga} lado={lado} />
    <table className="parado-tabla">
      <thead><tr><th /><th>{t("Él")}</th><th>{t("Su liga")}</th></tr></thead>
      <tbody>
        <FilaDeParado etiqueta={t("Córners por partido")} valor={f.cornersPorPartido} liga={liga.cornersPorPartido} formato="n1" />
        <FilaDeParado etiqueta={t("Cerrados, hacia la portería")} valor={f.rosca.cerrada} liga={liga.rosca.cerrada} />
        <FilaDeParado etiqueta={t("Gana el primer contacto")} valor={f.primerContacto} liga={liga.primerContacto} />
        <FilaDeParado etiqueta={t("Acaban en remate")} valor={f.remate} liga={liga.remate} />
        <FilaDeParado etiqueta={t("xG por córner")} valor={f.xgPorCorner} liga={liga.xgPorCorner} formato="n3" />
        {rival && <FilaDeParado etiqueta={t("xG por córner que concede el rival")} valor={rival.contra.xgPorCorner} liga={liga.xgPorCorner} formato="n3" />}
      </tbody>
    </table>
    <p className="parado-goles">{tf("{g} goles a balón parado en {n} partidos ({c} córners, {fa} faltas al área).", { g: f.goles, n: perfil.partidos, c: f.corners, fa: f.faltas })}</p>
    <dl className="parado-quienes">
      <dt>{t("Los saca")}</dt>
      <dd>{perfil.lanzadores.map((l) => tf("{x} ({n}, {lado}, {c} cerrados)", { x: apellido(l.nombre), n: l.corners, lado: t(l.lado === "los dos" ? "las dos bandas" : l.lado === "izquierda" ? "desde la izquierda" : "desde la derecha"), c: pct(l.cerrada) })).join(" · ") || "—"}</dd>
      <dt>{t("Gana el primer contacto")}</dt>
      <dd>{perfil.primeros.map((p) => `${apellido(p.nombre)} (${p.veces})`).join(" · ") || "—"}</dd>
      <dt>{t("Remata")}</dt>
      <dd>{perfil.rematadores.map((r) => tf("{x} ({n} jugadas con remate, {g} goles, xG {xg})", { x: apellido(r.nombre), n: r.remates, g: r.goles, xg: decimal(r.xg, 2) })).join(" · ") || "—"}</dd>
    </dl>
  </div>;
}

// ---- La sección ----------------------------------------------------------------------------

export function ElPartido({ a, b, claseHoja = "legal-page-shell", pie = null }: {
  a: PerfilEquipo;
  b: PerfilEquipo;
  /** La clase de cada hoja de impresión: El partido sale en tres. */
  claseHoja?: string;
  /** El pie de la página, al final de cada hoja impresa. */
  pie?: ReactNode;
}) {
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

  // ---- Los duelos que pone el dibujo ----
  const estaEn = (once: Array<string | null>) => (nombre: string) => once.some((n) => n !== null && mismoJugador(n, nombre));
  const duelos = useMemo(() => emparejar(puestosA, puestosB).map((par) => {
    const atacaA = par.ataca === "a";
    const ladoAtaca = atacaA ? ladoA : ladoB;
    const ladoDefiende = atacaA ? ladoB : ladoA;
    const nombreAtacante = (atacaA ? onceA : onceB)[par.puestoAtacante] ?? null;
    const nombreDefensor = (atacaA ? onceB : onceA)[par.puestoDefensor] ?? null;
    const atacante = jugadorDe(ladoAtaca, nombreAtacante);
    const defensor = jugadorDe(ladoDefiende, nombreDefensor);
    const da = atacante?.duelo ?? null;
    const dd = defensor?.duelo ?? null;
    const regate = da && dd ? probabilidadDeRegate(da, ladoAtaca.mediasDuelo, dd, ladoDefiende.mediasDuelo) : Number.NaN;
    const aereo = par.tipos.includes("aereo") && da && dd ? probabilidadAerea(da, ladoAtaca.mediasDuelo, dd, ladoDefiende.mediasDuelo) : Number.NaN;
    // El cambio que más ayuda a NUESTRO equipo (A) en este duelo, del plantel que no está en la cancha.
    const sugerencia = atacaA
      ? (dd ? mejorParaElDuelo(puestosA[par.puestoAtacante], nombreAtacante, ladoA.jugadores, estaEn(onceA),
        (perfil) => probabilidadDeRegate(perfil, ladoA.mediasDuelo, dd, ladoB.mediasDuelo)) : null)
      : (da ? mejorParaElDuelo(puestosA[par.puestoDefensor], nombreDefensor, ladoA.jugadores, estaEn(onceA),
        (perfil) => 1 - probabilidadDeRegate(da, ladoB.mediasDuelo, perfil, ladoA.mediasDuelo)) : null);
    // Para A: lo que gana en el duelo (si ataca, su regate; si defiende, frenar el del rival).
    const paraA = Number.isFinite(regate) ? (atacaA ? regate : 1 - regate) : Number.NaN;
    // La ventaja es contra dos jugadores normales de su liga: el atacante gana ≈ 58 %
    // de los regates, así que un 58 % no es ventaja de nadie.
    const medio = regateMedio(ladoAtaca.mediasDuelo);
    const ventajaA = Number.isFinite(regate) ? (atacaA ? regate - medio : medio - regate) : Number.NaN;
    const aereoA = Number.isFinite(aereo) ? (atacaA ? aereo : 1 - aereo) : Number.NaN;
    // El físico de cada uno (SkillCorner), si su liga lo publica: contexto de la carrera, no entra en el %.
    const fisAtacante = nombreAtacante ? ladoAtaca.fisicoDe(nombreAtacante) : null;
    const fisDefensor = nombreDefensor ? ladoDefiende.fisicoDe(nombreDefensor) : null;
    return {
      par, atacaA, atacante, defensor, nombreAtacante, nombreDefensor, regate, aereo, paraA, ventajaA, aereoA, sugerencia, fisAtacante, fisDefensor,
      tasaAtacante: da ? tasas(da, ladoAtaca.mediasDuelo) : null,
      tasaDefensor: dd ? tasas(dd, ladoDefiende.mediasDuelo) : null,
      mediaAtacante: ladoAtaca.mediasDuelo, mediaDefensor: ladoDefiende.mediasDuelo,
    };
  }), [puestosA, puestosB, onceA, onceB, ladoA, ladoB]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Lo que sale de la pizarra y de los datos ----
  const consejos = useMemo(() => consejosDePizarra(puestosA, puestosB, {
    a: (id) => (ladoA.datos ? lecturaDe(ladoA.datos.lecturas, id) : null),
    b: (id) => (ladoB.datos ? lecturaDe(ladoB.datos.lecturas, id) : null),
  }, formB), [puestosA, puestosB, ladoA.datos, ladoB.datos, formB]);
  const choque = useMemo(() => zonasDelChoque(puestosA, puestosB), [puestosA, puestosB]);
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
    // Lo que viene del tracking de SkillCorner lleva su sello: StatsBomb no lo ve.
    skillcorner: p.lectura.metrica.fuente === "skillcorner" || p.lectura.metrica.fuente === "fisico",
  }));

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

  /*
   * Cinco hojas: en una Legal no cabe todo y reducido no se lee. Claves y
   * recomendaciones; pizarra y duelos; fases y cómo vienen; lo esperado y el
   * resto; el balón parado. En pantalla se leen seguidas; la cabecera de
   * continuación y el pie de las primeras solo salen al imprimir.
   */
  const hoja = (n: number, contenido: ReactNode) => <div className={claseHoja}>
    <section className={`estilo-page estilo-hoja-partido partido-hoja-${n}`}>
      {n > 1 && <header className="estilo-cabecera-continuacion"><div>
        <span>{tf("EL PARTIDO · {n} DE 5", { n })}</span>
        <h2>{`${a.equipo} · ${b.equipo}`}</h2>
      </div></header>}
      {contenido}
      {pie}
    </section>
  </div>;

  if (!ladoA.datos || !ladoB.datos) {
    const fallo = ladoA.error || ladoB.error;
    return hoja(1, <section className="partido">{cabecera}
      <p className="partido-estado" role="status">{fallo || (ladoA.cargando || ladoB.cargando
        ? tf("Leyendo los partidos de {liga}… la primera vez tarda unos minutos.", { liga: ladoA.cargando ? `${a.competicion} ${a.temporada}` : `${b.competicion} ${b.temporada}` })
        : t("No hay partidos jugados de los dos en esas temporadas."))}</p>
    </section>);
  }

  const datosA = ladoA.datos;
  const datosB = ladoB.datos;
  const enCancha = (once: Array<string | null>) => (nombre: string) => once.some((n) => n !== null && mismoJugador(n, nombre));
  const posesion = delMismo?.esperado.find((e) => e.metrica.id === "posesion");
  const xg = delMismo?.esperado.find((e) => e.metrica.id === "xg");
  const ppda = delMismo?.esperado.find((e) => e.metrica.id === "ppda");
  const presionaMas = ppda && Number.isFinite(ppda.a) && Number.isFinite(ppda.b) ? (ppda.a < ppda.b ? a.equipo : b.equipo) : "";
  // Las recomendaciones: lo respaldado primero (ya vienen ordenados); lo que
  // los datos contradicen, aparte y plegado.
  const recomendaciones = {
    danar: consejos.oportunidades.filter((c) => c.estado !== "contradicho"),
    neutralizar: consejos.riesgos.filter((c) => c.estado !== "contradicho"),
    dudosas: [...consejos.oportunidades, ...consejos.riesgos].filter((c) => c.estado === "contradicho"),
  };
  /** Lo respaldado siempre; con eso, hasta cuatro por columna. El resto, plegado. */
  const columna = (lista: Consejo[]) => {
    const respaldadas = lista.filter((c) => c.estado === "respaldado").length;
    const cuantas = Math.max(4, respaldadas);
    const resto = lista.slice(cuantas);
    return <>
      <ol>{lista.length ? lista.slice(0, cuantas).map(itemDeRecomendacion) : <li className="partido-vacio">{t("Nada que destaque.")}</li>}</ol>
      {resto.length > 0 && <details className="recomendaciones-mas">
        <summary>{tf("{n} más, solo de la pizarra", { n: resto.length })}</summary>
        <ol>{resto.map(itemDeRecomendacion)}</ol>
      </details>}
    </>;
  };
  function itemDeRecomendacion(c: Consejo) { return <li key={c.id} className={`recomendacion ${c.estado}`}>
    <span className="recomendacion-icono"><IconoDeConsejo id={c.id} /></span>
    <div>
      <b>{textoConsejo(c)}</b>
      {c.estado === "pizarra" && <em className="recomendacion-origen">{t("pizarra")}</em>}
      {pruebasDe(c).length > 0 && <span className="recomendacion-datos">
        {pruebasDe(c).map((p) => <span key={p.texto} className={p.apoya === true ? "apoya" : p.apoya === false ? "contradice" : undefined}>
          {p.apoya === true ? "✓ " : p.apoya === false ? "✗ " : ""}{p.skillcorner && <i className="sello-sc" title="SkillCorner">SC</i>}{p.texto}
        </span>)}
      </span>}
    </div>
  </li>; }
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

  return <>{hoja(1, <section className="partido">
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
        {!mismaLiga && <li>{ladoA.partes.competicion === ladoB.partes.competicion
          ? t("De temporadas distintas: cada número se lee contra su propia temporada. Lo esperado partido a partido solo se calcula entre equipos de la misma liga y temporada.")
          : t("De ligas distintas: cada número se lee contra su propia liga, con el nivel de Opta de cada una al lado. Lo esperado partido a partido solo se calcula entre equipos de la misma liga.")}</li>}
      </ul>
    </div>

    {/* ---- Recomendaciones de la data: un solo cuadro ---- */}
    <div className="partido-recomendaciones">
      <header>
        <h4>{t("Recomendaciones de la data")}</h4>
        <small>{tf("Con los dibujos de la pizarra ({fa} contra {fb}) y la temporada de cada uno. Cambia un dibujo y cambian.", { fa: formacionLegible(formA), fb: formacionLegible(formB) })}</small>
      </header>
      <div className="recomendaciones-columnas">
        <section className="danar">
          <h5><i aria-hidden="true">↗</i>{tf("Para hacerle daño a {b}", { b: b.equipo })}</h5>
          {columna(recomendaciones.danar)}
        </section>
        <section className="neutralizar">
          <h5><i aria-hidden="true">⛨</i>{tf("Para neutralizar a {b}", { b: b.equipo })}</h5>
          {columna(recomendaciones.neutralizar)}
        </section>
      </div>
      {recomendaciones.dudosas.length > 0 && <details className="recomendaciones-dudosas">
        <summary>{tf("{n} que el dibujo sugiere pero los datos no respaldan", { n: recomendaciones.dudosas.length })}</summary>
        <ol>{recomendaciones.dudosas.map(itemDeRecomendacion)}</ol>
      </details>}
      <p className="recomendaciones-leyenda">{t("✓ el dato apoya la recomendación · ✗ dice lo contrario · «pizarra»: solo lo dice el cruce de dibujos. Cada dato, con el puesto del equipo en su liga.")}</p>
    </div>

  </section>)}
  {hoja(2, <section className="partido">
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
          {duelos.map((d, i) => {
            const [x1, y1] = sitioEnPizarra((d.atacaA ? puestosA : puestosB)[d.par.puestoAtacante], d.atacaA ? "a" : "b");
            const [x2, y2] = sitioEnPizarra((d.atacaA ? puestosB : puestosA)[d.par.puestoDefensor], d.atacaA ? "b" : "a");
            return <line key={i} className={`pizarra-duelo ${tonoDeDuelo(d.ventajaA)}`} x1={x1} y1={y1} x2={x2} y2={y2} />;
          })}
        </svg>
        {(["b", "a"] as const).map((cual) => {
          const l = lados[cual];
          return l.puestos.map((codigo, i) => {
            const [d, w] = SITIO[codigo] ?? [50, 40];
            const x = codigo === "GK" ? (cual === "a" ? 3 : 117) : cual === "a" ? 10 + d : 110 - d;
            const y = cual === "a" ? w : 80 - w;
            const nombre = l.once[i] ?? null;
            return <FichaDeJugador key={`${cual}-${i}`} lado={cual} codigo={codigo} nombre={nombre} jugador={jugadorDe(l.lado, nombre)} fisico={nombre ? l.lado.fisicoDe(nombre) : null} x={x} y={y}
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
      <p className="partido-nota">{tf("{a} ataca hacia la derecha y {b} hacia la izquierda: los delanteros de uno caen sobre los centrales del otro. En cada ficha, su índice en su liga y, en verde, su velocidad punta de SkillCorner si su liga lo publica. Arrastra un jugador del plantel a un puesto (o tócalo y luego toca el puesto); dos fichas se cambian entre sí; arrastrar una ficha al plantel la saca.", { a: a.equipo, b: b.equipo })}</p>
      <div className="pizarra-duelos">
        <h5>{t("Duelos clave")}</h5>
        <ol>
          {[...duelos].filter((d) => Number.isFinite(d.paraA)).sort((x, y) => Math.abs(y.ventajaA) - Math.abs(x.ventajaA)).map((d, i) => {
            const tono = tonoDeDuelo(d.ventajaA);
            const atac = d.nombreAtacante ?? "—";
            const def = d.nombreDefensor ?? "—";
            const puestoNuestro = d.atacaA ? d.par.puestoAtacante : d.par.puestoDefensor;
            // Siempre el nuestro a la izquierda y el suyo a la derecha, ataque quien ataque.
            const nuestro = d.atacaA ? { nombre: atac, tasa: d.tasaAtacante, fis: d.fisAtacante, puesto: puestosA[d.par.puestoAtacante] } : { nombre: def, tasa: d.tasaDefensor, fis: d.fisDefensor, puesto: puestosA[d.par.puestoDefensor] };
            const suyo = d.atacaA ? { nombre: def, tasa: d.tasaDefensor, fis: d.fisDefensor, puesto: puestosB[d.par.puestoDefensor] } : { nombre: atac, tasa: d.tasaAtacante, fis: d.fisAtacante, puesto: puestosB[d.par.puestoAtacante] };
            const todas: FilaDeDuelo[] = [
              { etiqueta: d.atacaA ? t("Regate · completa / frena") : t("Regate · frena / completa"),
                a: (d.atacaA ? d.tasaAtacante?.regate : d.tasaDefensor?.frena) ?? Number.NaN, b: (d.atacaA ? d.tasaDefensor?.frena : d.tasaAtacante?.regate) ?? Number.NaN, texto: pct, escala: [0.3, 0.9] },
              { etiqueta: t("Aéreos ganados"), a: nuestro.tasa?.aereo ?? Number.NaN, b: suyo.tasa?.aereo ?? Number.NaN, texto: pct, escala: [0.2, 0.8] },
              { etiqueta: t("Velocidad punta (km/h)"), a: nuestro.fis?.psv99 ?? Number.NaN, b: suyo.fis?.psv99 ?? Number.NaN, texto: (v) => decimal(v, 1), escala: [26, 34] },
              { etiqueta: t("Sprints por 90′"), a: nuestro.fis?.sprints ?? Number.NaN, b: suyo.fis?.sprints ?? Number.NaN, texto: (v) => decimal(v, 1), escala: [0, 30] },
              { etiqueta: t("Rupturas por 30′"), a: nuestro.fis?.rupturas ?? Number.NaN, b: suyo.fis?.rupturas ?? Number.NaN, texto: (v) => decimal(v, 1), escala: [0, 3] },
            ];
            const filas = todas.filter((f) => Number.isFinite(f.a) || Number.isFinite(f.b));
            const ancho = (v: number, [lo, hi]: [number, number]) => (Number.isFinite(v) ? Math.max(4, Math.min(100, ((v - lo) / (hi - lo)) * 100)) : 0);
            const carrera = d.fisAtacante && d.fisDefensor ? d.fisAtacante.psv99 - d.fisDefensor.psv99 : Number.NaN;
            return <li key={i} className={`tarjeta-duelo ${tono}`}>
              <header>
                <span className="lado-a"><b>{apellido(nuestro.nombre)}</b><small>{nuestro.puesto}</small></span>
                <em>{d.atacaA ? t("ataca") : t("defiende")}</em>
                <span className="lado-b"><b>{apellido(suyo.nombre)}</b><small>{suyo.puesto}</small></span>
              </header>
              <div className="duelo-veredicto">
                <strong>{pct(d.paraA)}</strong>
                <span>{d.atacaA ? tf("de completar el regate para {x}", { x: apellido(atac) }) : tf("de frenar el regate de {x}", { x: apellido(atac) })}</span>
                <small title={t("Frente a dos jugadores normales de su liga")}>{`${d.ventajaA >= 0 ? "+" : "−"}${Math.abs(Math.round(d.ventajaA * 100))}`}</small>
              </div>
              <ul className="duelo-barras">
                {filas.map((f) => {
                  const ganaA = Number.isFinite(f.a) && Number.isFinite(f.b) && f.a > f.b;
                  const ganaB = Number.isFinite(f.a) && Number.isFinite(f.b) && f.b > f.a;
                  return <li key={f.etiqueta}>
                    <span className={ganaA ? "valor gana" : "valor"}>{Number.isFinite(f.a) ? f.texto(f.a) : "—"}</span>
                    <i className="barra a"><u style={{ width: `${ancho(f.a, f.escala)}%` }} /></i>
                    <small>{f.etiqueta}</small>
                    <i className="barra b"><u style={{ width: `${ancho(f.b, f.escala)}%` }} /></i>
                    <span className={ganaB ? "valor gana" : "valor"}>{Number.isFinite(f.b) ? f.texto(f.b) : "—"}</span>
                  </li>;
                })}
              </ul>
              <p className="duelo-lectura">
                {Number.isFinite(d.aereo) && <span className={`duelo-aereo ${d.aereoA >= 0.6 ? "nuestro" : d.aereoA <= 0.4 ? "suyo" : "igual"}`}>{tf("Aéreo: {p} para {x}.", { p: pct(d.aereoA), x: apellido(nuestro.nombre) })}</span>}
                {Number.isFinite(carrera) && Math.abs(carrera) >= 0.5 && <span className="duelo-carrera">{tf("Carrera: {x} es {v} km/h más rápido.", { x: apellido(carrera > 0 ? atac : def), v: decimal(Math.abs(carrera), 1) })}</span>}
                <span className="duelo-intentos">{tf("{x} intenta ≈{n} regates por partido.", { x: apellido(atac), n: decimal(d.tasaAtacante?.intentosRegate90 ?? Number.NaN) })}</span>
              </p>
              {d.sugerencia && <button type="button" className="pizarra-sugerencia"
                onClick={() => mover("a", { lado: "a", origen: "banca", valor: d.sugerencia!.jugador.nombre }, { tipo: "puesto", indice: puestoNuestro })}>
                {tf("Probar a {j}: {p} ({g})", { j: d.sugerencia.jugador.nombre, p: pct(d.sugerencia.valor), g: `+${Math.round(d.sugerencia.ganancia * 100)}` })}
              </button>}
            </li>;
          })}
        </ol>
        <p className="partido-nota">{[
          t("Cada atacante contra el defensor que le queda enfrente en la pizarra. La probabilidad es para tu equipo: ganar el regate si ataca, frenarlo si defiende. Log5 con las tasas de cada uno en su temporada, encogidas hacia la media de su liga según los intentos que las sostienen. «Probar a» propone a quien del plantel lo haría mejor en ese duelo (450′ o más y su puesto habitual cerca); un toque lo pone."),
          tf("Probado con {n} partidos reales de 2026 en {l} ligas: en el aéreo, quien sale con {u} o más lo gana el {g}; el regate depende poco de quién encara a quién (el atacante gana ≈58 % de los regates en estas ligas), así que el color marca la ventaja sobre la media de su liga y conviene leerlo como tendencia.", {
            n: VALIDACION_DUELOS.partidos, l: VALIDACION_DUELOS.ligas,
            u: pct(VALIDACION_DUELOS.aereo.umbral), g: pct(VALIDACION_DUELOS.aereo.gana),
          }),
          t("Velocidad, sprints y rupturas son de SkillCorner (si su liga lo publica): dicen quién gana la carrera a la espalda, pero no entran en el %, porque en 20.029 duelos reales de 2026 la velocidad punta no cambió quién ganaba el regate ni el aéreo."),
          !mismaLiga ? t("De ligas o temporadas distintas: la tasa de cada uno es contra rivales de su liga, sin ajustar por nivel.") : "",
        ].filter(Boolean).join(" ")}</p>
      </div>
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


    <div className="partido-bloque">
      <h4>{t("El choque de dibujos")}</h4>
      {/* Los dos onces sobre el campo y, en cada zona, quién tiene más gente:
          en el color de A si es A, en blanco si es B, sin color si empatan. */}
      <div className="choque-rejilla">
      <div className="choque-campo">
        <svg viewBox="-2 -2 124 84" role="img" aria-label={t("El choque de dibujos")}>
          <Cesped ancho={120} largo={80} vertical={false} franja={10} />
          <rect x={0} y={0} width={120} height={80} {...CAL} />
          <line x1={60} y1={0} x2={60} y2={80} {...CAL} />
          <circle cx={60} cy={40} r={9.15} {...CAL} />
          <rect x={0} y={18} width={18} height={44} {...CAL} />
          <rect x={102} y={18} width={18} height={44} {...CAL} />
          {choque.map((zona) => {
            const [x, y, w, h] = RECTANGULO_DE_ZONA[zona.zona] ?? [0, 0, 0, 0];
            return <rect key={zona.zona} x={x + 0.6} y={y + 0.6} width={w - 1.2} height={h - 1.2} rx={2}
              className={`choque-zona ${zona.ventaja ? `ventaja-${zona.ventaja}` : "igual"}`} />;
          })}
          {(["a", "b"] as const).map((cual) => (cual === "a" ? puestosA : puestosB).map((codigo, i) => {
            const [x, y] = sitioEnPizarra(codigo, cual);
            return <circle key={`${cual}-${i}`} cx={x} cy={y} r={2.1} className={`choque-jugador ${cual}`} />;
          }))}
          {/* Las cifras, encima de los jugadores, en una píldora: arriba en las zonas del medio, al centro en las bandas. */}
          {choque.map((zona) => {
            const [x, y, w, h] = RECTANGULO_DE_ZONA[zona.zona] ?? [0, 0, 0, 0];
            const enBanda = zona.zona.startsWith("banda");
            const cx = x + w / 2, cy = enBanda ? y + h / 2 : y + 5;
            return <g key={zona.zona} className={`choque-etiqueta ${zona.ventaja ? `ventaja-${zona.ventaja}` : "igual"}`}>
              <rect x={cx - 8.5} y={cy - 3.6} width={17} height={7.2} rx={3.6} />
              <text x={cx} y={cy + 2.1} className="choque-cifra">
                <tspan className="a">{zona.a}</tspan><tspan className="contra">{" – "}</tspan><tspan className="b">{zona.b}</tspan>
              </text>
            </g>;
          })}
        </svg>
        <p className="choque-leyenda"><span className="a">{a.equipo}</span><span className="b">{b.equipo}</span><small>{tf("{a} ataca hacia la derecha.", { a: a.equipo })}</small></p>
      </div>
      <ol className="partido-zonas">
        {choque.map((zona) => <li key={zona.zona} className={zona.ventaja ? `ventaja-${zona.ventaja}` : undefined}>
          <span>{tf(ZONA[zona.zona], { a: a.equipo, b: b.equipo })}</span>
          <b>{`${zona.a} – ${zona.b}`}</b>
          <small>{lecturaDeZona(zona, a.equipo, b.equipo)}</small>
        </li>)}
      </ol>
      </div>
    </div>

  </section>)}
  {hoja(3, <section className="partido">
    {/* ---- Las fases del juego ---- */}
    <div className="partido-bloque">
      <h4>{t("Las fases del juego")}</h4>
      {(ladoA.formaCargando || ladoB.formaCargando) && <p className="partido-estado" role="status">{t("Calculando la forma de cada equipo partido a partido (altura, bloque, presión, amplitud)… la primera vez tarda unos minutos por liga.")}</p>}
      {/* En dos columnas: con las filas de SkillCorner la tabla pasaba de 70 filas y la hoja salía al 66 % en el PDF. */}
      <div className="partido-fases-dos">
        {[FASES.filter((fase) => fase.id === "con" || fase.id === "perdida"), FASES.filter((fase) => fase.id !== "con" && fase.id !== "perdida")].map((grupo, k) => <table key={k} className="partido-fases">
          <thead><tr><th>{t("Métrica")}</th><th>{a.equipo}</th><th>{b.equipo}</th></tr></thead>
          {grupo.map((fase) => {
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
                <th scope="row" title={t(metrica.ayuda ?? metrica.etiqueta)}>{t(metrica.etiqueta)}</th>
                {celda(la, ladoA.con360)}
                {celda(lb, ladoB.con360)}
              </tr>)}
            </tbody>;
          })}
        </table>)}
      </div>
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
        <div className="partido-cambios">
          <h5>{t("Lo que cambió en sus últimos 5")}</h5>
          {datos.dibujo && <p className="partido-cambio-dibujo">{datos.dibujo.tipo === "linea"
            ? tf("Defiende con línea de {ahora} en los últimos {n} ({d}); antes, con línea de {antes}.", { ahora: datos.dibujo.ahora, antes: datos.dibujo.antes, n: datos.dibujo.partidos, d: formacionLegible(datos.dibujo.dibujoAhora) })
            : tf("Los últimos {n}, con {ahora}; antes, sobre todo {antes}.", { n: datos.dibujo.partidos, ahora: formacionLegible(datos.dibujo.ahora), antes: formacionLegible(datos.dibujo.antes) })}</p>}
          {datos.cambios.length ? <ul>
            {datos.cambios.slice(0, 5).map((c) => {
              const sube = c.reciente > c.antes;
              const bueno = c.metrica.mejor ? (c.metrica.mejor === "alto") === sube : null;
              return <li key={c.metrica.id} className={bueno === null ? "neutro" : bueno ? "mejora" : "empeora"} title={c.metrica.ayuda ? t(c.metrica.ayuda) : undefined}>
                <i aria-hidden="true">{sube ? "▲" : "▼"}</i>
                <span>{t(c.metrica.etiqueta)}</span>
                <b>{formatoFase(c.metrica, c.antes)}<small>→</small>{formatoFase(c.metrica, c.reciente)}</b>
              </li>;
            })}
          </ul> : !datos.dibujo && <p className="partido-cambios-nada">{t("Sin cambios claros: sus últimos 5 se parecen al resto de su temporada.")}</p>}
        </div>
      </div>)}
    </div>
    <p className="partido-nota">{t("Cambios: la media de sus últimos 5 partidos frente al resto de su temporada (antes → ahora), solo lo que se mueve más de dos errores típicos con su propia variación partido a partido. Verde, a mejor para ese equipo; rojo, a peor. Se miran unas treinta métricas, así que uno por equipo puede ser azar. Dibujo: los últimos 3 con la misma línea o el mismo dibujo, distinto del que más usó antes.")}</p>

  </section>)}
  {hoja(4, <section className="partido">
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
  </section>)}
  {hoja(5, <section className="partido">
    {/* ---- El balón parado ---- */}
    <div className="partido-bloque">
      <h4>{t("Balón parado")}</h4>
      {(ladoA.paradoCargando || ladoB.paradoCargando) && <p className="partido-estado" role="status">{t("Leyendo cada córner y falta al área de la liga… la primera vez tarda unos minutos.")}</p>}
      {(ladoA.paradoError || ladoB.paradoError) && <p className="partido-estado" role="status">{ladoA.paradoError || ladoB.paradoError}</p>}
      {ladoB.balonParado?.perfil && ladoA.balonParado?.perfil && (() => {
        const suyo = ladoB.balonParado.perfil!, nuestro = ladoA.balonParado.perfil!;
        const lecturas = lecturasDeParado(suyo, mismaLiga ? nuestro : null, ladoB.balonParado.liga);
        return <>
          {lecturas.length > 0 && <ul className="parado-lecturas">
            {lecturas.slice(0, 5).map((l, i) => <li key={i}>{tf(t(l.texto), l.valores)}</li>)}
          </ul>}
          <div className="parado-dos">
            <ColumnaDeParado titulo={tf("Lo que tienes que defender: los córners de {b}", { b: b.equipo })} perfil={suyo} liga={ladoB.balonParado.liga} lado="b" rival={null} />
            <ColumnaDeParado titulo={tf("Lo tuyo contra su defensa: los córners de {a}", { a: a.equipo })} perfil={nuestro} liga={ladoA.balonParado.liga} lado="a" rival={mismaLiga ? suyo : null} />
          </div>
        </>;
      })()}
      <p className="partido-nota">{t("De los eventos de StatsBomb: cada córner y cada falta lateral al área. Las zonas son desde el que saca, con el córner desde la izquierda: el primer palo es el del lado del saque. Burbuja, la parte de sus córners al área que cae ahí; aro discontinuo, lo normal en su liga. Una frase arriba solo si se separa de su liga lo bastante (diez puntos con al menos 25 córners detrás).")}</p>
    </div>
  </section>)}</>;
}
