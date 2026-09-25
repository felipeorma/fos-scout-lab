"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Desplegable } from "./BarraDeFiltros";
import { ChevronDown } from "./Icons";
import { PieDeReporte } from "./PieDeReporte";
import { Escudo, LogoLiga } from "./Escudo";
import { MenuDesplegable, type OpcionDeMenu } from "./MenuDesplegable";
import { COLOR_FAMILIA, RosaDeEstilo } from "./RosaDeEstilo";
import { numberLocale, t, tf } from "@/lib/i18n";
import { useEstilos } from "./useEstilos";
import { fetchExtrasDeEquipo, type ExtrasDeEquipo } from "@/lib/remoteData";
import {
  FAMILIAS,
  METRICAS_ESTILO,
  cabezaACabeza,
  valorDeFamilia,
  equiposParecidos,
  parecidoDeEstilo,
  perfilesDeEstilo,
  EQUIPO_PROPIO,
  type FamiliaEstilo,
  type MetricaEstilo,
  type PerfilEquipo,
} from "@/lib/estiloEquipo";

/**
 * Estilo de juego: la página 7 del dossier, con nuestros datos.
 *
 * Tres preguntas, de arriba abajo: cómo juega este equipo (la rosa y la lista
 * por familias), a quién se parece (los diez más cercanos en estilo) y en qué
 * se diferencia del que elijas para comparar (el cara a cara). La primera
 * respuesta sirve para preparar un partido; las otras dos, para fichar:
 * quien viene de un equipo que juega como el nuestro se adapta antes.
 */

function formatear(metrica: MetricaEstilo, valor: number) {
  if (!Number.isFinite(valor)) return "—";
  if (metrica.formato === "pct") return `${Math.round(valor * 100)}%`;
  const decimales = metrica.formato === "n1" ? 1 : metrica.formato === "n2" ? 2 : 3;
  return valor.toLocaleString(numberLocale(), { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

const tramo = (percentil: number) => (percentil >= 80 ? "p5" : percentil >= 60 ? "p4" : percentil >= 40 ? "p3" : percentil >= 20 ? "p2" : "p1");
const conSigno = (z: number) => `${z >= 0 ? "+" : "−"}${Math.abs(z).toFixed(2)}`;

// ---- Formación y presión ----------------------------------------------------

// Lo ya pedido en esta sesión, y lo que está en camino: el equipo y su rival
// no piden dos veces lo mismo.
const extrasGuardados = new Map<string, ExtrasDeEquipo>();
const extrasEnCamino = new Map<string, Promise<ExtrasDeEquipo>>();

function useExtras(clave: string) {
  const [datos, setDatos] = useState<ExtrasDeEquipo | null>(() => extrasGuardados.get(clave) ?? null);
  const [error, setError] = useState("");
  useEffect(() => {
    const guardado = extrasGuardados.get(clave);
    if (guardado) { setDatos(guardado); setError(""); return; }
    setDatos(null);
    setError("");
    let vivo = true;
    let promesa = extrasEnCamino.get(clave);
    if (!promesa) {
      promesa = fetchExtrasDeEquipo(clave)
        .then((respuesta) => { extrasGuardados.set(clave, respuesta); return respuesta; })
        .finally(() => extrasEnCamino.delete(clave));
      extrasEnCamino.set(clave, promesa);
    }
    promesa
      .then((respuesta) => { if (vivo) setDatos(respuesta); })
      .catch((fallo) => {
        if (!vivo) return;
        setError(fallo instanceof TypeError
          ? t("El servidor local no respondió. Arranca npm run bg:server y reintenta.")
          : fallo instanceof Error ? fallo.message : String(fallo));
      });
    return () => { vivo = false; };
  }, [clave]);
  return { datos, error };
}

/** "4231" → "4-2-3-1": así las escribe StatsBomb, sin guiones. */
const formacion = (codigo: string) => codigo.split("").join("-");

function ColumnaExtras({ perfil, rival = false }: { perfil: PerfilEquipo; rival?: boolean }) {
  const { datos, error } = useExtras(perfil.clave);
  const decimal = (valor: number | null) => (valor === null ? "—" : valor.toLocaleString(numberLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  return <div className={rival ? "estilo-extras-equipo rival" : "estilo-extras-equipo"}>
    <b className="estilo-extras-nombre"><i /><Escudo equipo={perfil.equipo} liga={perfil.competicion} tamano={16} />{perfil.equipo}</b>
    {!datos ? <small className="estilo-extras-estado" role="status">
      {error || tf("Leyendo los partidos de {equipo}… la primera vez tarda un par de minutos.", { equipo: perfil.equipo })}
    </small> : <>
      <ol className="estilo-formaciones" aria-label={t("Formaciones más usadas")}>
        {datos.formaciones.slice(0, 3).map((f) => {
          const parte = datos.minutosTotales ? f.minutos / datos.minutosTotales : 0;
          return <li key={f.formacion}>
            <span>{formacion(f.formacion)}</span>
            <i><b style={{ width: `${Math.round(parte * 100)}%` }} /></i>
            <em>{`${Math.round(parte * 100)}%`}</em>
            <small>{tf("{n} de inicio", { n: f.inicios })}</small>
          </li>;
        })}
        {!datos.formaciones.length && <li className="vacia">{t("Sin formaciones en sus eventos.")}</li>}
      </ol>
      <dl className="estilo-ppda">
        <div><dt>PPDA</dt><dd>{decimal(datos.ppda)}</dd></div>
        <div><dt>{t("PPDA en contra")}</dt><dd>{decimal(datos.ppdaContra)}</dd></div>
      </dl>
      <small className="estilo-extras-partidos">{tf("{n} partidos", { n: datos.conPpda || datos.partidos })}</small>
    </>}
  </div>;
}

export function EstiloPage({ equipoPropio = EQUIPO_PROPIO, destinatario = "", logoDestinatario = "", claseHoja = "legal-page-shell" }: {
  /** El equipo con el que se mide el encaje. En el espacio de Cavalry, Cavalry. */
  equipoPropio?: string;
  destinatario?: string;
  logoDestinatario?: string;
  /** La clase de cada hoja de impresión: con un equipo elegido, son dos. */
  claseHoja?: string;
}) {
  const { filas, cargando, mensaje: estado, recargar } = useEstilos();
  const [clave, setClave] = useState("");
  const [claveRival, setClaveRival] = useState("");
  const [metricaTop, setMetricaTop] = useState("contragolpe");
  // La familia resaltada en el radar y en su caja. Se elige en cualquiera de
  // los dos; un segundo toque la suelta.
  const [familiaActiva, setFamiliaActiva] = useState<FamiliaEstilo | null>(null);
  const alternarFamilia = (id: FamiliaEstilo) => setFamiliaActiva((actual) => (actual === id ? null : id));

  const perfiles = useMemo(() => (filas ? perfilesDeEstilo(filas) : []), [filas]);
  // Las listas —parecidos, top 10— salen del grupo profesional: la NCAA se
  // puede elegir y comparar, pero no se cuela en la lista de "juegan como".
  const comparables = useMemo(() => perfiles.filter((perfil) => perfil.referencia), [perfiles]);
  const propio = useMemo(
    () => perfiles.find((perfil) => perfil.equipo.toLowerCase().includes(equipoPropio.toLowerCase())) ?? null,
    [perfiles, equipoPropio],
  );
  const elegido = perfiles.find((perfil) => perfil.clave === clave) ?? propio ?? comparables[0] ?? null;
  const parecidos = useMemo(() => (elegido ? equiposParecidos(elegido, comparables, 10) : []), [elegido, comparables]);
  const rival = perfiles.find((perfil) => perfil.clave === claveRival) ?? parecidos[0]?.perfil ?? null;
  const duelo = useMemo(() => (elegido && rival ? cabezaACabeza(elegido, rival) : []), [elegido, rival]);
  const encaje = elegido && propio && elegido.clave !== propio.clave ? parecidoDeEstilo(elegido, propio) : Number.NaN;
  const encajeSc = elegido && propio && elegido.clave !== propio.clave ? parecidoDeEstilo(elegido, propio, ["statsbomb", "skillcorner"]) : Number.NaN;

  const porCompeticion = useMemo(() => {
    const mapa = new Map<string, PerfilEquipo[]>();
    for (const perfil of perfiles) mapa.set(perfil.competicion, [...(mapa.get(perfil.competicion) ?? []), perfil]);
    return [...mapa.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([competicion, lista]) => [competicion, [...lista].sort((x, y) => x.equipo.localeCompare(y.equipo))] as const);
  }, [perfiles]);

  const metricaElegida = METRICAS_ESTILO.find((metrica) => metrica.id === metricaTop) ?? METRICAS_ESTILO[0];
  const top = useMemo(() => comparables
    .filter((perfil) => perfil.valores[metricaElegida.id])
    .sort((a, b) => b.valores[metricaElegida.id].z - a.valores[metricaElegida.id].z)
    .slice(0, 10), [comparables, metricaElegida]);

  // Los equipos agrupados por liga, con el logo de la liga en la cabecera:
  // con 200 equipos, la liga es lo primero que se busca.
  const opcionesDeEquipo: OpcionDeMenu[] = porCompeticion.flatMap(([competicion, lista]) =>
    lista.map((perfil) => ({ valor: perfil.clave, texto: perfil.equipo, grupo: competicion })));
  const logoDeGrupo = (competicion: string) => <LogoLiga liga={competicion} tamano={20} hueco />;

  const pie = elegido
    ? <PieDeReporte asunto={rival ? `${elegido.equipo} · ${rival.equipo}` : elegido.equipo} destinatario={destinatario} logo={logoDestinatario} />
    : null;

  // Dos hojas: la ficha del equipo con la rosa en una, el cara a cara y el
  // top 10 en otra. Todo junto medía más del doble de una Legal. En pantalla
  // se leen seguidas; la cabecera de la segunda y el pie de la primera solo
  // salen al imprimir.
  return <>
  <div className={claseHoja}>
  <section className="estilo-page estilo-hoja-1">
    <header>
      <div>
        <span>{t("STATSBOMB · ESTADÍSTICAS DE EQUIPO")}</span>
        <h2>{t("Estilo de juego")}</h2>
        <p>{t("Cómo juega cada equipo, contra todos los equipos profesionales de la temporada, y a quién se parece.")}</p>
        <details className="como-se-calcula">
          <summary><ChevronDown size={13} />{t("Cómo se calcula")}</summary>
          <p>{t("Cada métrica se pasa a desviaciones típicas y percentil contra los equipos profesionales de todas las competiciones cargadas; la NCAA se puede consultar pero no entra en las medias. Las que menos es más —PPDA, tiros concedidos— van invertidas, así que a la derecha siempre está «más» de lo que dice la etiqueta.")}</p>
          <p>{t("El parecido entre equipos es el coseno entre sus perfiles, usando solo las métricas de estilo: dos equipos que presionan arriba y salen en corto se parecen aunque uno meta el doble de goles. 100 es jugar igual, 50 no tener nada que ver.")}</p>
          <p>{t("SkillCorner por equipo solo cubre la CPL y la MLS Next Pro con nuestra suscripción. Sus métricas se ven en la ficha y en la rosa, junto a las de StatsBomb, pero el parecido que ordena usa solo StatsBomb, para que todos los equipos se comparen en las mismas dimensiones; cuando los dos equipos tienen SkillCorner se da además un segundo parecido que lo incluye.")}</p>
        </details>
      </div>
    </header>

    {!elegido ? <p className="estilo-estado" role="status">
      {cargando ? estado : estado || t("Todavía no hay datos de equipo.")}
      {!cargando && <button type="button" className="estilo-reintentar" onClick={() => void recargar()}>{t("Reintentar")}</button>}
    </p> : <>
      <div className="filtros-barra estilo-controles" role="group" aria-label={t("Qué equipo y con quién compararlo")}>
        <div className="filtros-chips">
          <MenuDesplegable etiqueta={t("Equipo")} valor={elegido.equipo}
            icono={<Escudo equipo={elegido.equipo} liga={elegido.competicion} tamano={14} />}
            opciones={opcionesDeEquipo} iconoDeGrupo={logoDeGrupo}
            elegida={elegido.clave} onElegir={(clave) => { setClave(clave); setClaveRival(""); }} />
          <MenuDesplegable etiqueta={t("Comparar con")} valor={rival?.equipo ?? t("Nadie")} activo={Boolean(claveRival)}
            icono={rival ? <Escudo equipo={rival.equipo} liga={rival.competicion} tamano={14} /> : null}
            opciones={[{ valor: "", texto: t("Nadie") }, ...opcionesDeEquipo]} iconoDeGrupo={logoDeGrupo}
            elegida={rival?.clave ?? ""} onElegir={setClaveRival} />
        </div>
      </div>
      {estado && <p className="estilo-estado" role="status">{estado}</p>}

      <div className="estilo-grid">
        <div className="estilo-lado">
          <div className="estilo-ficha">
            <b className="con-escudo"><Escudo equipo={elegido.equipo} liga={elegido.competicion} tamano={30} respaldo />{elegido.equipo}</b>
            <small>{`${elegido.competicion} · ${elegido.temporada} · ${tf("{n} partidos", { n: elegido.partidos })}`}</small>
            <div className="estilo-cifras">
              {(["tiros", "xg_tiro", "posesion"] as const).map((id) => {
                const metrica = METRICAS_ESTILO.find((m) => m.id === id)!;
                return <span key={id}><b>{formatear(metrica, elegido.valores[id]?.bruto ?? Number.NaN)}</b><small>{t(metrica.etiqueta)}</small></span>;
              })}
            </div>
            {Number.isFinite(encaje) && propio && <p className="estilo-encaje">
              {tf("Parecido con {equipo}", { equipo: propio.equipo })}<b>{encaje.toFixed(1)}</b>
            </p>}
            {Number.isFinite(encajeSc) && <p className="estilo-encaje-sc">{tf("Con SkillCorner también: {n}", { n: encajeSc.toFixed(1) })}</p>}
            {!elegido.referencia && <p className="estilo-aviso">{t("Este equipo no entra en el grupo de referencia (NCAA, liga femenina o menos de diez partidos): se le mide contra los profesionales, pero no forma sus medias.")}</p>}
          </div>

          {FAMILIAS.map((familia) => {
            const deSkillcorner = familia.id === "movimiento" || familia.id === "presion";
            const media = valorDeFamilia(elegido, familia.id);
            const clase = familiaActiva === familia.id ? "estilo-familia activa" : familiaActiva ? "estilo-familia atenuada" : "estilo-familia";
            return <section key={familia.id} className={clase} style={{ "--familia": COLOR_FAMILIA[familia.id] } as CSSProperties}>
              <h3>
                <button type="button" className="estilo-familia-boton" aria-pressed={familiaActiva === familia.id} disabled={!media}
                  onClick={() => alternarFamilia(familia.id)} title={t("Resaltar en el radar")}>
                  <i style={{ background: COLOR_FAMILIA[familia.id] }} />{t(familia.nombre)}{deSkillcorner && <em>SkillCorner</em>}
                  {media && <b className="estilo-familia-media">{`P${media.percentil}`}</b>}
                </button>
              </h3>
              {deSkillcorner && !elegido.conSkillcorner ? <p className="estilo-sin-fuente">{t("Sin datos de equipo de SkillCorner para esta liga.")}</p> : <ol>
                {METRICAS_ESTILO.filter((metrica) => metrica.familia === familia.id && elegido.valores[metrica.id]).map((metrica) => {
                  const valor = elegido.valores[metrica.id];
                  return <li key={metrica.id} title={metrica.estilo ? t("Métrica de estilo: entra en el parecido.") : t("Métrica de rendimiento: se enseña, pero no entra en el parecido.")}>
                    <span className="estilo-metrica">{t(metrica.etiqueta)}{!metrica.estilo && <em>{t("rend.")}</em>}</span>
                    <span className="estilo-bruto">{formatear(metrica, valor.bruto)}</span>
                    <span className={valor.z >= 0 ? "estilo-z sube" : "estilo-z baja"}>{conSigno(valor.z)}</span>
                    <span className={`estilo-pct ${tramo(valor.percentil)}`}>{valor.percentil}</span>
                  </li>;
                })}
              </ol>}
            </section>;
          })}
        </div>

        <div className="estilo-centro">
          <figure className="estilo-rosa">
            {/* Seis cuñas, una por familia: con una por métrica eran 35 y no se
                leía ninguna. El detalle está en las cajas de la izquierda, que
                se resaltan al tocar su cuña. */}
            <RosaDeEstilo perfil={elegido} rival={rival} activa={familiaActiva} onActiva={setFamiliaActiva} />
            <figcaption>
              <span><i className="relleno" />{elegido.equipo}</span>
              {rival && <span><i className="contorno" />{rival.equipo}</span>}
              <small>{elegido.conSkillcorner
                ? t("Cada cuña, la media de los percentiles de su familia; StatsBomb y SkillCorner juntos. Toca una para ver sus métricas.")
                : t("Cada cuña, la media de los percentiles de su familia. Sin SkillCorner en esta liga, movimiento y presión sin balón no salen. Toca una para ver sus métricas.")}</small>
            </figcaption>
          </figure>

          <section className="estilo-bloque estilo-extras">
            <h3>{t("Formación y presión")}</h3>
            <div className="estilo-extras-grid">
              <ColumnaExtras perfil={elegido} />
              {rival && <ColumnaExtras perfil={rival} rival />}
            </div>
            <p className="estilo-extras-nota">{t("Formaciones: % de los minutos jugados con cada dibujo, del once inicial y de cada cambio táctico. PPDA: pases que deja dar al rival por cada acción defensiva; menos es presionar más. En contra: los que le dejan dar a él. Media por partido.")}</p>
          </section>

          <section className="estilo-bloque">
            <h3>{tf("Juegan como {equipo}", { equipo: elegido.equipo })}</h3>
            <ol className="rank-list estilo-lista">
              {parecidos.map(({ perfil, parecido, conSkillcorner }, posicion) => (
                <li key={perfil.clave} className={perfil.clave === rival?.clave ? "clicable activa" : "clicable"}
                  role="button" tabIndex={0} aria-pressed={perfil.clave === rival?.clave}
                  onClick={() => setClaveRival(perfil.clave)}
                  onKeyDown={(evento) => { if (evento.key === "Enter" || evento.key === " ") { evento.preventDefault(); setClaveRival(perfil.clave); } }}>
                  <span className={posicion < 3 ? "rank-pos podio" : "rank-pos"}>{posicion + 1}</span>
                  <span className="pool-cuerpo"><b className="con-escudo"><Escudo equipo={perfil.equipo} liga={perfil.competicion} tamano={15} />{perfil.equipo}</b><small>{perfil.competicion}</small></span>
                  <span className="pool-cifras"><b>{parecido.toFixed(1)}</b><small>{Number.isFinite(conSkillcorner) ? tf("con SkillCorner {n}", { n: conSkillcorner.toFixed(1) }) : t("parecido")}</small></span>
                  <span />
                </li>
              ))}
            </ol>
          </section>

        </div>
      </div>
      {pie}
    </>}
  </section>
  </div>

  {elegido && <div className={claseHoja}>
  <section className="estilo-page estilo-hoja-2">
    <header className="estilo-cabecera-continuacion">
      <div>
        <span>{t("STATSBOMB · ESTADÍSTICAS DE EQUIPO · 2 DE 2")}</span>
        <h2>{rival ? `${elegido.equipo} · ${rival.equipo}` : elegido.equipo}</h2>
      </div>
    </header>
    <div className="estilo-grid-2">
      {rival && <section className="estilo-bloque">
        <h3>{tf("Cara a cara: {a} y {b}", { a: elegido.equipo, b: rival.equipo })}</h3>
        {/* Agrupado por familia, en el orden de la rosa, con el nombre de la
            familia en vertical a la izquierda de su grupo de métricas. */}
        <div className="estilo-duelo-grupos">
          {FAMILIAS.map((familia) => {
            const filas = duelo.filter(({ metrica }) => metrica.familia === familia.id);
            if (!filas.length) return null;
            return <section key={familia.id} className="estilo-duelo-grupo" style={{ "--familia": COLOR_FAMILIA[familia.id] } as CSSProperties}>
              <h4 className="estilo-duelo-familia"><span>{t(familia.nombre)}</span></h4>
              <ol className="estilo-duelo">
                {filas.map(({ metrica, za, zb, lider, diferencia }) => (
                  <li key={metrica.id}>
                    <span className="estilo-metrica">{t(metrica.etiqueta)}</span>
                    <span className={lider === "a" ? "estilo-lider a" : "estilo-lider b"}>{lider === "a" ? elegido.equipo : rival.equipo}</span>
                    <span className="estilo-dif">{`+${diferencia.toFixed(2)}`}</span>
                    <small className="estilo-dos">{`${conSigno(za)} / ${conSigno(zb)}`}</small>
                  </li>
                ))}
              </ol>
            </section>;
          })}
        </div>
      </section>}

      <section className="estilo-bloque">
        <h3 className="estilo-top-titulo">
          {t("Top 10 en")}
          <Desplegable etiqueta={t("Métrica")} valor={t(metricaElegida.etiqueta)} activo={false}>
            <select aria-label={t("Métrica")} value={metricaElegida.id} onChange={(evento) => setMetricaTop(evento.target.value)}>
              {FAMILIAS.map((familia) => <optgroup key={familia.id} label={t(familia.nombre)}>
                {METRICAS_ESTILO.filter((metrica) => metrica.familia === familia.id).map((metrica) => <option key={metrica.id} value={metrica.id}>{t(metrica.etiqueta)}</option>)}
              </optgroup>)}
            </select>
          </Desplegable>
        </h3>
        <ol className="rank-list estilo-lista">
          {top.map((perfil, posicion) => (
            <li key={perfil.clave} className={perfil.clave === elegido.clave ? "activa" : undefined}>
              <span className={posicion < 3 ? "rank-pos podio" : "rank-pos"}>{posicion + 1}</span>
              <span className="pool-cuerpo"><b className="con-escudo"><Escudo equipo={perfil.equipo} liga={perfil.competicion} tamano={15} />{perfil.equipo}</b><small>{perfil.competicion}</small></span>
              <span className="pool-cifras"><b>{formatear(metricaElegida, perfil.valores[metricaElegida.id].bruto)}</b><small>{`z ${conSigno(perfil.valores[metricaElegida.id].z)}`}</small></span>
              <span />
            </li>
          ))}
        </ol>
      </section>
    </div>
    {pie}
  </section>
  </div>}
  </>;
}
