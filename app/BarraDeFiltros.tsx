"use client";

import type { ReactNode } from "react";
import { PERFILES_FILTRO } from "@/lib/perfiles";
import { t, tf } from "@/lib/i18n";
import { useBaseActiva } from "./BaseActiva";
import { ChevronDown } from "./Icons";
import { MenuDeLigas } from "./MenuDesplegable";

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
 *
 * La forma. Era una rejilla de cajas iguales, cada una con una etiqueta en
 * versalitas de 7,5 px encima: un formulario, con mucha tinta para poca
 * información, y en la columna estrecha de la ficha se partía en dos columnas
 * que rompían el ritmo. Ahora cada filtro es una ficha que dice lo que tiene
 * puesto —"Puesto: Centrales"— y ocupa lo que ocupa su contenido. Las que
 * están filtrando se tiñen del acento, así que se ve de un vistazo QUÉ está
 * acotando la lista sin leer ninguna.
 */

export type CampoDeFiltro = "liga" | "anio" | "puesto" | "equipo" | "pasaporte" | "minutos" | "edad";

const TODOS: CampoDeFiltro[] = ["liga", "anio", "puesto", "equipo", "pasaporte", "minutos", "edad"];

/**
 * Una ficha que abre un desplegable.
 *
 * El `<select>` de verdad va encima, invisible y del tamaño de la ficha. Así
 * se pulsa en cualquier parte y sale el selector del sistema —la rueda en el
 * móvil, el menú nativo en el escritorio— con el teclado y el lector de
 * pantalla funcionando sin reinventar nada. Lo que se ve es solo el dibujo.
 *
 * Se exporta porque Similitud y Contexto tienen controles propios que no son
 * filtros de mercado —rol secundario, lado, cohorte— y deben verse igual que
 * estos: una ficha es una ficha en toda la plataforma.
 */
export function Desplegable({ etiqueta, valor, activo, apagado, aviso, children }: {
  etiqueta: string;
  valor: string;
  activo: boolean;
  apagado?: boolean;
  /** Por qué está apagado, cuando lo está. */
  aviso?: string;
  children: ReactNode;
}) {
  const clases = ["filtro-chip", activo ? "activo" : "", apagado ? "apagado" : ""].filter(Boolean).join(" ");
  return <label className={clases} title={aviso}>
    <span aria-hidden="true">{etiqueta}</span>
    <b aria-hidden="true">{valor}</b>
    <ChevronDown size={12} />
    {children}
  </label>;
}

export function BarraDeFiltros({ campos = TODOS, resultado, accesorio }: {
  campos?: CampoDeFiltro[];
  /** Cuántos quedan tras filtrar, para que el número no haya que buscarlo. */
  resultado?: number;
  /**
   * Una acción que va al final de la fila, junto al recuento: exportar, por
   * ejemplo. Ahí se lee como "haz esto con estos N", que es lo que hace.
   */
  accesorio?: ReactNode;
}) {
  const { filtros, cambiarFiltros, limpiarFiltros, filtrosActivos, opciones, rows } = useBaseActiva();
  if (!rows.length) return null;
  const muestra = (campo: CampoDeFiltro) => campos.includes(campo);
  const nombreDelPuesto = PERFILES_FILTRO.find((perfil) => perfil.id === filtros.puesto)?.nombre;
  const hayPasaportes = opciones.pasaportes.length > 0;

  return <div className="filtros-barra" role="group" aria-label={t("Filtros")}>
    <div className="filtros-chips">
      {muestra("liga") && opciones.ligas.length > 1 && <MenuDeLigas
        ligas={opciones.ligas} elegida={filtros.liga} onElegir={(liga) => cambiarFiltros({ liga })} />}

      {muestra("anio") && opciones.anios.length > 1 && <Desplegable
        etiqueta={t("Año")}
        valor={filtros.anio ? String(filtros.anio) : t("Todos")}
        activo={Boolean(filtros.anio)}>
        <select aria-label={t("Año")} value={filtros.anio || ""} onChange={(e) => cambiarFiltros({ anio: Number(e.target.value) })}>
          <option value="">{t("Todos")}</option>
          {opciones.anios.map((anio) => <option key={anio} value={anio}>{anio}</option>)}
        </select>
      </Desplegable>}

      {muestra("puesto") && <Desplegable
        etiqueta={t("Puesto")}
        valor={nombreDelPuesto ? t(nombreDelPuesto) : t("Todos")}
        activo={Boolean(filtros.puesto)}>
        <select aria-label={t("Puesto")} value={filtros.puesto} onChange={(e) => cambiarFiltros({ puesto: e.target.value })}>
          <option value="">{t("Todos")}</option>
          {PERFILES_FILTRO.map((perfil) => <option key={perfil.id} value={perfil.id}>{t(perfil.nombre)}</option>)}
        </select>
      </Desplegable>}

      {muestra("equipo") && <Desplegable
        etiqueta={t("Equipo")}
        valor={filtros.equipo === "TODOS" ? t("Todos") : filtros.equipo}
        activo={filtros.equipo !== "TODOS"}>
        <select aria-label={t("Equipo")} value={filtros.equipo} onChange={(e) => cambiarFiltros({ equipo: e.target.value })}>
          <option value="TODOS">{t("Todos")}</option>
          {opciones.equipos.map((equipo) => <option key={equipo} value={equipo}>{equipo}</option>)}
        </select>
      </Desplegable>}

      {muestra("pasaporte") && <Desplegable
        etiqueta={t("Pasaporte")}
        valor={!hayPasaportes ? "—" : filtros.pasaporte === "TODOS" ? t("Todos") : filtros.pasaporte}
        activo={hayPasaportes && filtros.pasaporte !== "TODOS"}
        apagado={!hayPasaportes}
        aviso={hayPasaportes ? undefined : t("La base no trae nacionalidad")}>
        <select aria-label={t("Pasaporte")} value={filtros.pasaporte} disabled={!hayPasaportes}
          onChange={(e) => cambiarFiltros({ pasaporte: e.target.value })}>
          {hayPasaportes
            ? <>
              <option value="TODOS">{t("Todos")}</option>
              {opciones.pasaportes.map((x) => <option key={x} value={x}>{x}</option>)}
            </>
            : <option value="TODOS">{t("La base no trae nacionalidad")}</option>}
        </select>
      </Desplegable>}

      {/* Los dos numéricos llevan el campo dentro de la ficha. El de minutos
          no se tiñe nunca: no es un filtro de mercado sino quién cuenta como
          comparable, y "Quitar filtros" no lo toca, así que teñirlo prometería
          algo que el botón no cumple. */}
      {muestra("minutos") && <label className="filtro-chip numero">
        <span>{t("Mín. minutos")}</span>
        <input type="number" min="0" step="100" inputMode="numeric" value={filtros.minutosMin}
          onChange={(e) => cambiarFiltros({ minutosMin: Number(e.target.value) })} />
      </label>}

      {muestra("edad") && <label className={filtros.edadMax > 0 ? "filtro-chip numero activo" : "filtro-chip numero"}>
        <span>{t("Edad máxima")}</span>
        <input type="number" min="0" max="45" inputMode="numeric" value={filtros.edadMax || ""} placeholder="—"
          onChange={(e) => cambiarFiltros({ edadMax: Number(e.target.value) })} />
      </label>}
    </div>

    <div className="filtros-barra-cola">
      {resultado !== undefined && <b>{tf("{n} jugadores", { n: resultado })}</b>}
      {filtrosActivos > 0 && <button type="button" onClick={limpiarFiltros}>
        {filtrosActivos === 1 ? t("Quitar el filtro") : tf("Quitar los {n} filtros", { n: filtrosActivos })}
      </button>}
      {accesorio}
    </div>
  </div>;
}
