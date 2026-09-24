"use client";

import { useMemo, useState } from "react";
import { Desplegable } from "./BarraDeFiltros";
import { ChevronDown } from "./Icons";
import { PieDeReporte } from "./PieDeReporte";
import { COLOR_FAMILIA, RosaDeEstilo } from "./RosaDeEstilo";
import { numberLocale, t, tf } from "@/lib/i18n";
import { useEstilos } from "./useEstilos";
import {
  FAMILIAS,
  METRICAS_ESTILO,
  cabezaACabeza,
  equiposParecidos,
  parecidoDeEstilo,
  perfilesDeEstilo,
  EQUIPO_PROPIO,
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

export function EstiloPage({ equipoPropio = EQUIPO_PROPIO, destinatario = "", logoDestinatario = "" }: {
  /** El equipo con el que se mide el encaje. En el espacio de Cavalry, Cavalry. */
  equipoPropio?: string;
  destinatario?: string;
  logoDestinatario?: string;
}) {
  const { filas, cargando, mensaje: estado, recargar } = useEstilos();
  const [clave, setClave] = useState("");
  const [claveRival, setClaveRival] = useState("");
  const [metricaTop, setMetricaTop] = useState("contragolpe");

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

  const opcionesDeEquipo = porCompeticion.map(([competicion, lista]) => (
    <optgroup key={competicion} label={competicion}>
      {lista.map((perfil) => <option key={perfil.clave} value={perfil.clave}>{perfil.equipo}</option>)}
    </optgroup>
  ));

  return <section className="estilo-page">
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
          <Desplegable etiqueta={t("Equipo")} valor={elegido.equipo} activo={false}>
            <select aria-label={t("Equipo")} value={elegido.clave} onChange={(evento) => { setClave(evento.target.value); setClaveRival(""); }}>
              {opcionesDeEquipo}
            </select>
          </Desplegable>
          <Desplegable etiqueta={t("Comparar con")} valor={rival?.equipo ?? t("Nadie")} activo={Boolean(claveRival)}>
            <select aria-label={t("Comparar con")} value={rival?.clave ?? ""} onChange={(evento) => setClaveRival(evento.target.value)}>
              {opcionesDeEquipo}
            </select>
          </Desplegable>
        </div>
      </div>
      {estado && <p className="estilo-estado" role="status">{estado}</p>}

      <div className="estilo-grid">
        <div className="estilo-lado">
          <div className="estilo-ficha">
            <b>{elegido.equipo}</b>
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
            return <section key={familia.id} className="estilo-familia">
              <h3><i style={{ background: COLOR_FAMILIA[familia.id] }} />{t(familia.nombre)}{deSkillcorner && <em>SkillCorner</em>}</h3>
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
            {/* Una sola rosa: StatsBomb y, si el equipo lo tiene, SkillCorner
                a continuación. Separadas obligaban a ir y venir entre pestañas
                para leer un mismo equipo. */}
            <RosaDeEstilo perfil={elegido} rival={rival} />
            <figcaption>
              <span><i className={elegido.conSkillcorner ? "relleno con-sc" : "relleno"} />{elegido.equipo}</span>
              {rival && <span><i className="contorno" />{rival.equipo}</span>}
              <small>{elegido.conSkillcorner
                ? t("StatsBomb y SkillCorner juntos. Largo de cada cuña: percentil. Anillo discontinuo: la mediana.")
                : t("Largo de cada cuña: percentil. Anillo discontinuo: la mediana.")}</small>
            </figcaption>
          </figure>

          <section className="estilo-bloque">
            <h3>{tf("Juegan como {equipo}", { equipo: elegido.equipo })}</h3>
            <ol className="rank-list estilo-lista">
              {parecidos.map(({ perfil, parecido, conSkillcorner }, posicion) => (
                <li key={perfil.clave} className={perfil.clave === rival?.clave ? "clicable activa" : "clicable"}
                  role="button" tabIndex={0} aria-pressed={perfil.clave === rival?.clave}
                  onClick={() => setClaveRival(perfil.clave)}
                  onKeyDown={(evento) => { if (evento.key === "Enter" || evento.key === " ") { evento.preventDefault(); setClaveRival(perfil.clave); } }}>
                  <span className={posicion < 3 ? "rank-pos podio" : "rank-pos"}>{posicion + 1}</span>
                  <span className="pool-cuerpo"><b>{perfil.equipo}</b><small>{perfil.competicion}</small></span>
                  <span className="pool-cifras"><b>{parecido.toFixed(1)}</b><small>{Number.isFinite(conSkillcorner) ? tf("con SkillCorner {n}", { n: conSkillcorner.toFixed(1) }) : t("parecido")}</small></span>
                  <span />
                </li>
              ))}
            </ol>
          </section>

          {rival && <section className="estilo-bloque">
            <h3>{tf("Cara a cara: {a} y {b}", { a: elegido.equipo, b: rival.equipo })}</h3>
            <ol className="estilo-duelo">
              {duelo.map(({ metrica, za, zb, lider, diferencia }) => (
                <li key={metrica.id}>
                  <span className="estilo-metrica"><i style={{ background: COLOR_FAMILIA[metrica.familia] }} />{t(metrica.etiqueta)}</span>
                  <span className={lider === "a" ? "estilo-lider a" : "estilo-lider b"}>{lider === "a" ? elegido.equipo : rival.equipo}</span>
                  <span className="estilo-dif">{`+${diferencia.toFixed(2)}`}</span>
                  <small className="estilo-dos">{`${conSigno(za)} / ${conSigno(zb)}`}</small>
                </li>
              ))}
            </ol>
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
                  <span className="pool-cuerpo"><b>{perfil.equipo}</b><small>{perfil.competicion}</small></span>
                  <span className="pool-cifras"><b>{formatear(metricaElegida, perfil.valores[metricaElegida.id].bruto)}</b><small>{`z ${conSigno(perfil.valores[metricaElegida.id].z)}`}</small></span>
                  <span />
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      <PieDeReporte asunto={rival ? `${elegido.equipo} · ${rival.equipo}` : elegido.equipo} destinatario={destinatario} logo={logoDestinatario} />
    </>}
  </section>;
}
