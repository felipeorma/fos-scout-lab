"use client";

import { useId } from "react";
import { Plus, X } from "./Icons";
import { numberLocale, t } from "@/lib/i18n";
import type { OpcionDeTemporada } from "@/lib/temporadasDeFicha";

/** Las temporadas que se incluyen en la ficha y, cuando tienen métricas, en el radar. */
export function SelectorTemporadas({ opciones, seleccion, deshabilitado, onAlternar, onQuitar, onSoloActual, onAnadir }: {
  opciones: OpcionDeTemporada[];
  seleccion: string[];
  deshabilitado: boolean;
  onAlternar: (clave: string) => void;
  onQuitar: (id: string) => void;
  onSoloActual: () => void;
  onAnadir: () => void;
}) {
  const ayudaId = useId();
  const elegidas = new Set(seleccion);

  return <fieldset className="field-group temporada-previa temporadas-incluidas" disabled={deshabilitado} aria-describedby={ayudaId}>
    <legend className="field-label">{t("Temporadas anteriores")}</legend>
    <small className="temporada-previa-nota" id={ayudaId}>{t("Puedes incluir varias temporadas y añadir otras ligas del mismo año en cada una.")}</small>
    {opciones.length > 0 && <div className="temporadas-incluidas-lista">
      {opciones.map(({ clave, temporada }) => <div className="temporadas-incluidas-fila" key={clave}>
        <label className="temporadas-incluidas-opcion">
          <input type="checkbox" checked={elegidas.has(clave)} onChange={() => onAlternar(clave)} />
          <span>
            {`${temporada.etiqueta} · ${temporada.ligas.join(", ")} · ${temporada.equipo} · ${temporada.minutos.toLocaleString(numberLocale())}′`}
            {temporada.aMano && <small className="temporadas-incluidas-manual">{t("añadida a mano")}</small>}
          </span>
        </label>
        {temporada.aMano && <button type="button" className="temporadas-incluidas-quitar" title={t("Quitar esta temporada")} aria-label={t("Quitar esta temporada")}
          onClick={() => onQuitar(temporada.aMano!.id)}><X size={13} /></button>}
      </div>)}
    </div>}
    <div className="temporadas-incluidas-acciones">
      <button type="button" className="button secondary compact" onClick={onSoloActual}>{t("Solo la temporada actual")}</button>
      <button type="button" className="button secondary compact" onClick={onAnadir}><Plus size={13} />{t("Añadir otra temporada")}</button>
    </div>
  </fieldset>;
}
