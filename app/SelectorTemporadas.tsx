"use client";

import { useId } from "react";
import { Plus, X } from "./Icons";
import { numberLocale, t } from "@/lib/i18n";
import type { OpcionDeTemporada } from "@/lib/temporadasDeFicha";

/**
 * Las temporadas añadidas a mano (sin métricas): cuáles se enseñan en la
 * ficha, quitarlas y añadir otras. Qué temporadas entran en el radar se
 * contesta junto a la ficha (PeriodoDelJugador).
 */
export function SelectorTemporadas({ opciones, seleccion, deshabilitado, onAlternar, onQuitar, onAnadir }: {
  opciones: OpcionDeTemporada[];
  seleccion: string[];
  deshabilitado: boolean;
  onAlternar: (clave: string) => void;
  onQuitar: (id: string) => void;
  onAnadir: () => void;
}) {
  const ayudaId = useId();
  const elegidas = new Set(seleccion);

  return <fieldset className="field-group temporada-previa temporadas-incluidas" disabled={deshabilitado} aria-describedby={ayudaId}>
    <legend className="field-label">{t("Otras temporadas")}</legend>
    <small className="temporada-previa-nota" id={ayudaId}>{t("Las que no están en las bases cargadas: cárgalas de StatsBomb o añádelas a mano. Las de a mano salen en la ficha, pero no en el radar.")}</small>
    {opciones.length > 0 && <div className="temporadas-incluidas-lista">
      {opciones.map(({ clave, temporada }) => <div className="temporadas-incluidas-fila" key={clave}>
        <label className="temporadas-incluidas-opcion">
          <input type="checkbox" checked={elegidas.has(clave)} onChange={() => onAlternar(clave)} />
          <span>
            {`${temporada.etiqueta} · ${temporada.ligas.join(", ")} · ${temporada.equipo} · ${temporada.minutos.toLocaleString(numberLocale())}′`}
            {temporada.aMano && <small className="temporadas-incluidas-manual" title={t("Añadida a mano: sin métricas, no entra en el radar.")}>{t("a mano · fuera del radar")}</small>}
          </span>
        </label>
        {temporada.aMano && <button type="button" className="temporadas-incluidas-quitar" title={t("Quitar esta temporada")} aria-label={t("Quitar esta temporada")}
          onClick={() => onQuitar(temporada.aMano!.id)}><X size={13} /></button>}
      </div>)}
    </div>}
    <div className="temporadas-incluidas-acciones">
      <button type="button" className="button secondary compact" onClick={onAnadir}><Plus size={13} />{t("Añadir otra temporada")}</button>
    </div>
  </fieldset>;
}
