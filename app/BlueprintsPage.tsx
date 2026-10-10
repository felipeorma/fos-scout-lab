"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Desplegable } from "./BarraDeFiltros";
import { CanchaFlujo } from "./CanchaFlujo";
import { Escudo } from "./Escudo";
import { FichaEquipo, claveDe, pedirLiga } from "./FlujoPage";
import { ChevronDown } from "./Icons";
import { MenuDesplegable, type OpcionDeMenu } from "./MenuDesplegable";
import { PieDeReporte } from "./PieDeReporte";
import { numberLocale, t, tf } from "@/lib/i18n";
import { esMls, gruposDeLiga } from "@/lib/conferencias";
import { EQUIPO_PROPIO, mismoEquipo } from "@/lib/estiloEquipo";
import { AJUSTES_INICIALES, camposDeLiga, mediaDeLiga, resumenesDeLiga, type LigaFlujo } from "@/lib/flujoPosesion";
import { REEL, crearReel, type EquipoDelReel } from "@/lib/reelFlujo";
import { fetchLogo, fetchStatsbombCompetitions, motivoDeFallo, proxiedImageUrl, type ApiCompetition } from "@/lib/remoteData";
import { grabarVideo } from "@/lib/videoReel";

/**
 * Football Blueprints: ideas de análisis contadas como prompts, construidas
 * con nuestros datos.
 *
 * La primera es el flujo de posesión. Aquí no se compara a dos equipos —eso
 * lo hace su página—: se enseña la liga entera como un mapa conceptual (liga
 * → conferencias → equipos, cada uno con su cancha animada), se elige un
 * equipo para verlo en grande, y todo se exporta como un reel vertical para
 * LinkedIn.
 */

const ACENTO_REEL = "#12c48b";
const AUTOR = "Felipe Ormazabal";

/** El escudo de un equipo, cargado con CORS para poder dibujarlo en el video. */
function cargarEscudo(equipo: string, liga: string): Promise<HTMLImageElement | null> {
  return fetchLogo(equipo, liga)
    .then(({ logo }) => new Promise<HTMLImageElement | null>((resolver) => {
      if (!logo) { resolver(null); return; }
      const imagen = new Image();
      imagen.crossOrigin = "anonymous";
      const tope = window.setTimeout(() => resolver(null), 6_000);
      imagen.onload = () => { window.clearTimeout(tope); resolver(imagen); };
      imagen.onerror = () => { window.clearTimeout(tope); resolver(null); };
      imagen.src = proxiedImageUrl(logo);
    }))
    .catch(() => null);
}

const archivo = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function BlueprintsPage({ destinatario = "", logoDestinatario = "" }: { destinatario?: string; logoDestinatario?: string }) {
  const pagina = useRef<HTMLElement>(null);
  const [catalogo, setCatalogo] = useState<ApiCompetition[]>([]);
  const [claveLiga, setClaveLiga] = useState("");
  const [errorCatalogo, setErrorCatalogo] = useState("");
  const [resultado, setResultado] = useState<{ clave: string; liga?: LigaFlujo; error?: string } | null>(null);
  const [elegido, setElegido] = useState<number | null>(null);
  const [titulo, setTitulo] = useState("");
  const [subtitulo, setSubtitulo] = useState("");
  const [vistaPrevia, setVistaPrevia] = useState(false);
  const [grabando, setGrabando] = useState<number | null>(null);
  const [video, setVideo] = useState<{ url: string; tipo: string; nombre: string } | null>(null);
  const [aviso, setAviso] = useState("");
  const [intento, setIntento] = useState(0);
  const cancelar = useRef(false);
  const fichaDestacada = useRef<HTMLDivElement>(null);
  const destacar = (id: number) => {
    setElegido(id);
    const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.requestAnimationFrame(() => fichaDestacada.current?.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" }));
  };
  const lienzoPrevia = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let vivo = true;
    fetchStatsbombCompetitions()
      .then((lista) => {
        if (!vivo) return;
        const jugables = lista.filter((competicion) => competicion.hasMatches !== false);
        setCatalogo(jugables);
        /* Se abre en la MLS de este año (o su última temporada con partidos):
           es la liga del reel. Sin MLS, la CPL; si no, la primera. */
        const anio = String(new Date().getFullYear());
        const reciente = (lista: ApiCompetition[]) => [...lista]
          .sort((a, b) => String(b.season).localeCompare(String(a.season), "en", { numeric: true }))
          .find((competicion) => String(competicion.season).includes(anio)) ?? [...lista].sort((a, b) => String(b.season).localeCompare(String(a.season), "en", { numeric: true }))[0];
        const elegida = reciente(jugables.filter((competicion) => esMls(competicion.name)))
          ?? reciente(jugables.filter((competicion) => /canadian premier/i.test(competicion.name)))
          ?? jugables[0];
        if (elegida) setClaveLiga((actual) => actual || claveDe(elegida));
      })
      .catch(() => { if (vivo) setErrorCatalogo(t("El servidor local no respondió. Arranca npm run bg:server y reintenta.")); });
    return () => { vivo = false; };
  }, []);

  const competicion = catalogo.find((candidata) => claveDe(candidata) === claveLiga) ?? null;
  useEffect(() => {
    if (!competicion) return;
    let vivo = true;
    const clave = claveDe(competicion);
    pedirLiga(competicion)
      .then((respuesta) => { if (vivo) setResultado({ clave, liga: respuesta }); })
      .catch(async (fallo) => {
        const motivo = await motivoDeFallo(fallo);
        if (vivo) setResultado({ clave, error: motivo });
      });
    return () => { vivo = false; };
    // La competición se identifica por su clave; el objeto cambia con cada catálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveLiga, catalogo.length, intento]);

  const vigente = resultado?.clave === claveLiga ? resultado : null;
  const liga = vigente?.liga ?? null;
  const campos = useMemo(() => (liga ? camposDeLiga(liga, AJUSTES_INICIALES) : null), [liga]);
  const resumenes = useMemo(() => (liga ? resumenesDeLiga(liga) : []), [liga]);
  const media = useMemo(() => mediaDeLiga(resumenes), [resumenes]);
  const nombreLiga = liga?.liga || competicion?.name || "";
  const temporada = liga?.temporada || String(competicion?.season ?? "");
  const grupos = useMemo(() => {
    if (!liga) return [];
    const porNombre = new Map(liga.equipos.map((equipo) => [equipo.nombre, equipo.equipo] as const));
    return gruposDeLiga(nombreLiga, liga.equipos.map((equipo) => equipo.nombre))
      .map((grupo) => ({ nombre: grupo.nombre, equipos: grupo.equipos.map((nombre) => ({ id: porNombre.get(nombre)!, nombre })) }));
  }, [liga, nombreLiga]);
  const propio = liga?.equipos.find((equipo) => mismoEquipo(equipo.nombre, EQUIPO_PROPIO))?.equipo;
  const destacado = liga?.equipos.find((equipo) => equipo.equipo === elegido)?.equipo ?? propio ?? grupos[0]?.equipos[0]?.id ?? null;
  const nombreDestacado = liga?.equipos.find((equipo) => equipo.equipo === destacado)?.nombre ?? "";
  const raiz = esMls(nombreLiga) ? `MLS ${temporada}` : `${nombreLiga} ${temporada}`.trim();
  const tituloPorDefecto = esMls(nombreLiga)
    ? t("¿Cómo mueve el balón cada equipo de la MLS?")
    : tf("¿Cómo mueve el balón cada equipo de la {liga}?", { liga: nombreLiga });
  const subtituloPorDefecto = tf("Temporada {t} · todos los pases y conducciones de cada equipo · StatsBomb", { t: temporada });

  const estado = errorCatalogo || vigente?.error
    || (!catalogo.length ? t("Leyendo el catálogo de StatsBomb…") : "")
    || (competicion && !vigente ? tf("Leyendo los partidos de {liga} {temporada}… la primera vez tarda unos minutos.", { liga: competicion.name, temporada: competicion.season }) : "");

  /** Monta el reel con los escudos ya cargados. */
  async function prepararReel() {
    if (!liga || !campos) return null;
    const escudos = new Map<string, HTMLImageElement | null>();
    await Promise.all(liga.equipos.map(async (equipo) => { escudos.set(equipo.nombre, await cargarEscudo(equipo.nombre, nombreLiga)); }));
    const equipoDelReel = (id: number, nombre: string): EquipoDelReel => ({
      id, nombre, campo: campos.campos.get(id) ?? null, resumen: resumenes.find((r) => r.equipo === id), escudo: escudos.get(nombre) ?? null,
    });
    const fuente = getComputedStyle(pagina.current ?? document.body).fontFamily || "Arial, sans-serif";
    await document.fonts?.ready;
    return crearReel({
      grupos: grupos.map((grupo) => ({ nombre: t(grupo.nombre), equipos: grupo.equipos.map((equipo) => equipoDelReel(equipo.id, equipo.nombre)) })),
      destacado: destacado !== null ? equipoDelReel(destacado, nombreDestacado) : null,
      escala: campos.escala,
      media,
      fuente,
      acento: ACENTO_REEL,
      ancho: AJUSTES_INICIALES.ancho,
      locale: numberLocale(),
      textos: {
        rotulo: t("FOOTBALL BLUEPRINTS · FLUJO DE POSESIÓN"),
        titulo: titulo.trim() || tituloPorDefecto,
        subtitulo: subtitulo.trim() || subtituloPorDefecto,
        raiz,
        equipos: t("{n} equipos"),
        velocidad: t("Velocidad del balón"),
        lenta: tf("Lenta · {v} m/s", { v: campos.escala.velocidades[0].toLocaleString(numberLocale(), { maximumFractionDigits: 1, minimumFractionDigits: 1 }) }),
        rapida: tf("Rápida · {v} m/s", { v: campos.escala.velocidades[2].toLocaleString(numberLocale(), { maximumFractionDigits: 1, minimumFractionDigits: 1 }) }),
        grosor: t("Grosor: cuánto se usa la ruta"),
        ataque: t("Todos atacan hacia la derecha →"),
        creditos: tf("Idea: football-blueprints (opengoalapp) · Datos: StatsBomb · {autor}", { autor: AUTOR }),
        balonPorPartido: t("Balón por partido"),
        haciaDelante: t("Hacia delante"),
        ultimoTercio: t("Velocidad en el último tercio"),
        vsLiga: t("{d} vs liga"),
      },
    });
  }

  // La vista previa: el reel en vivo, a escala, solo cuando se pide.
  useEffect(() => {
    if (!vistaPrevia) return;
    let vivo = true;
    let cuadro = 0;
    void prepararReel().then((reel) => {
      const lienzo = lienzoPrevia.current;
      const ctx = lienzo?.getContext("2d");
      if (!vivo || !reel || !lienzo || !ctx) return;
      const inicio = performance.now();
      const bucle = () => {
        reel.dibujar(ctx, ((performance.now() - inicio) / 1000) % REEL.segundos);
        cuadro = requestAnimationFrame(bucle);
      };
      cuadro = requestAnimationFrame(bucle);
    });
    return () => { vivo = false; cancelAnimationFrame(cuadro); };
    // Se rehace al cambiar lo que sale en el reel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vistaPrevia, liga, destacado, titulo, subtitulo]);

  async function crearVideo() {
    setAviso("");
    setGrabando(0);
    cancelar.current = false;
    try {
      const reel = await prepararReel();
      if (!reel) return;
      const { blob, tipo, codec } = await grabarVideo({
        ancho: REEL.ancho, alto: REEL.alto, fps: REEL.fps, cuadros: reel.cuadros,
        dibujar: reel.dibujar, alProgresar: (hecho) => setGrabando(hecho), cancelado: () => cancelar.current,
      });
      if (video) URL.revokeObjectURL(video.url);
      setVideo({ url: URL.createObjectURL(blob), tipo, nombre: `flujo-posesion-${archivo(raiz)}.${tipo}` });
      if (tipo === "webm") setAviso(t("Este navegador no codifica MP4: el video sale en WebM. Para LinkedIn conviene crearlo desde Chrome o Safari."));
      else if (codec !== "H.264") setAviso(t("Este navegador no codifica H.264: el MP4 sale en VP9. Si LinkedIn no lo acepta, créalo desde Chrome o Safari en el Mac."));
    } catch (fallo) {
      if (!(fallo instanceof Error && fallo.message === "cancelado")) setAviso(fallo instanceof Error ? fallo.message : String(fallo));
    } finally {
      setGrabando(null);
    }
  }

  async function descargarPortada() {
    const reel = await prepararReel();
    if (!reel) return;
    const lienzo = document.createElement("canvas");
    lienzo.width = REEL.ancho;
    lienzo.height = REEL.alto;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return;
    reel.dibujar(ctx, 11);
    lienzo.toBlob((blob) => {
      if (!blob) return;
      const enlace = document.createElement("a");
      enlace.href = URL.createObjectURL(blob);
      enlace.download = `flujo-posesion-${archivo(raiz)}-portada.png`;
      enlace.click();
      window.setTimeout(() => URL.revokeObjectURL(enlace.href), 4_000);
    }, "image/png");
  }

  const opcionesDeLiga = useMemo(() => [...catalogo]
    .sort((a, b) => a.name.localeCompare(b.name) || String(b.season).localeCompare(String(a.season), "en", { numeric: true })), [catalogo]);
  const opcionesDeEquipo: OpcionDeMenu[] = grupos.flatMap((grupo) => grupo.equipos.map((equipo) => ({
    valor: String(equipo.id), texto: equipo.nombre, grupo: grupos.length > 1 ? t(grupo.nombre) : undefined,
    icono: <Escudo equipo={equipo.nombre} liga={nombreLiga} tamano={20} respaldo />,
  })));

  return <section className="blueprints-page" ref={pagina}>
    <header>
      <div>
        <span>{t("FOOTBALL BLUEPRINTS")}</span>
        <h2>{t("Football Blueprints")}</h2>
        <p>{t("Ideas de análisis escritas como prompts: en vez de compartir código se comparte la idea, y cada uno la construye con su agente y sus datos. Aquí están construidas con los nuestros.")}</p>
        <details className="como-se-calcula">
          <summary><ChevronDown size={13} />{t("Qué es un blueprint")}</summary>
          <p>{t("Un blueprint es un «idea file»: un texto corto que describe qué construir, por qué y las pocas decisiones que lo hacen funcionar. El catálogo es de opengoalapp (github.com/opengoalapp/football-blueprints) y sigue la idea de Andrej Karpathy de compartir ideas en lugar de repositorios a medio hacer.")}</p>
          <p>{t("El primero es el flujo de posesión: cada pase y cada conducción de la temporada se convierte en un campo de corrientes, como un mapa de viento. Las rutas que más usa el equipo son ríos gruesos y brillantes; las zonas que casi no pisa quedan en calma; y las partículas van más rápido donde el balón va más rápido.")}</p>
        </details>
      </div>
    </header>

    <article className="blueprint-ficha">
      <div>
        <b>{t("Flujo de posesión")}</b>
        <small>{t("Blueprint 01 · StatsBomb, eventos de la temporada")}</small>
      </div>
      <ul>
        <li>{t("Grosor y brillo: cuánto balón pasa por esa ruta, en la escala de toda la liga.")}</li>
        <li>{t("Color y velocidad: lo rápido que va el balón en la zona, de verde apagado (lento) a casi blanco (rápido).")}</li>
        <li>{t("Calma: zonas por las que el equipo apenas mueve el balón. Todos atacan hacia la derecha.")}</li>
      </ul>
    </article>

    <div className="filtros-barra blueprint-controles" role="group" aria-label={t("Qué liga y qué equipo")}>
      <div className="filtros-chips">
        <Desplegable etiqueta={t("Competición")} valor={competicion ? `${competicion.name} · ${competicion.season}` : t("Elegir competición")} activo={false} apagado={!catalogo.length}>
          <select aria-label={t("Competición")} value={claveLiga} disabled={!catalogo.length} onChange={(evento) => { setClaveLiga(evento.target.value); setElegido(null); setVideo(null); }}>
            {!claveLiga && <option value="">{t("Elegir competición")}…</option>}
            {opcionesDeLiga.map((opcion) => <option key={claveDe(opcion)} value={claveDe(opcion)}>{`${opcion.name} · ${opcion.season}`}</option>)}
          </select>
        </Desplegable>
        {grupos.length > 0 && <MenuDesplegable etiqueta={t("Equipo destacado")} valor={nombreDestacado}
          icono={<Escudo equipo={nombreDestacado} liga={nombreLiga} tamano={14} />}
          opciones={opcionesDeEquipo} elegida={String(destacado ?? "")} onElegir={(valor) => setElegido(Number(valor))} />}
      </div>
    </div>
    {estado && <p className="flujo-estado" role="status">
      {estado}
      {vigente?.error && <> <button type="button" className="estilo-reintentar" onClick={() => { setResultado(null); setIntento((n) => n + 1); }}>{t("Reintentar")}</button></>}
    </p>}

    {liga && campos && grupos.length > 0 && <>
      {/* El mapa conceptual: la liga, sus conferencias y sus equipos. */}
      <section className="blueprint-mapa" aria-label={t("Mapa de la liga")}>
        <div className="blueprint-raiz"><span>{raiz}</span><small>{tf("{n} equipos", { n: liga.equipos.length })}</small></div>
        {grupos.map((grupo) => <div className="blueprint-rama" key={grupo.nombre}>
          <h3>{t(grupo.nombre)}<small>{tf("{n} equipos", { n: grupo.equipos.length })}</small></h3>
          <ol className="blueprint-cuadricula">
            {grupo.equipos.map((equipo) => <li key={equipo.id} className={equipo.id === destacado ? "activo" : undefined}>
              <button type="button" onClick={() => destacar(equipo.id)} aria-pressed={equipo.id === destacado}>
                <CanchaFlujo campo={campos.campos.get(equipo.id) ?? null} estela={0.3} ancho={AJUSTES_INICIALES.ancho} densidad={0.55} lectura={false}
                  etiqueta={tf("Flujo de posesión de {equipo}", { equipo: equipo.nombre })} />
                <span className="con-escudo"><Escudo equipo={equipo.nombre} liga={nombreLiga} tamano={16} respaldo />{equipo.nombre}</span>
              </button>
            </li>)}
          </ol>
        </div>)}
      </section>

      {destacado !== null && <div className="blueprint-destacado" ref={fichaDestacada}>
        <h3>{t("Equipo destacado")}</h3>
        <FichaEquipo campo={campos.campos.get(destacado) ?? null} resumen={resumenes.find((r) => r.equipo === destacado)} media={media} liga={liga} estela={0.5} ancho={AJUSTES_INICIALES.ancho} />
      </div>}

      {/* El reel: vertical, para LinkedIn. */}
      <section className="blueprint-reel">
        <h3>{t("Reel para LinkedIn")}</h3>
        <p>{t("Un video vertical de 24 segundos (1080 × 1920): el mapa de la liga con todos sus equipos y, a mitad, el equipo destacado en grande. Termina como empieza, así se puede repetir en bucle.")}</p>
        <div className="blueprint-reel-campos">
          <label><span>{t("Título")}</span><input type="text" value={titulo} placeholder={tituloPorDefecto} onChange={(evento) => setTitulo(evento.target.value)} /></label>
          <label><span>{t("Subtítulo")}</span><input type="text" value={subtitulo} placeholder={subtituloPorDefecto} onChange={(evento) => setSubtitulo(evento.target.value)} /></label>
        </div>
        <div className="blueprint-reel-acciones">
          <button type="button" className="button primary" disabled={grabando !== null} onClick={() => void crearVideo()}>
            {grabando !== null ? tf("Creando el video… {p}%", { p: Math.round(grabando * 100) }) : t("Crear video (MP4)")}
          </button>
          {grabando !== null && <button type="button" className="button secondary" onClick={() => { cancelar.current = true; }}>{t("Cancelar")}</button>}
          <button type="button" className="button secondary" onClick={() => void descargarPortada()}>{t("Portada (PNG)")}</button>
          <button type="button" className="button secondary" aria-pressed={vistaPrevia} onClick={() => setVistaPrevia((actual) => !actual)}>
            {vistaPrevia ? t("Ocultar vista previa") : t("Vista previa")}
          </button>
        </div>
        {aviso && <p className="flujo-estado" role="status">{aviso}</p>}
        <div className="blueprint-reel-salidas">
          {vistaPrevia && <canvas ref={lienzoPrevia} width={REEL.ancho} height={REEL.alto} className="blueprint-reel-lienzo" aria-label={t("Vista previa del reel")} />}
          {video && <figure className="blueprint-reel-video">
            <video src={video.url} controls loop muted playsInline />
            <figcaption><a className="button secondary" href={video.url} download={video.nombre}>{tf("Descargar {archivo}", { archivo: video.nombre })}</a></figcaption>
          </figure>}
        </div>
      </section>

      <PieDeReporte asunto={`${t("Football Blueprints")} · ${raiz}`} destinatario={destinatario} logo={logoDestinatario} className="flujo-firma" />
    </>}
  </section>;
}
