"use client";

import { t, tf } from "@/lib/i18n";
import { METRIC_SOURCE_COLORS } from "@/lib/similarityMetricGroups";
import { LOGOS_PLATAFORMA, LogoPlataforma } from "./LogosPlataforma";
import { useBaseActiva } from "./BaseActiva";
import { FileSpreadsheet, Merge, Sparkles, Upload } from "./Icons";

/**
 * La base activa: qué hay cargado y cómo cambiarlo.
 *
 * Cargar ligas estaba repartido en tres sitios que hacían cosas distintas —la
 * portada montaba una base nueva, "Conectar API" añadía una competición y
 * "Reemplazar archivos" sustituía todo— y ninguno enseñaba lo que ya había.
 * Para saber qué estabas mirando tenías que deducirlo de una barra de chips.
 * Aquí se ve el inventario y se sale a cualquiera de las tres acciones.
 */

export function DatosPage({ cargando, onCargarTodo, onSubirArchivo, onConectarApi }: {
  cargando?: boolean;
  onCargarTodo: () => void;
  onSubirArchivo: () => void;
  onConectarApi: () => void;
}) {
  const { rows, competiciones, datasets, nombre } = useBaseActiva();

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

      <div className="datos-lista">
        <span className="datos-lista-titulo">{tf("Lo que hay cargado · {nombre}", { nombre })}</span>
        <table>
          <thead><tr><th>{t("Competición")}</th><th>{t("Año")}</th><th>{t("Procedencia")}</th></tr></thead>
          <tbody>
            {competiciones.map((c) => (
              <tr key={`${c.liga}-${c.anio}`}>
                <td>{c.liga}</td>
                <td>{c.anio || "—"}</td>
                <td className="datos-origen">
                  {c.archivos.map((archivo) => {
                    const proveedor = /^SkillCorner/i.test(archivo) ? "skillcorner"
                      : /^StatsBomb/i.test(archivo) ? "statsbomb" : "wyscout";
                    return <LogoPlataforma key={archivo} plataforma={proveedor} alto={12} />;
                  })}
                </td>
              </tr>
            ))}
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
