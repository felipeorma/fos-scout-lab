"use client";

import { PERFILES_FILTRO } from "@/lib/perfiles";
import { t, tf } from "@/lib/i18n";
import { useBaseActiva } from "./BaseActiva";

/**
 * La red de filtros, una sola para toda la plataforma.
 *
 * Cada pantalla tenía la suya y habían crecido por separado: el ranking con
 * siete filtros y contexto con dos, de modo que la misma pregunta daba
 * respuestas distintas según la pestaña. Ahora es este componente en todas, y
 * lo que se elige aquí sigue puesto al cambiar de sección.
 *
 * `campos` permite ocultar los que una pantalla no puede honrar —el ranking ya
 * elige el puesto por su cuenta, así que ahí sobra— pero no permite añadir
 * ninguno: si aparece un filtro nuevo, aparece para todas.
 */

export type CampoDeFiltro = "liga" | "anio" | "puesto" | "equipo" | "pasaporte" | "minutos" | "edad";

const TODOS: CampoDeFiltro[] = ["liga", "anio", "puesto", "equipo", "pasaporte", "minutos", "edad"];

export function BarraDeFiltros({ campos = TODOS, resultado }: {
  campos?: CampoDeFiltro[];
  /** Cuántos quedan tras filtrar, para que el número no haya que buscarlo. */
  resultado?: number;
}) {
  const { filtros, cambiarFiltros, limpiarFiltros, filtrosActivos, opciones, rows } = useBaseActiva();
  if (!rows.length) return null;
  const muestra = (campo: CampoDeFiltro) => campos.includes(campo);

  return <div className="filtros-barra">
    {muestra("liga") && opciones.ligas.length > 1 && <label>
      <span>{t("Liga")}</span>
      <select value={filtros.liga} onChange={(e) => cambiarFiltros({ liga: e.target.value })}>
        <option value="TODAS">{t("Todas")}</option>
        {opciones.ligas.map((liga) => <option key={liga} value={liga}>{liga}</option>)}
      </select>
    </label>}

    {muestra("anio") && opciones.anios.length > 1 && <label>
      <span>{t("Año")}</span>
      <select value={filtros.anio || ""} onChange={(e) => cambiarFiltros({ anio: Number(e.target.value) })}>
        <option value="">{t("Todos")}</option>
        {opciones.anios.map((anio) => <option key={anio} value={anio}>{anio}</option>)}
      </select>
    </label>}

    {muestra("puesto") && <label>
      <span>{t("Puesto")}</span>
      <select value={filtros.puesto} onChange={(e) => cambiarFiltros({ puesto: e.target.value })}>
        <option value="">{t("Todos")}</option>
        {PERFILES_FILTRO.map((perfil) => <option key={perfil.id} value={perfil.id}>{t(perfil.nombre)}</option>)}
      </select>
    </label>}

    {muestra("equipo") && <label>
      <span>{t("Equipo")}</span>
      <select value={filtros.equipo} onChange={(e) => cambiarFiltros({ equipo: e.target.value })}>
        <option value="TODOS">{t("Todos")}</option>
        {opciones.equipos.map((equipo) => <option key={equipo} value={equipo}>{equipo}</option>)}
      </select>
    </label>}

    {muestra("pasaporte") && <label>
      <span>{t("Pasaporte")}</span>
      <select value={filtros.pasaporte} disabled={!opciones.pasaportes.length}
        onChange={(e) => cambiarFiltros({ pasaporte: e.target.value })}>
        {opciones.pasaportes.length
          ? <>
            <option value="TODOS">{t("Todos")}</option>
            {opciones.pasaportes.map((x) => <option key={x} value={x}>{x}</option>)}
          </>
          : <option value="TODOS">{t("La base no trae nacionalidad")}</option>}
      </select>
    </label>}

    {muestra("minutos") && <label>
      <span>{t("Mín. minutos")}</span>
      <input type="number" min="0" step="100" value={filtros.minutosMin}
        onChange={(e) => cambiarFiltros({ minutosMin: Number(e.target.value) })} />
    </label>}

    {muestra("edad") && <label>
      <span>{t("Edad máxima")}</span>
      <input type="number" min="0" max="45" value={filtros.edadMax || ""} placeholder="—"
        onChange={(e) => cambiarFiltros({ edadMax: Number(e.target.value) })} />
    </label>}

    <div className="filtros-barra-cola">
      {resultado !== undefined && <b>{tf("{n} jugadores", { n: resultado })}</b>}
      {filtrosActivos > 0 && <button type="button" onClick={limpiarFiltros}>
        {filtrosActivos === 1 ? t("Quitar el filtro") : tf("Quitar los {n} filtros", { n: filtrosActivos })}
      </button>}
    </div>
  </div>;
}
