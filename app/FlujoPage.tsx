"use client";

import { useDeferredValue, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Desplegable } from "./BarraDeFiltros";
import { useBaseActiva } from "./BaseActiva";
import { CanchaFlujo, GROSORES, RAMPA_RAPIDEZ } from "./CanchaFlujo";
import { Escudo } from "./Escudo";
import { ChevronDown } from "./Icons";
import { MenuDesplegable, type OpcionDeMenu } from "./MenuDesplegable";
import { PieDeReporte } from "./PieDeReporte";
import { numberLocale, t, tf } from "@/lib/i18n";
import { EQUIPO_PROPIO, mismoEquipo } from "@/lib/estiloEquipo";
import { fetchFlujoDePosesion, fetchStatsbombCompetitions, type ApiCompetition } from "@/lib/remoteData";
import {
  AJUSTES_INICIALES,
  camposDeLiga,
  mediaDeLiga,
  resumenesDeLiga,
  type CampoFlujo,
  type LigaFlujo,
  type ResumenFlujo,
} from "@/lib/flujoPosesion";

/**
 * Flujo de posesión: por dónde mueve el balón cada equipo en su temporada,
 * dibujado como un mapa de viento, dos equipos lado a lado.
 *
 * Las rutas que más usa son corrientes gruesas y brillantes; las zonas que
 * casi no pisa quedan en calma; y las partículas van más rápido donde el
 * balón va más rápido. Debajo de cada cancha, lo mismo en números —el
 * promedio por partido del equipo frente a la media de la liga—, y al final
 * la liga entera en una tabla.
 *
 * La idea es el blueprint "possession flow" de opengoalapp/football-blueprints.
 */

// Lo ya pedido en esta sesión y lo que está en camino: una liga sin caché
// tarda minutos, y volver a la página no debe pedirla otra vez.
const ligasGuardadas = new Map<string, LigaFlujo>();
const ligasEnCamino = new Map<string, Promise<LigaFlujo>>();
const claveDe = (competicion: ApiCompetition) => `${competicion.competition_id}:${competicion.season_id}`;

function pedirLiga(competicion: ApiCompetition) {
  const clave = claveDe(competicion);
  const guardada = ligasGuardadas.get(clave);
  if (guardada) return Promise.resolve(guardada);
  let promesa = ligasEnCamino.get(clave);
  if (!promesa) {
    promesa = fetchFlujoDePosesion(competicion)
      .then((liga) => { if (!liga.fallidos) ligasGuardadas.set(clave, liga); return liga; })
      .finally(() => ligasEnCamino.delete(clave));
    ligasEnCamino.set(clave, promesa);
  }
  return promesa;
}

const decimal = (valor: number, digitos = 1) => (Number.isFinite(valor)
  ? valor.toLocaleString(numberLocale(), { minimumFractionDigits: digitos, maximumFractionDigits: digitos })
  : "—");
const entero = (valor: number) => (Number.isFinite(valor) ? Math.round(valor).toLocaleString(numberLocale()) : "—");
const porcentaje = (valor: number) => (Number.isFinite(valor) ? `${Math.round(valor * 100)}%` : "—");

/** "+0,4" / "−3 pp": la diferencia con la liga, con su signo y su clase. */
function Diferencia({ valor, media, formato }: { valor: number; media: number; formato: "ms" | "pp" | "m" }) {
  if (!Number.isFinite(valor) || !Number.isFinite(media)) return null;
  const diferencia = formato === "pp" ? (valor - media) * 100 : valor - media;
  const redondeada = formato === "ms" ? Math.round(diferencia * 10) / 10 : Math.round(diferencia);
  const signo = redondeada > 0 ? "+" : redondeada < 0 ? "−" : "±";
  const cifra = formato === "ms" ? decimal(Math.abs(redondeada)) : entero(Math.abs(redondeada));
  const unidad = formato === "pp" ? " pp" : formato === "m" ? " m" : "";
  return <small className={redondeada > 0 ? "flujo-dif sube" : redondeada < 0 ? "flujo-dif baja" : "flujo-dif"}>
    {tf("{d} vs liga", { d: `${signo}${cifra}${unidad}` })}
  </small>;
}

const TERCIOS = ["Salida", "Medio campo", "Último tercio"];
const CARRILES = ["Izquierda", "Centro", "Derecha"];
/** Los tres grosores de la estela, de la ruta menos usada a la más. */
const RUTAS = ["Ruta ocasional", "Ruta habitual", "Ruta principal"];

function Carriles({ carriles }: { carriles: [number, number, number] }) {
  return <div className="flujo-carriles" role="img"
    aria-label={tf("Por carril: izquierda {i}, centro {c}, derecha {d}", { i: porcentaje(carriles[0]), c: porcentaje(carriles[1]), d: porcentaje(carriles[2]) })}>
    {carriles.map((parte, k) => <span key={CARRILES[k]} style={{ flexGrow: Math.max(0.0001, parte) } as CSSProperties}>
      <b>{porcentaje(parte)}</b><small>{t(CARRILES[k])}</small>
    </span>)}
  </div>;
}

function FichaEquipo({ campo, resumen, media, liga, estela, ancho }: {
  campo: CampoFlujo | null;
  resumen: ResumenFlujo | undefined;
  media: ReturnType<typeof mediaDeLiga>;
  liga: LigaFlujo;
  estela: number;
  ancho: number;
}) {
  if (!resumen) return null;
  return <figure className="flujo-ficha">
    <figcaption>
      <b className="con-escudo"><Escudo equipo={resumen.nombre} liga={liga.liga} tamano={20} respaldo />{resumen.nombre}</b>
      <small>{tf("{n} partidos · ataca hacia la derecha", { n: resumen.partidos })}</small>
    </figcaption>
    <CanchaFlujo campo={campo} estela={estela} ancho={ancho} etiqueta={tf("Flujo de posesión de {equipo}", { equipo: resumen.nombre })} />
    <dl className="flujo-cifras">
      <div><dt>{t("Balón por partido")}</dt><dd>{`${entero(resumen.metros)} m`}</dd><Diferencia valor={resumen.metros} media={media.metros} formato="m" /></div>
      <div><dt>{t("Hacia delante")}</dt><dd>{porcentaje(resumen.adelante)}</dd><Diferencia valor={resumen.adelante} media={media.adelante} formato="pp" /></div>
      <div><dt>{t("Hacia atrás")}</dt><dd>{porcentaje(resumen.atras)}</dd><Diferencia valor={resumen.atras} media={media.atras} formato="pp" /></div>
    </dl>
    <Carriles carriles={resumen.carriles} />
    <ol className="flujo-tercios" aria-label={t("Velocidad del balón por tercio")}>
      {TERCIOS.map((tercio, k) => <li key={tercio}>
        <span>{t(tercio)}</span>
        <b>{`${decimal(resumen.velocidad[k])} m/s`}</b>
        <Diferencia valor={resumen.velocidad[k]} media={media.velocidad[k]} formato="ms" />
      </li>)}
    </ol>
  </figure>;
}

type Orden = "metros" | "adelante" | "izquierda" | "derecha" | "salida" | "medio" | "ultimo";
const VALOR_DE_ORDEN: Record<Orden, (r: ResumenFlujo) => number> = {
  metros: (r) => r.metros,
  adelante: (r) => r.adelante,
  izquierda: (r) => r.carriles[0],
  derecha: (r) => r.carriles[2],
  salida: (r) => r.velocidad[0],
  medio: (r) => r.velocidad[1],
  ultimo: (r) => r.velocidad[2],
};

export function FlujoPage({ destinatario = "", logoDestinatario = "" }: {
  destinatario?: string;
  logoDestinatario?: string;
}) {
  const { competiciones: cargadas } = useBaseActiva();
  const [catalogo, setCatalogo] = useState<ApiCompetition[]>([]);
  const [claveLiga, setClaveLiga] = useState("");
  const [errorCatalogo, setErrorCatalogo] = useState("");
  // La última liga pedida y lo que respondió el puente. Lo que se ve se
  // deriva de aquí: si la clave ya no es la elegida, se está cargando otra.
  const [resultado, setResultado] = useState<{ clave: string; liga?: LigaFlujo; error?: string } | null>(null);
  const [intento, setIntento] = useState(0);
  const [equipoA, setEquipoA] = useState<number | null>(null);
  const [equipoB, setEquipoB] = useState<number | null>(null);
  const [detalle, setDetalle] = useState(Math.round(AJUSTES_INICIALES.detalle * 100));
  const [ancho, setAncho] = useState(Math.round(AJUSTES_INICIALES.ancho * 100));
  const [estela, setEstela] = useState(50);
  const [orden, setOrden] = useState<Orden>("metros");

  useEffect(() => {
    let vivo = true;
    fetchStatsbombCompetitions()
      .then((lista) => {
        if (!vivo) return;
        const jugables = lista.filter((competicion) => competicion.hasMatches !== false);
        setCatalogo(jugables);
        /* Se abre en la liga de la base activa si StatsBomb la tiene; si no,
           en la CPL del año en curso, que es el uso diario del club, o en su
           última temporada con partidos. */
        const anio = String(new Date().getFullYear());
        const deLaBase = cargadas
          .map((cargada) => jugables.find((competicion) => (
            competicion.name.toLowerCase() === cargada.liga.toLowerCase()
            && String(competicion.season ?? "").includes(String(cargada.anio))
          )))
          .find(Boolean);
        const cpl = jugables
          .filter((competicion) => /canadian premier/i.test(competicion.name))
          .sort((a, b) => String(a.season).localeCompare(String(b.season), "en", { numeric: true }));
        const elegida = deLaBase
          ?? cpl.find((competicion) => String(competicion.season ?? "").includes(anio))
          ?? cpl[cpl.length - 1]
          ?? jugables[0];
        // Un reintento no pisa la liga que ya se eligió a mano.
        if (elegida) setClaveLiga((actual) => actual || claveDe(elegida));
      })
      .catch(() => {
        if (vivo) setErrorCatalogo(t("El servidor local no respondió. Arranca npm run bg:server y reintenta."));
      });
    return () => { vivo = false; };
    // Solo al montar: si siguiera a la base, cambiaría la liga bajo los pies
    // de quien ya la eligió a mano.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intento]);

  const competicion = catalogo.find((candidata) => claveDe(candidata) === claveLiga) ?? null;

  useEffect(() => {
    if (!competicion) return;
    let vivo = true;
    const clave = claveDe(competicion);
    pedirLiga(competicion)
      .then((respuesta) => {
        if (!vivo) return;
        setResultado({ clave, liga: respuesta });
        const propio = respuesta.equipos.find((equipo) => mismoEquipo(equipo.nombre, EQUIPO_PROPIO)) ?? respuesta.equipos[0];
        setEquipoA(propio?.equipo ?? null);
        setEquipoB(respuesta.equipos.find((equipo) => equipo.equipo !== propio?.equipo)?.equipo ?? null);
      })
      .catch((fallo) => {
        if (!vivo) return;
        setResultado({ clave, error: fallo instanceof TypeError
          ? t("El servidor local no respondió. Arranca npm run bg:server y reintenta.")
          : fallo instanceof Error ? fallo.message : String(fallo) });
      });
    return () => { vivo = false; };
    // La competición se identifica por su clave; el objeto cambia con cada catálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveLiga, catalogo.length, intento]);

  const vigente = resultado?.clave === claveLiga ? resultado : null;
  const liga = vigente?.liga ?? null;
  const fallo = errorCatalogo || vigente?.error || "";
  const estado = fallo
    || (!catalogo.length ? t("Leyendo el catálogo de StatsBomb…") : "")
    || (competicion && !vigente ? tf("Leyendo los partidos de {liga} {temporada}… la primera vez tarda unos minutos.", { liga: competicion.name, temporada: competicion.season }) : "")
    || (liga && !liga.equipos.length ? t("StatsBomb no devolvió partidos jugados de esta temporada.") : "");
  const reintentar = () => {
    setErrorCatalogo("");
    setResultado(null);
    setIntento((n) => n + 1);
  };

  // Los deslizadores recalculan las corrientes de toda la liga: con el valor
  // diferido, arrastrarlos no se traba aunque cada cálculo lleve unos 100 ms.
  const ajustes = useDeferredValue(useMemo(() => ({ detalle: detalle / 100, ancho: ancho / 100 }), [detalle, ancho]));
  const campos = useMemo(() => (liga ? camposDeLiga(liga, ajustes) : null), [liga, ajustes]);
  const resumenes = useMemo(() => (liga ? resumenesDeLiga(liga) : []), [liga]);
  const media = useMemo(() => mediaDeLiga(resumenes), [resumenes]);
  const ordenados = useMemo(
    () => [...resumenes].sort((a, b) => (VALOR_DE_ORDEN[orden](b) || 0) - (VALOR_DE_ORDEN[orden](a) || 0)),
    [resumenes, orden],
  );

  const opcionesDeLiga = useMemo(() => [...catalogo]
    .sort((a, b) => a.name.localeCompare(b.name) || String(b.season).localeCompare(String(a.season), "en", { numeric: true })),
  [catalogo]);
  const opcionesDeEquipo: OpcionDeMenu[] = (liga?.equipos ?? []).map((equipo) => ({
    valor: String(equipo.equipo),
    texto: equipo.nombre,
    icono: <Escudo equipo={equipo.nombre} liga={liga?.liga ?? ""} tamano={20} respaldo />,
  }));
  const nombreDe = (id: number | null) => liga?.equipos.find((equipo) => equipo.equipo === id)?.nombre ?? "";
  const resumenDe = (id: number | null) => resumenes.find((resumen) => resumen.equipo === id);
  const titulo = [nombreDe(equipoA), nombreDe(equipoB)].filter(Boolean).join(" · ");

  const cabeceraOrdenable = (clave: Orden, texto: string) => (
    <th scope="col" aria-sort={orden === clave ? "descending" : "none"}>
      <button type="button" className={orden === clave ? "activo" : undefined} onClick={() => setOrden(clave)}>{texto}</button>
    </th>
  );

  return <section className="flujo-page">
    <header>
      <div>
        <span>{t("STATSBOMB · EVENTOS DE TEMPORADA")}</span>
        <h2>{t("Flujo de posesión")}</h2>
        <p>{t("Por dónde mueve el balón cada equipo en su temporada, como un mapa de viento: las rutas que más usa son corrientes gruesas y brillantes, las zonas que casi no pisa quedan en calma y las partículas van más rápido donde el balón va más rápido.")}</p>
        <details className="como-se-calcula">
          <summary><ChevronDown size={13} />{t("Cómo se calcula")}</summary>
          <p>{t("Cada pase y cada conducción del equipo con el balón —sin saques de esquina ni de centro— se reparte por una rejilla de la cancha, celda a celda y por dirección. Un pase largo suma un poco en cada celda que cruza, no todo en la de salida.")}</p>
          <p>{t("En cada zona se dibuja la dirección dominante, y una segunda solo si el reparto es parejo: promediar direcciones anularía las dos. Qué cuenta como ruta se decide contra todos los equipos de la liga, así que el grosor significa lo mismo en las dos canchas y las zonas con poco tráfico quedan en calma.")}</p>
          <p>{t("La velocidad es la del balón en la zona —distancia entre tiempo, con las pausas incluidas— y se colorea por su posición en la liga, porque en bruto se parecen mucho. Los dos equipos atacan hacia la derecha: la banda de arriba es su izquierda.")}</p>
          <p>{t("Idea: blueprint «possession flow» de football-blueprints (opengoalapp). Datos: StatsBomb.")}</p>
        </details>
      </div>
    </header>

    <div className="filtros-barra flujo-controles" role="group" aria-label={t("Qué liga y qué equipos")}>
      <div className="filtros-chips">
        <Desplegable etiqueta={t("Competición")}
          valor={competicion ? `${competicion.name} · ${competicion.season}` : t("Elegir competición")}
          activo={false} apagado={!catalogo.length}>
          <select aria-label={t("Competición")} value={claveLiga} disabled={!catalogo.length} onChange={(evento) => setClaveLiga(evento.target.value)}>
            {!claveLiga && <option value="">{t("Elegir competición")}…</option>}
            {opcionesDeLiga.map((opcion) => <option key={claveDe(opcion)} value={claveDe(opcion)}>{`${opcion.name} · ${opcion.season}`}</option>)}
          </select>
        </Desplegable>
        {liga && liga.equipos.length > 0 && <>
          <MenuDesplegable etiqueta={t("Izquierda")} valor={nombreDe(equipoA)}
            icono={<Escudo equipo={nombreDe(equipoA)} liga={liga.liga} tamano={14} />}
            opciones={opcionesDeEquipo} elegida={String(equipoA ?? "")} onElegir={(valor) => setEquipoA(Number(valor))} />
          <MenuDesplegable etiqueta={t("Derecha")} valor={nombreDe(equipoB)}
            icono={<Escudo equipo={nombreDe(equipoB)} liga={liga.liga} tamano={14} />}
            opciones={opcionesDeEquipo} elegida={String(equipoB ?? "")} onElegir={(valor) => setEquipoB(Number(valor))} />
        </>}
      </div>
    </div>
    {estado && <p className="flujo-estado" role="status">
      {estado}
      {fallo && <> <button type="button" className="estilo-reintentar" onClick={reintentar}>{t("Reintentar")}</button></>}
    </p>}
    {liga && liga.fallidos > 0 && <p className="flujo-estado" role="status">
      {tf("{n} partidos no se pudieron leer y quedan fuera; se reintentan la próxima vez.", { n: liga.fallidos })}
    </p>}

    {liga && campos && liga.equipos.length > 0 && <>
      <div className="flujo-ajustes" role="group" aria-label={t("Ajustes del mapa")}>
        <label>
          <span>{t("Detalle")}<b>{detalle}</b></span>
          <input type="range" min={0} max={100} value={detalle} onChange={(evento) => setDetalle(Number(evento.target.value))} />
          <small>{t("Cuánto flujo secundario se ve")}</small>
        </label>
        <label>
          <span>{t("Ancho del canal")}<b>{ancho}</b></span>
          <input type="range" min={0} max={100} value={ancho} onChange={(evento) => setAncho(Number(evento.target.value))} />
          <small>{t("Ríos estrechos o corrientes anchas")}</small>
        </label>
        <label>
          <span>{t("Estela")}<b>{estela}</b></span>
          <input type="range" min={0} max={100} value={estela} onChange={(evento) => setEstela(Number(evento.target.value))} />
          <small>{t("Cuánto rastro deja cada partícula")}</small>
        </label>
      </div>

      <div className="flujo-canchas">
        <FichaEquipo campo={equipoA === null ? null : campos.campos.get(equipoA) ?? null} resumen={resumenDe(equipoA)} media={media} liga={liga} estela={estela / 100} ancho={ajustes.ancho} />
        <FichaEquipo campo={equipoB === null ? null : campos.campos.get(equipoB) ?? null} resumen={resumenDe(equipoB)} media={media} liga={liga} estela={estela / 100} ancho={ajustes.ancho} />
      </div>

      <div className="flujo-leyenda">
        <div>
          <span>{t("Velocidad del balón")}</span>
          <i className="flujo-rampa" aria-hidden="true">{RAMPA_RAPIDEZ.map((color) => <u key={color} style={{ background: color }} />)}</i>
          <small>{tf("Lenta · {v} m/s", { v: decimal(campos.escala.velocidades[0]) })}</small>
          <small>{tf("Rápida · {v} m/s", { v: decimal(campos.escala.velocidades[2]) })}</small>
        </div>
        <div>
          <span>{t("Grosor: cuánto balón pasa por la ruta")}</span>
          {GROSORES.map((grosor, k) => <small key={grosor} className="flujo-grosor">
            <svg width="26" height="10" aria-hidden="true"><line x1="2" y1="5" x2="24" y2="5" stroke={RAMPA_RAPIDEZ[4]} strokeWidth={grosor * 1.6} /></svg>
            {t(RUTAS[k])}
          </small>)}
        </div>
        <p>{t("Escala de la liga: el mismo grosor y el mismo color significan lo mismo en las dos canchas. Pasa el cursor por una cancha para leer la zona.")}</p>
      </div>

      <section className="flujo-liga">
        <h3>{tf("{liga} {temporada}, equipo por equipo", { liga: liga.liga || competicion?.name || "", temporada: liga.temporada || competicion?.season || "" })}</h3>
        <p>{t("El promedio por partido de cada equipo en la temporada. Toca un equipo para verlo en la cancha de la izquierda; los títulos de columna ordenan.")}</p>
        <div className="flujo-tabla-marco">
          <table className="flujo-tabla">
            <thead>
              <tr>
                <th scope="col">{t("Equipo")}</th>
                <th scope="col">{t("PJ")}</th>
                {cabeceraOrdenable("metros", t("Balón por partido"))}
                {cabeceraOrdenable("adelante", t("Hacia delante"))}
                {cabeceraOrdenable("izquierda", t("Izquierda"))}
                <th scope="col">{t("Centro")}</th>
                {cabeceraOrdenable("derecha", t("Derecha"))}
                {cabeceraOrdenable("salida", t("Salida"))}
                {cabeceraOrdenable("medio", t("Medio campo"))}
                {cabeceraOrdenable("ultimo", t("Último tercio"))}
              </tr>
            </thead>
            <tbody>
              {ordenados.map((resumen) => (
                <tr key={resumen.equipo}
                  className={resumen.equipo === equipoA ? "activa a" : resumen.equipo === equipoB ? "activa b" : undefined}
                  tabIndex={0} aria-selected={resumen.equipo === equipoA}
                  onClick={() => setEquipoA(resumen.equipo)}
                  onKeyDown={(evento) => { if (evento.key === "Enter" || evento.key === " ") { evento.preventDefault(); setEquipoA(resumen.equipo); } }}>
                  <th scope="row"><span className="con-escudo"><Escudo equipo={resumen.nombre} liga={liga.liga} tamano={16} respaldo />{resumen.nombre}</span></th>
                  <td>{resumen.partidos}</td>
                  <td>{`${entero(resumen.metros)} m`}</td>
                  <td>{porcentaje(resumen.adelante)}</td>
                  <td>{porcentaje(resumen.carriles[0])}</td>
                  <td>{porcentaje(resumen.carriles[1])}</td>
                  <td>{porcentaje(resumen.carriles[2])}</td>
                  {resumen.velocidad.map((valor, k) => <td key={TERCIOS[k]}>{decimal(valor)}</td>)}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{t("Media de la liga")}</th>
                <td />
                <td>{`${entero(media.metros)} m`}</td>
                <td>{porcentaje(media.adelante)}</td>
                {media.carriles.map((parte, k) => <td key={CARRILES[k]}>{porcentaje(parte)}</td>)}
                {media.velocidad.map((valor, k) => <td key={TERCIOS[k]}>{decimal(valor)}</td>)}
              </tr>
            </tfoot>
          </table>
        </div>
        <small className="flujo-nota">{t("Velocidades en m/s del balón en cada tercio, pausas incluidas. Carriles: reparto del recorrido del balón según ataca el equipo. Hacia delante y hacia atrás: el recorrido a menos de 56° de cada portería.")}</small>
      </section>

      <PieDeReporte asunto={titulo || t("Flujo de posesión")} destinatario={destinatario} logo={logoDestinatario} className="flujo-firma" />
    </>}
  </section>;
}
