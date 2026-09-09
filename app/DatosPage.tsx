"use client";

import { t, tf } from "@/lib/i18n";
import { METRIC_SOURCE_COLORS } from "@/lib/similarityMetricGroups";
import { LOGOS_PLATAFORMA, LogoPlataforma } from "./LogosPlataforma";
import { useBaseActiva } from "./BaseActiva";
import { FileSpreadsheet, Merge, Sparkles, Trash, Upload } from "./Icons";
import { Interruptor } from "./Interruptor";

/**
 * La base activa: qué hay cargado y cómo cambiarlo.
 *
 * Cargar ligas estaba repartido en tres sitios que hacían cosas distintas —la
 * portada montaba una base nueva, "Conectar API" añadía una competición y
 * "Reemplazar archivos" sustituía todo— y ninguno enseñaba lo que ya había.
 * Para saber qué estabas mirando tenías que deducirlo de una barra de chips.
 * Aquí se ve el inventario y se sale a cualquiera de las tres acciones.
 */

export function DatosPage({
  cargando, onCargarTodo, onSubirArchivo, onConectarApi,
  onQuitarCompeticion, apagadas = [], onAlternarCompeticion,
  onCargarAnio, aniosDisponibles = [],
}: {
  cargando?: boolean;
  onCargarTodo: () => void;
  onSubirArchivo: () => void;
  onConectarApi: () => void;
  /** Sacar una competición de la base. Recibe sus archivos: una liga son una
   *  o dos bases, la de StatsBomb y su capa de SkillCorner. */
  onQuitarCompeticion?: (archivos: string[]) => void;
  /** Archivos apagados: siguen descargados pero fuera del cruce. */
  apagadas?: string[];
  onAlternarCompeticion?: (archivos: string[], encender: boolean) => void;
  /** Traer una temporada entera y sumarla a lo que ya hay. */
  onCargarAnio?: (anio: string) => void;
  aniosDisponibles?: string[];
}) {
  const { rows, competiciones, datasets, nombre } = useBaseActiva();

  const aniosDelFondo = [...new Set(competiciones.map((c) => c.anio).filter(Boolean))].sort();
  const plataformas = (["wyscout", "statsbomb", "skillcorner"] as const)
    .filter((p) => datasets.some((d) => (d.provider ?? "wyscout") === p));

  return <section className="datos-page">
    <header>
      <h2>{t("Base activa")}</h2>
      <p>{t("Todo lo que se carga entra aquí, y todas las pestañas trabajan sobre esto mismo. Cargar ligas se hace en este sitio y en ninguno más.")}</p>
    </header>

    {rows.length > 0 ? <>
      <div className="datos-resumen">
        <div className="datos-cifra"><b>{rows.length.toLocaleString("es")}</b><span>{t("jugadores")}</span></div>
        <div className="datos-cifra"><b>{competiciones.length || datasets.length}</b><span>{t("competiciones")}</span></div>
        <div className="datos-cifra"><b>{datasets.length}</b><span>{t("bases cruzadas")}</span></div>
        <div className="datos-plataformas">
          {plataformas.map((p) => <span key={p} className={`datos-chip on ${p}`}>
            <LogoPlataforma plataforma={p} alto={12} conTexto={!LOGOS_PLATAFORMA[p].esLogotipo} />
            {!LOGOS_PLATAFORMA[p].esLogotipo && METRIC_SOURCE_COLORS[p].label}
          </span>)}
        </div>
      </div>

      {/* Los años: encender y apagar los que ya están, y pedir otro entero.
          Comparar a un jugador con su versión del año pasado necesita las dos
          temporadas dentro, y hasta ahora solo entraba la del curso. */}
      <div className="datos-anios">
        <span className="datos-lista-titulo">{t("Años")}</span>
        <div className="datos-anios-fila">
          {aniosDelFondo.map((anio) => {
            const suyas = competiciones.filter((c) => c.anio === anio);
            const encendido = suyas.some((c) => !c.archivos.every((a) => apagadas.includes(a)));
            return <button key={anio} type="button"
              className={encendido ? "datos-anio on" : "datos-anio"}
              disabled={!onAlternarCompeticion}
              title={tf("Usar las competiciones de {anio}", { anio })}
              onClick={() => onAlternarCompeticion?.(suyas.flatMap((c) => c.archivos), !encendido)}>
              {anio}<small>{suyas.length === 1 ? tf("{n} liga", { n: suyas.length }) : tf("{n} ligas", { n: suyas.length })}</small>
            </button>;
          })}
          {onCargarAnio && aniosDisponibles.filter((a) => !aniosDelFondo.includes(Number(a))).map((anio) => (
            <button key={anio} type="button" className="datos-anio nuevo" disabled={cargando}
              title={tf("Cargar todas las ligas de {anio} y sumarlas", { anio })}
              onClick={() => onCargarAnio(anio)}>
              + {anio}
            </button>
          ))}
        </div>
      </div>

      <div className="datos-lista">
        <span className="datos-lista-titulo">{tf("Lo que hay cargado · {nombre}", { nombre })}</span>
        <p className="datos-lista-ayuda">{t("El interruptor deja una liga fuera de los cálculos sin perderla: se vuelve a encender sin descargarla otra vez. Quitar la saca del todo.")}</p>
        <table>
          <thead><tr><th>{t("En uso")}</th><th>{t("Competición")}</th><th>{t("Año")}</th><th>{t("Procedencia")}</th><th /></tr></thead>
          <tbody>
            {competiciones.map((c) => {
              const encendida = !c.archivos.every((archivo) => apagadas.includes(archivo));
              return <tr key={`${c.liga}-${c.anio}`} className={encendida ? "" : "apagada"}>
                <td className="datos-encendido">
                  {onAlternarCompeticion && <Interruptor
                    activo={encendida}
                    onCambio={(on) => onAlternarCompeticion(c.archivos, on)}
                    titulo={tf("Usar {liga} en los cálculos", { liga: c.liga })}
                  />}
                </td>
                <td>{c.liga}</td>
                <td>{c.anio || "—"}</td>
                <td className="datos-origen">
                  {c.archivos.map((archivo) => {
                    const proveedor = /^SkillCorner/i.test(archivo) ? "skillcorner"
                      : /^StatsBomb/i.test(archivo) ? "statsbomb" : "wyscout";
                    return <LogoPlataforma key={archivo} plataforma={proveedor} alto={12} />;
                  })}
                </td>
                <td className="datos-quitar">
                  {onQuitarCompeticion && competiciones.length > 1 && <button type="button"
                    title={tf("Quitar {liga} de la base", { liga: c.liga })}
                    onClick={() => onQuitarCompeticion(c.archivos)}>
                    <Trash size={13} /><span>{t("Quitar")}</span>
                  </button>}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </> : <p className="datos-vacio">{t("No hay nada cargado todavía. Elige una de las tres opciones de abajo.")}</p>}

    <div className="datos-acciones">
      <button type="button" className="datos-accion destacada" disabled={cargando} onClick={onCargarTodo}>
        <span className="datos-accion-icono"><Sparkles size={22} /></span>
        <b>{t("Cargar todas las ligas")}</b>
        <small>{t("Todas las competiciones de la temporada en curso, con los datos físicos de SkillCorner encima donde existan. Reemplaza lo que haya.")}</small>
      </button>
      <button type="button" className="datos-accion" disabled={cargando} onClick={onConectarApi}>
        <span className="datos-accion-icono"><Merge size={22} /></span>
        <b>{t("Añadir una competición")}</b>
        <small>{t("Una liga y una temporada concretas de StatsBomb o SkillCorner, encima de lo que ya tienes o como base nueva.")}</small>
      </button>
      <button type="button" className="datos-accion" disabled={cargando} onClick={onSubirArchivo}>
        <span className="datos-accion-icono"><FileSpreadsheet size={22} /></span>
        <b>{t("Subir un archivo de Wyscout")}</b>
        <small>{t("Para las ligas que no están en la API. Puedes elegir varios y se combinan solos.")}</small>
      </button>
    </div>

    {cargando && <p className="datos-cargando"><Upload size={13} /> {t("Cargando…")}</p>}
  </section>;
}
